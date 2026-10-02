import {createHash,timingSafeEqual} from 'node:crypto';
import {groups} from './batch4-selection.mjs';

const chosen=['R0046','R0184','R0198','R0208','R0228'];
const ids=chosen.flatMap(root=>groups.auth[root]),active=new Set(ids);
const title={B0192:'会員サインイン',B0205:'変更リンク',B0213:'単回の承認',B0257:'連携コード交換',B0209:'回復案内',B0231:'会員リンク',B0345:'アクセス記録',B0454:'案内URL',B0214:'連絡先変更',B0215:'メール確認',B0216:'パスワード確認',B0229:'会員停止',B0302:'権限変更'};
const normal={
 B0192:{username:'alice',password:'Fixture-alice-2026!'},
 B0205:{operation:'issue'},B0213:{operation:'issue'},B0257:{operation:'issue'},
 B0209:{operation:'issue'},B0231:{operation:'link'},B0345:{operation:'issue'},B0454:{operation:'link'},
 B0214:{operation:'change',contact:'alice.updated@example.test',oldPassword:'Fixture-alice-2026!'},
 B0215:{operation:'request',contact:'alice.updated@example.test'},
 B0216:{operation:'change',contact:'alice.updated@example.test',oldPassword:'Fixture-alice-2026!'},
 B0229:{operation:'status'},B0302:{operation:'staff'}
};
export const variantDefinitions=chosen.flatMap(root=>groups.auth[root].map(variant=>({
 root,variant,additionalVariant:true,title:title[variant],feature:'v4-account-'+variant.slice(1),family:root==='R0046'?'機微変更の再認証':root==='R0208'?'認証識別子のURL経由流出':'認証状態の境界',
 entry:'/v4-account',allowedPaths:['v4-account'],requests:[['GET','/v4-account',{}],...(variant==='B0192'?[['GET','/v4-account/signin',{}],['POST','/v4-account/signin',normal.B0192]]:[['POST','/v4-account',normal[variant]]]),...(variant==='B0345'?[['GET','/v4-account/reset',{}]]:[])],
 ...(variant==='B0192'?{loginPath:'/v4-account/signin'}:{sessionProtectedPath:'/v4-account'}),
 negativeDescription:'本人の正常なログイン・変更・単回利用を維持し、期限後や権限変更後の再利用・URL漏えいを許さない。',
 implementationNote:'PostgreSQLの会員状態と単回token、Redis sessionを用いて認証境界を再現する。'
})));
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const changeIds=new Set(['B0214','B0215','B0216']);
let logs=[];
export async function reset({db,getRun}){
 logs=[];if(!active.has(getRun().variant))return;
 await db.query('CREATE TABLE IF NOT EXISTS v4_account_tokens (value text PRIMARY KEY,kind text NOT NULL,owner text NOT NULL,used boolean NOT NULL DEFAULT false,contact text)');
 await db.query('CREATE TABLE IF NOT EXISTS v4_account_flags (username text PRIMARY KEY,disabled boolean NOT NULL DEFAULT false)');
 await db.query('TRUNCATE v4_account_tokens,v4_account_flags');
}
export function register(router,{db,redis,getRun,vulnerable,requireLogin,newSession,token,page,esc}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v4-account/signin',selected,(req,res)=>getRun().variant==='B0192'?res.type('html').send(page('会員サインイン','<form method="post"><input name="username" value="alice"><input name="password" type="password"><button>入る</button></form>')):res.sendStatus(404));
 router.post('/v4-account/signin',selected,async(req,res)=>{
  if(getRun().variant!=='B0192')return res.sendStatus(404);
  const username=String(req.body?.username||''),password=String(req.body?.password||'');
  const account=(await db.query('SELECT name,password FROM users WHERE name=$1',[username])).rows[0];
  if(!account||password.length>200)return res.sendStatus(401);
  const verified=vulnerable()?equal(sha(account.password.slice(0,8)),sha(password.slice(0,8))):equal(sha(account.password),sha(password));
  if(!verified)return res.sendStatus(401);
  if(req.session.sid)await redis.del('sid:'+req.session.sid);await newSession(res,req.secure,account.name);res.json({loggedIn:true});
 });
 router.get('/v4-account',selected,(req,res)=>{
  if(getRun().variant!=='B0192'&&!requireLogin(req,res))return;
  res.type('html').send(page(title[getRun().variant],`<form method="post"><input name="contact" value="${esc(req.member?.contact||'alice@example.test')}"><button>続ける</button></form>`));
 });
 router.get('/v4-account/log',selected,(req,res)=>{
  if(!['B0209','B0345'].includes(getRun().variant))return res.sendStatus(404);
  res.json({entries:logs});
 });
 router.get('/v4-account/reset',selected,(req,res)=>{
  if(getRun().variant!=='B0345')return res.sendStatus(404);
  logs.push({kind:'access',url:vulnerable()?req.originalUrl:req.path});
  res.type('html').send(page('リンク受付','<p>再設定リンクを受け付けました。</p>'));
 });
 router.get('/v4-account/landing',selected,(req,res)=>res.type('html').send(page('案内先','<p>案内を受け付けました。</p>')));
 router.post('/v4-account',selected,async(req,res)=>{
  const id=getRun().variant;if(id==='B0192')return res.sendStatus(404);
  if(!requireLogin(req,res))return;
  const body=req.body||{},operation=String(body.operation||''),v=vulnerable(),owner=req.member.name;
  if(changeIds.has(id)){
   const contact=body.contact;
   if(id==='B0215'){
    if(operation==='request'){
     if(typeof contact!=='string'||! /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+$/.test(contact))return res.sendStatus(400);
     const value=token();await db.query('INSERT INTO v4_account_tokens(value,kind,owner,contact) VALUES($1,$2,$3,$4)',[value,'new-email',owner,contact]);
     return res.json({newEmailToken:value,...(v?{}:{oldEmailToken:value+'-old'})});
    }
    if(operation!=='confirm')return res.sendStatus(400);
    const item=(await db.query('SELECT * FROM v4_account_tokens WHERE value=$1 AND owner=$2 AND kind=$3 AND used=false',[body.newEmailToken,owner,'new-email'])).rows[0];
    if(!item||!v&&body.oldEmailToken!==body.newEmailToken+'-old')return res.sendStatus(403);
    await db.query('UPDATE users SET contact=$1 WHERE name=$2',[item.contact,owner]);await db.query('UPDATE v4_account_tokens SET used=true WHERE value=$1',[item.value]);return res.json({changed:true});
   }
   if(operation!=='change')return res.sendStatus(400);
   if(typeof contact!=='string'||! /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+$/.test(contact))return res.sendStatus(400);
   if(!v&&!equal(body.oldPassword,req.member.password))return res.sendStatus(403);
   if(id==='B0214'&&!v&&!body.reauthenticated)return res.sendStatus(403);
   await db.query('UPDATE users SET contact=$1 WHERE name=$2',[contact,owner]);return res.json({changed:true,contact});
  }
  if(['B0205','B0213','B0257'].includes(id)){
   if(operation==='issue'){
    const value=token(),kind=id==='B0257'?'authorization-code':id==='B0213'?'approval':'password-change';
    await db.query('INSERT INTO v4_account_tokens(value,kind,owner) VALUES($1,$2,$3)',[value,kind,owner]);return res.json({token:value});
   }
   if(operation!=='consume'||typeof body.token!=='string')return res.sendStatus(400);
   const item=(await db.query('SELECT * FROM v4_account_tokens WHERE value=$1 AND owner=$2',[body.token,owner])).rows[0];
   if(!item||!v&&item.used)return res.sendStatus(403);
   if(id==='B0205')await db.query('UPDATE users SET password=$1 WHERE name=$2',['Changed-'+owner+'-2026!',owner]);
   if(!v)await db.query('UPDATE v4_account_tokens SET used=true WHERE value=$1',[item.value]);
   return res.json({consumed:true,kind:item.kind});
  }
  if(['B0209','B0345'].includes(id)){
   if(operation!=='issue')return res.sendStatus(400);
   const value=token();if(id==='B0209')logs.push({kind:'diagnostic',token:v?value:'[redacted]'});
   return res.json({ownToken:value,...(id==='B0345'?{resetUrl:getRun().base+'/v4-account/reset'+(v?'?token='+encodeURIComponent(value):'')}:{})});
  }
  if(['B0231','B0454'].includes(id)){
   if(operation!=='link')return res.sendStatus(400);
   const value=id==='B0231'?req.session.sid:getRun().canary;
   const link=getRun().base+'/v4-account/landing'+(v?'?'+(id==='B0231'?'sid':'secret')+'='+encodeURIComponent(value):'');
   return res.json({link});
  }
  if(id==='B0229'){
   if(operation==='disable'){
    if(req.member.role!=='admin')return res.sendStatus(403);
    await db.query('INSERT INTO v4_account_flags(username,disabled) VALUES($1,true) ON CONFLICT(username) DO UPDATE SET disabled=true',[String(body.username||'alice')]);return res.json({disabled:true});
   }
   if(operation!=='status')return res.sendStatus(400);
   const disabled=(await db.query('SELECT disabled FROM v4_account_flags WHERE username=$1',[owner])).rows[0]?.disabled||false;
   if(disabled&&!v)return res.sendStatus(403);
   return res.json({username:owner,privateData:getRun().canary});
  }
  if(id==='B0302'){
   if(operation==='downgrade'){
    if(req.member.role!=='admin')return res.sendStatus(403);
    await redis.set('v4:cached-role:'+req.session.sid,req.member.role);await db.query('UPDATE users SET role=$1 WHERE name=$2',['user',owner]);return res.json({downgraded:true});
   }
   if(operation!=='staff')return res.sendStatus(400);
   const role=v?await redis.get('v4:cached-role:'+req.session.sid)||req.member.role:req.member.role;
   if(role!=='admin')return res.sendStatus(403);
   return res.json({staffReport:getRun().canary});
  }
  res.sendStatus(404);
 });
}
export async function audit({db,getRun}){
 if(!active.has(getRun().variant))return {};
 return {batch4Account:{variant:getRun().variant,logs:[...logs],tokens:(await db.query('SELECT kind,owner,used FROM v4_account_tokens ORDER BY kind')).rows,alice:(await db.query('SELECT contact,role FROM users WHERE name=$1',['alice'])).rows[0]}};
}
