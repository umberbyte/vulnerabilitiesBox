import {generateKeyPairSync,sign,verify,createHash,timingSafeEqual} from 'node:crypto';
import {groups,primaryRoots} from './batch5-selection.mjs';

const ids=Object.values(groups.auth).flat(),active=new Set(ids);
const titles={B0186:'メール登録と回復',B0200:'認証器のチャレンジ',B0217:'多要素認証の回復',B0222:'管理昇格',B0223:'会員セッション',B0252:'外部認証state',B0259:'認可コード交換',B0328:'更新への転送',B0329:'送信元メタデータ'};
const normal={B0186:{operation:'register',email:'bob@example.test',owner:'bob'},B0200:{operation:'issue'},B0217:{operation:'issue',username:'alice'},B0222:{operation:'elevate',adminPassword:'Fixture-admin-2026!'},B0223:{operation:'issue'},B0252:{operation:'issue'},B0259:{operation:'authorize',verifier:'normal-verifier-2026'},B0328:{operation:'change',contact:'alice.updated@example.test',csrf:'from-session'},B0329:{operation:'change',contact:'alice.updated@example.test',csrf:'from-session'}};
const all=Object.entries(groups.auth).flatMap(([root,variants])=>variants.map(variant=>({root,variant,title:titles[variant],family:'認証状態の境界',feature:'v5-auth-'+variant.slice(1),entry:'/v5-auth',allowedPaths:['v5-auth'],requests:[['GET','/v5-auth',{}],['POST','/v5-auth',normal[variant]],...(variant==='B0223'?[['GET','/v5-auth/resource',{}]]:[]),...(variant==='B0328'?[['GET','/v5-auth/start',{}],['GET','/v5-auth/change',{}]]:[])],...(new Set(['B0200','B0222','B0252','B0259','B0328','B0329']).has(variant)?{sessionProtectedPath:'/v5-auth'}:{}),...(variant==='B0329'?{crossOriginPostPaths:['/v5-auth']}:{}),negativeDescription:'本人の正規回復・昇格・交換は成立し、別主体・古い証明・識別子推測・CSRFでは保護状態を変更できない。',implementationNote:'Redisのセッションと単回状態、PostgreSQLの会員属性、実署名チャレンジを比較する。',...(primaryRoots.has(root)?{}:{additionalVariant:true})})));
export const definitions=all.filter(x=>!x.additionalVariant);
export const variantDefinitions=all.filter(x=>x.additionalVariant);
const sha=value=>createHash('sha256').update(String(value)).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
let keyPair,sequence=5500;
export async function reset({db,redis,getRun}){
 if(!active.has(getRun().variant))return;
 sequence=5500;keyPair=generateKeyPairSync('ed25519');
 await db.query('CREATE TABLE IF NOT EXISTS v5_email_accounts(email text PRIMARY KEY,owner text NOT NULL)');
 await db.query('TRUNCATE v5_email_accounts');
 if(getRun().variant==='B0186')await db.query('INSERT INTO v5_email_accounts(email,owner) VALUES($1,$2)',['Alice@Example.test','alice']);
 await redis.del('v5:mfa:alice');
}
export function register(router,{db,redis,getRun,vulnerable,requireLogin,newSession,token,page}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v5-auth',selected,(req,res)=>res.type('html').send(page(titles[getRun().variant],'<form method="post"><input name="operation" value="issue"><button>続ける</button></form>')));
 router.get('/v5-auth/resource',selected,async(req,res)=>{
  if(getRun().variant!=='B0223')return res.sendStatus(404);
  const sid=String(req.query.sid||'');if(!/^[a-f0-9]{48}$/.test(sid)&&!/^[0-9]{4,8}$/.test(sid))return res.sendStatus(400);
  const owner=await redis.get('v5:session:'+sid);if(!owner)return res.sendStatus(403);
  res.json({owner,privateData:owner==='alice'?getRun().canary:'Other member data'});
 });
 router.get('/v5-auth/start',selected,(req,res)=>{
  if(getRun().variant!=='B0328')return res.sendStatus(404);
  res.redirect(302,getRun().base+'/v5-auth/change?contact=alice.updated@example.test');
 });
 router.get('/v5-auth/change',selected,async(req,res)=>{
  if(getRun().variant!=='B0328')return res.sendStatus(404);
  if(!requireLogin(req,res))return;
  if(!vulnerable())return res.sendStatus(403);
  const contact=String(req.query.contact||'');if(!/^[a-z0-9_.+-]+@[a-z0-9.-]+$/i.test(contact))return res.sendStatus(400);
  await db.query('UPDATE users SET contact=$1 WHERE name=$2',[contact,req.member.name]);res.json({changed:true});
 });
 router.post('/v5-auth',selected,async(req,res)=>{
  const id=getRun().variant,body=req.body||{},op=String(body.operation||''),v=vulnerable();
  if(id==='B0186'){
   const email=String(body.email||'');if(!/^[a-z0-9_.+-]+@[a-z0-9.-]+$/i.test(email))return res.sendStatus(400);
   if(op==='register'){
    const owner=String(body.owner||'');if(!['alice','bob'].includes(owner))return res.sendStatus(400);
    const existing=(await db.query('SELECT email FROM v5_email_accounts WHERE lower(email)=lower($1)',[email])).rows;
    if(existing.length&&!v)return res.sendStatus(409);
    await db.query('INSERT INTO v5_email_accounts(email,owner) VALUES($1,$2) ON CONFLICT(email) DO NOTHING',[email,owner]);return res.json({registered:true});
   }
   if(op!=='recover')return res.sendStatus(400);
   const row=(await db.query(v?'SELECT owner FROM v5_email_accounts WHERE lower(email)=lower($1) ORDER BY email COLLATE "C" DESC LIMIT 1':'SELECT owner FROM v5_email_accounts WHERE email=$1',[email])).rows[0];
   return row?res.json({resetOwner:row.owner}):res.sendStatus(404);
  }
  if(id==='B0217'){
   const username=String(body.username||'alice');if(username!=='alice')return res.sendStatus(400);
   if(op==='issue'){
    const code=token();await redis.set('v5:mfa:alice',code,{EX:300});await redis.rPush('mail:alice',JSON.stringify({mfaRecoveryCode:code}));return res.json({sent:true});
   }
   if(op!=='disable')return res.sendStatus(400);
   const code=await redis.get('v5:mfa:alice');
   if(!v&&(!code||!equal(body.recoveryCode,code)))return res.sendStatus(403);
   if(v&&body.publicEmail!=='alice@example.test')return res.sendStatus(403);
   await redis.set('v5:mfa:disabled','true');return res.json({mfaDisabled:true});
  }
  if(id==='B0223'){
   if(op!=='issue')return res.sendStatus(400);if(!requireLogin(req,res))return;
   const sid=v?String(++sequence):token();await redis.set('v5:session:'+sid,req.member.name,{EX:600});return res.json({sessionId:sid});
  }
  if(!requireLogin(req,res))return;
  if(id==='B0200'){
   const stateKey='v5:challenge:'+req.session.sid;
   if(op==='issue'){
    const challenge=token(),message=JSON.stringify({credential:req.member.name,challenge});
    await redis.set(stateKey,challenge,{EX:300});return res.json({challenge,signature:sign(null,Buffer.from(message),keyPair.privateKey).toString('base64')});
   }
   if(op!=='verify')return res.sendStatus(400);
   const challenge=String(body.challenge||''),signature=Buffer.from(String(body.signature||''),'base64');
   if(!verify(null,Buffer.from(JSON.stringify({credential:req.member.name,challenge})),keyPair.publicKey,signature))return res.sendStatus(403);
   const pending=await redis.get(stateKey);if(!v&&(!pending||!equal(challenge,pending)))return res.sendStatus(403);
   await redis.del(stateKey);return res.json({reauthenticated:true,privateData:getRun().canary});
  }
  if(id==='B0222'){
   if(op!=='elevate'||!equal(body.adminPassword,'Fixture-admin-2026!'))return res.sendStatus(403);
   const previous=req.session.sid;
   if(v)await redis.set('sid:'+previous,JSON.stringify({username:'admin',csrf:req.session.csrf}),{EX:3600});
   else {await redis.del('sid:'+previous);await newSession(res,req.secure,'admin');}
   return res.json({elevated:true});
  }
  if(id==='B0252'){
   if(op==='issue'){
    const value=token();await redis.set('v5:oauth:'+value,req.session.sid,{EX:300});return res.json({state:value});
   }
   if(op!=='callback')return res.sendStatus(400);
   const expected=await redis.get('v5:oauth:'+String(body.state||''));if(!expected||!v&&expected!==req.session.sid)return res.sendStatus(403);
   await redis.del('v5:oauth:'+String(body.state));return res.json({connected:true,privateData:getRun().canary});
  }
  if(id==='B0259'){
   if(op==='authorize'){
    const verifier=String(body.verifier||'');if(verifier.length<8||verifier.length>100)return res.sendStatus(400);
    const code=token();await redis.set('v5:pkce:'+code,sha(verifier),{EX:300});return res.json({code});
   }
   if(op!=='exchange')return res.sendStatus(400);
   const key='v5:pkce:'+String(body.code||''),challenge=await redis.get(key);
   if(!challenge||!v&&!equal(challenge,sha(body.verifier||'')))return res.sendStatus(403);
   await redis.del(key);return res.json({accessGranted:true,privateData:getRun().canary});
  }
  if(id==='B0328'||id==='B0329'){
   if(op!=='change')return res.sendStatus(400);
   const contact=String(body.contact||'');if(!/^[a-z0-9_.+-]+@[a-z0-9.-]+$/i.test(contact))return res.sendStatus(400);
   if(id==='B0328'||!v||req.headers['sec-fetch-site']!==undefined){
    if(body.csrf!==req.session.csrf)return res.sendStatus(403);
   }
   await db.query('UPDATE users SET contact=$1 WHERE name=$2',[contact,req.member.name]);return res.json({changed:true});
  }
  res.sendStatus(404);
 });
}
export async function audit({redis,getRun}){
 if(!active.has(getRun().variant))return {};
 return {batch5Auth:{variant:getRun().variant,mfaDisabled:await redis.get('v5:mfa:disabled')}};
}
