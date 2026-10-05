import express from 'express';
import pg from 'pg';
import {createClient} from 'redis';
import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import {cases,variantCases,findCase} from './catalog.mjs';
import {requests,openapi} from './contracts.mjs';
import {definitions as caseDefinitions,variantDefinitions,register as registerCases,reset as resetCases,databaseProof,registerCollector,registerAux,audit as caseAudit,caseControl,registerProtocolServers} from './cases/index.mjs';
import {RequestMeter} from './measurement.mjs';
import {runtimeSourceProof} from './reporting/source.mjs';

const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL}); redis.on('error',e=>console.error('Redis:',e.message)); await redis.connect();
const executor=process.env.EXECUTOR_URL||'http://executor:8090';
const hash=s=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(24).toString('hex');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const controlKey=token(); await writeFile('/tmp/benchmark-control.key',controlKey,{mode:0o600});
const targetRuntimeSource=await runtimeSourceProof('/opt/benchmark');
const canaryKey=token(),meter=new RequestMeter();
let run,resetting=false,sequence=4100;
await db.query(`CREATE TABLE IF NOT EXISTS users (name text PRIMARY KEY,password text NOT NULL,role text NOT NULL,tenant text NOT NULL,contact text NOT NULL,balance integer NOT NULL);
CREATE TABLE IF NOT EXISTS items (id integer PRIMARY KEY,title text NOT NULL,secret boolean NOT NULL);
CREATE TABLE IF NOT EXISTS documents (id integer PRIMARY KEY,owner text NOT NULL,tenant text NOT NULL,shared boolean NOT NULL,body text NOT NULL);
CREATE TABLE IF NOT EXISTS resets (value text PRIMARY KEY,username text NOT NULL,used boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS orders (id serial PRIMARY KEY,username text NOT NULL,price integer NOT NULL);
CREATE TABLE IF NOT EXISTS operations (id serial PRIMARY KEY,username text NOT NULL,action text NOT NULL);`);
async function reset(spec) {
  const item=findCase(spec.root,spec.variant); if(!['V','F','N'].includes(spec.mode)) throw new Error('mode must be V, F or N');
  if(meter.active) throw new Error('measurement is active');
  if(meter.busy) throw new Error('public requests are still running');
  if(resetting) throw new Error('reset in progress');
  resetting=true;
  try {
    const seed=String(spec.seed||'pilot-2026');
    const identity=item.additionalVariant?seed+item.root+item.variant:seed+item.root;
    const next={...item,mode:spec.mode,seed,base:'/w/'+hash(identity).slice(0,12),canary:'canary_'+createHmac('sha256',canaryKey).update(JSON.stringify(item.additionalVariant?[seed,item.root,item.variant]:[seed,item.root])).digest('hex').slice(0,24),jwtSecret:token()};
    await db.query('TRUNCATE users,items,documents,resets,orders,operations RESTART IDENTITY');
    for(const [name,role,tenant] of [['alice','user','A'],['bob','user','A'],['carol','user','B'],['approver','approver','A'],['admin','admin','A']]) {
      await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,3000)',[name,'Fixture-'+name+'-2026!',role,tenant,name+'@example.test']);
    }
    await db.query('INSERT INTO items VALUES(1,$1,false),(2,$2,false),(3,$3,true)',['Apple','Banana',next.canary]);
    await db.query('INSERT INTO documents VALUES(101,$1,$2,false,$3),(102,$4,$2,false,$5),(103,$6,$7,false,$8),(104,$4,$2,true,$9)', ['alice','A','Alice private document','bob',next.canary,'carol','B',next.canary+' tenant B','Publicly shared document']);
    await redis.flushDb(); sequence=4100;
    await mkdir('/opt/benchmark/fixtures/public',{recursive:true}); await mkdir('/opt/benchmark/fixtures/private',{recursive:true});
    await writeFile('/opt/benchmark/fixtures/public/readme.txt','Public user guide');
    await writeFile('/opt/benchmark/fixtures/private/report.txt',next.canary);
    const response=await fetch(executor+'/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({canary:next.canary})});
    if(!response.ok)throw new Error('executor reset failed');
    run=next;await resetCases({db,redis,getRun:()=>run,vulnerable,token,createPool:options=>new pg.Pool(options),databaseUrl:process.env.DATABASE_URL});return manifest();
  } finally {resetting=false;}
}
function manifest() {
  const endpoints={search:'/search?q=Apple',message:'/message?text=Hello',preview:'/preview',files:'/files?name=public%2Freadme.txt',extensions:'/extensions',account:'/login',recovery:'/recovery',session:'/session',api:'/token',connect:'/connect',documents:'/documents/101',management:'/management',profile:'/profile',integration:'/integration',news:'/news',shop:'/shop'};
  const extension=variantDefinitions.find(item=>item.variant===run.variant)||caseDefinitions.find(item=>item.root===run.root);
  const entry=extension?.entry||endpoints[run.feature];
  const loginPath=extension?.loginPath||(run.root==='R0184'?'/signin':'/login');
  const logoutPath=extension?.logoutPath||(run.root==='R0224'?'/signout':'/logout');
  const bearerPath=extension?.requests.some(([method,p])=>method==='GET'&&p==='/access-pass')?'access-pass':'token';
  return {base:run.base,entry:run.base+entry,login:run.base+loginPath,logout:run.base+logoutPath,credentials:{username:'alice',password:'Fixture-alice-2026!'},roleProfiles:[['alice','user','A'],['bob','user','A'],['carol','user','B'],['approver','approver','A'],['admin','admin','A']].map(([username,role,tenant])=>({username,password:'Fixture-'+username+'-2026!',role,tenant})),...(run.feature==='documents'?{resourceSeeds:{documentIds:[101,102,103,104]}}:{}),...(run.feature==='transport-access'?{requiredTargetOrigins:['http://benchmark.test:8080','https://app:8443']}:['login-analytics','error-reporting'].includes(run.feature)?{requiredTargetOrigins:['https://app:8443','https://app:8444'],auxiliaryRequests:[{method:'POST',origin:'https://app:8444',path:'/collect-events'}]}:{}),...(extension?.requiredTargetOrigins?{requiredTargetOrigins:extension.requiredTargetOrigins}:{}),...(extension?.requiredObservationCapabilities?{requiredObservationCapabilities:extension.requiredObservationCapabilities}:{}),...(extension?.sessionProtectedPath?{authentication:{sessionProtectedOperation:{method:'GET',path:run.base+extension.sessionProtectedPath}}}:{}),openapi:run.base+'/openapi.json',requests:requests(run.feature,run.base),extractions:{csrf:'GET session -> csrf',bearer:'GET '+bearerPath+' -> token',oauth:'connect Location -> state; idp Location -> code',recovery:'own inbox supplied by operator',...extension?.extractions},publicInput:'Routes and normal values only; no mode or expected finding.'};
}
function same(a,b) {const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
async function user(name) {return (await db.query('SELECT * FROM users WHERE name=$1',[name])).rows[0];}
function vulnerable() {return run.mode==='V';}
async function session(req) {
  const sid=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('sid='))?.slice(4);
  if(!sid||!/^[a-f0-9]{48}$/.test(sid))return {};
  const value=await redis.get('sid:'+sid);return value?{sid,...JSON.parse(value)}:{};
}
function cookie(res,sid,secure) {res.cookie('sid',sid,{httpOnly:true,secure,sameSite:secure?'none':'lax',path:'/'});}
async function newSession(res,secure,username=null,csrf=token()) {const sid=token();await redis.set('sid:'+sid,JSON.stringify({username,csrf}),{EX:3600});cookie(res,sid,secure);return {sid,username,csrf};}
function jwt(data) {const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const body=Buffer.from(JSON.stringify(data)).toString('base64url');return head+'.'+body+'.'+createHmac('sha256',run.jwtSecret).update(head+'.'+body).digest('base64url');}
function decodeJWT(value) {
  try {
    const parts=String(value).split('.');if(parts.length!==3)return null;
    const head=JSON.parse(Buffer.from(parts[0],'base64url')),body=JSON.parse(Buffer.from(parts[1],'base64url'));
    const expected=createHmac('sha256',run.jwtSecret).update(parts[0]+'.'+parts[1]).digest('base64url');
    if(!(vulnerable()&&run.root==='R0241'&&head.alg==='none'&&parts[2]==='')&&!(head.alg==='HS256'&&same(parts[2],expected)))return null;
    if(body.iss!=='fixture-idp'||body.aud!=='member-api'||!Number.isFinite(body.exp)||body.exp<Date.now()/1000)return null;
    return body;
  } catch {return null;}
}
const app=meter.track(express());app.disable('x-powered-by');
app.use(meter.middleware());
// Count at ingress so malformed bodies rejected by parsers are also measured.
app.use(express.json({limit:'32kb',verify:(req,res,body)=>{req.rawJson=body.toString('utf8');}}));app.use(express.urlencoded({extended:false,limit:'32kb'}));
app.use(async(req,res,next)=>{
  if(resetting)return res.status(503).send('State is resetting');
  if(!run)return res.sendStatus(503);
  if(run.root==='R0461'&&!vulnerable()&&!req.secure&&req.path.startsWith(run.base+'/')&&req.path!==run.base+'/transport-help'){
    if(!['GET','HEAD'].includes(req.method))return res.status(426).json({error:'HTTPS required'});
    const host=['app','localhost','127.0.0.1'].includes(req.hostname)?req.hostname:'app';
    return res.redirect(308,'https://'+host+':8443'+req.originalUrl);
  }
  req.session=await session(req);req.member=req.session.username?await user(req.session.username):null;
  const crossOriginPostPaths=(variantDefinitions.find(item=>item.variant===run.variant)||caseDefinitions.find(item=>item.root===run.root))?.crossOriginPostPaths||[];
  const permittedCrossOriginPost=(run.root==='R0311'&&req.path===run.base+'/profile')||crossOriginPostPaths.some(path=>req.path===run.base+path);
  if(req.method==='POST'&&req.headers.origin&&!permittedCrossOriginPost&&req.headers.origin!==req.protocol+'://'+req.headers.host)return res.sendStatus(403);
  next();
});
function page(title,content) {return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>body{max-width:850px;margin:36px auto;padding:0 20px;font:16px system-ui;line-height:1.8}input,textarea,button{font:inherit;padding:8px;margin:5px}pre{white-space:pre-wrap}a{color:#165cb2}nav{margin-bottom:24px}</style><nav><a href="/">ホーム</a> · <a href="${manifest().login}">ログイン</a> · <a href="${run.base}/session">会員情報</a></nav><h1>${esc(title)}</h1>${content}</html>`;}
function requireLogin(req,res) {if(!req.member){res.status(401).json({error:'Login required'});return false;}return true;}
app.get('/',(req,res)=>res.type('html').send(page('ワークスペース',`<p>検索・会員サービスのサンプルです。</p><a href="${manifest().entry}">${esc(run.title)}</a>`)));
app.get('/health',(req,res)=>res.json({ok:true}));
// The control/oracle API is on another listener and never forwarded here.
app.use('/control',(req,res)=>res.sendStatus(404));
app.use('/w/:workspace',async(req,res,next)=>{
  if('/w/'+req.params.workspace!==run.base)return res.sendStatus(404);next();
});
const route=meter.track(express.Router()); app.use('/w/:workspace',route);
route.get('/login',(req,res)=>res.type('html').send(page('ログイン',`<form method="post"><input name="username" value="alice"><input name="password" type="password"><button>ログイン</button></form>`)));
route.post('/login',async(req,res)=>{
  const account=await user(String(req.body.username||''));
  const result={ok:!!account&&same(account.password,req.body.password),user:account};
  const accepted=run.root==='R0182'&&vulnerable()?Boolean(result):result.ok;
  if(!accepted||!account)return res.status(401).json({error:'Invalid credentials'});
  const old=req.session;
  if(run.root==='R0221'&&vulnerable()&&old.sid) {
    await redis.set('sid:'+old.sid,JSON.stringify({username:account.name,csrf:token()}),{EX:3600});cookie(res,old.sid,req.secure);
  } else {
    if(old.sid)await redis.del('sid:'+old.sid);await newSession(res,req.secure,account.name);
  }
  res.json({loggedIn:true,username:account.name});
});
route.get('/session',async(req,res)=>{if(!req.session.sid)req.session=await newSession(res,req.secure);res.json({username:req.session.username||null,csrf:req.session.csrf});});
route.post('/logout',async(req,res)=>{if(req.session.sid)await redis.del('sid:'+req.session.sid);res.clearCookie('sid',{path:'/'});res.json({ok:true});});
route.get('/openapi.json',(req,res)=>res.json(openapi(run.feature,run.base)));
registerCases(route,{db,redis,esc,page,requireLogin,user,newSession,getRun:()=>run,vulnerable,token,hash,jwt,decodeJWT,serveStatic:express.static});
route.use((req,res,next)=>{
  const allowed={search:['search'],message:['message'],preview:['preview'],files:['files'],extensions:['extensions'],account:[],recovery:['recovery','reset'],session:[],api:['token','member-api'],connect:['connect','idp','callback'],documents:['documents'],management:['management'],profile:['profile'],integration:['integration','integration-data'],news:['news'],shop:['shop']};
  if(!(allowed[run.feature]||[]).includes(req.path.split('/')[1]))return res.sendStatus(404);next();
});
route.get('/search',async(req,res)=>{
  const q=String(req.query.q||''); if(q.length>512)return res.sendStatus(400);
  try {
    const result=vulnerable()?await db.query(`SELECT title FROM items WHERE title ILIKE '%${q}%' AND secret=false`):await db.query('SELECT title FROM items WHERE title ILIKE $1 AND secret=false',['%'+q+'%']);
    if(req.accepts(['html','json'])==='json')return res.json(result.rows);
    res.type('html').send(page('検索',`<form><input name="q" value="${esc(q)}"><button>検索</button></form><ul>${result.rows.map(r=>'<li>'+esc(r.title)+'</li>').join('')}</ul>`));
  } catch {res.status(400).send('Invalid search expression');}
});
route.get('/message',(req,res)=>res.type('html').send(page('メッセージ',`<form><input name="text" value="Hello"><button>表示</button></form><div id="message">${vulnerable()?String(req.query.text||'Hello'):esc(req.query.text||'Hello')}</div>`)));
route.get('/preview',(req,res)=>res.type('html').send(page('プレビュー',`<p><a href="#Hello">サンプルを表示</a></p><div id="preview"></div><script>function render(){const text=decodeURIComponent(location.hash.slice(1));document.getElementById('preview').${vulnerable()?'innerHTML':'textContent'}=text}addEventListener('hashchange',render);render();</script>`)));
route.get('/files',async(req,res)=>{
  const name=String(req.query.name||'public/readme.txt');
  const frontend=path.posix.normalize(name).split('/');if(name.split('/').includes('..')||frontend[0]==='private')return res.sendStatus(403);
  const backend=name.replaceAll('\\','/');const relative=path.posix.normalize(backend);
  if(!vulnerable()&&(!relative.startsWith('public/')||relative.includes('..')||name.includes('\\')))return res.sendStatus(403);
  const target=path.resolve('/opt/benchmark/fixtures',relative);
  if(!target.startsWith('/opt/benchmark/fixtures/'))return res.sendStatus(403);
  try {res.type('text').send(await readFile(target,'utf8'));}catch{res.sendStatus(404);}
});
route.get('/extensions',(req,res)=>res.type('html').send(page('拡張機能登録',`<p>JSONで拡張モジュールを登録します。例: name=hello, source=console.log('Hello')</p>`)));
route.post('/extensions',async(req,res)=>{
  if(!requireLogin(req,res))return;
  const id=String(req.body.name||'');if(!/^[a-zA-Z0-9_-]{1,40}$/.test(id)||typeof req.body.source!=='string')return res.sendStatus(400);
  const response=await fetch(executor+'/store',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,source:req.body.source,executable:vulnerable()})});
  res.status(response.status).json({stored:response.ok,url:run.base+'/extensions/'+id});
});
route.get('/extensions/:id',async(req,res)=>{if(!requireLogin(req,res))return;const response=await fetch(executor+(vulnerable()?'/execute/':'/download/')+encodeURIComponent(req.params.id));if(!vulnerable())res.set('Content-Disposition','attachment');res.status(response.status).type('text').send(await response.text());});
route.get('/recovery',(req,res)=>res.type('html').send(page('パスワード再設定',`<form method="post"><input name="username" value="alice"><button>再設定を依頼</button></form>`)));
route.post('/recovery',async(req,res)=>{
  const account=await user(String(req.body.username||''));if(account){const value=vulnerable()?String(++sequence):token();await db.query('INSERT INTO resets(value,username) VALUES($1,$2)',[value,account.name]);await redis.rPush('mail:'+account.name,JSON.stringify({token:value}));}
  res.json({message:'If the account exists, an email has been sent.'});
});
route.post('/reset',async(req,res)=>{
  const password=String(req.body.password||'');if(password.length<12||password.length>200)return res.sendStatus(400);
  const connection=await db.connect();try{await connection.query('BEGIN');const result=await connection.query('UPDATE resets SET used=true WHERE value=$1 AND used=false RETURNING username',[String(req.body.token||'')]);if(!result.rowCount){await connection.query('ROLLBACK');return res.sendStatus(400);}await connection.query('UPDATE users SET password=$1 WHERE name=$2',[password,result.rows[0].username]);await connection.query('COMMIT');res.json({ok:true});}catch(e){await connection.query('ROLLBACK');throw e;}finally{connection.release();}
});
route.get('/token',(req,res)=>{if(!requireLogin(req,res))return;res.json({token:jwt({sub:req.member.name,role:req.member.role,iss:'fixture-idp',aud:'member-api',exp:Math.floor(Date.now()/1000)+600})});});
route.get('/member-api',(req,res)=>{const payload=decodeJWT((req.headers.authorization||'').replace(/^Bearer /,''));if(!payload)return res.sendStatus(401);if(payload.role!=='admin')return res.sendStatus(403);res.json({privateReport:run.canary});});
route.get('/connect',async(req,res)=>{
  if(!req.session.sid)req.session=await newSession(res,req.secure);
  const state=token();await redis.set('state:'+req.session.sid,state,{EX:300});
  res.redirect(run.base+'/idp/authorize?state='+state);
});
route.get('/idp/authorize',(req,res)=>res.type('html').send(page('外部アカウント認証',`<form method="post"><input type="hidden" name="state" value="${esc(req.query.state||'')}"><input name="username" value="alice"><input name="password" type="password"><button>外部ログイン</button></form>`)));
route.post('/idp/authorize',async(req,res)=>{
  const account=await user(String(req.body.username||''));if(!account||!same(account.password,req.body.password))return res.sendStatus(401);
  const code=token();await redis.set('code:'+code,account.name,{EX:300});res.redirect(run.base+'/callback?code='+code+(req.body.state?'&state='+encodeURIComponent(req.body.state):''));
});
route.get('/callback',async(req,res)=>{
  const expected=req.session.sid?await redis.get('state:'+req.session.sid):null;
  if(!vulnerable()&&(!expected||!req.query.state||!same(expected,req.query.state)))return res.status(403).send('Invalid state');
  const name=await redis.getDel('code:'+String(req.query.code||''));if(!name)return res.status(400).send('Invalid code');
  if(req.session.sid){await redis.del('sid:'+req.session.sid);await redis.del('state:'+req.session.sid);}await newSession(res,req.secure,name);res.json({username:name});
});
route.get('/documents/:id',async(req,res)=>{
  if(!requireLogin(req,res))return;const item=(await db.query('SELECT * FROM documents WHERE id=$1',[Number(req.params.id)||0])).rows[0];if(!item)return res.sendStatus(404);
  if(!vulnerable()&&!(item.shared||item.owner===req.member.name))return res.sendStatus(403);res.json({id:item.id,body:item.body});
});
route.get('/management',(req,res)=>res.type('html').send(page('管理操作',`<form method="post"><input name="action" value="rebuild-report"><button>実行</button></form>`)));
route.post('/management',async(req,res)=>{if(!requireLogin(req,res))return;if(!vulnerable()&&req.member.role!=='admin')return res.sendStatus(403);await db.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,'rebuild-report']);res.json({completed:true});});
route.get('/profile',(req,res)=>{if(!requireLogin(req,res))return;res.type('html').send(page('連絡先変更',`<form method="post"><input name="contact" value="${esc(req.member.contact)}"><input name="csrf" type="hidden" value="${esc(req.session.csrf)}"><button>保存</button></form>`));});
route.post('/profile',async(req,res)=>{if(!requireLogin(req,res))return;if(!vulnerable()&&!same(req.session.csrf,req.body.csrf||''))return res.sendStatus(403);const contact=String(req.body.contact||'');if(!/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+$/.test(contact))return res.sendStatus(400);await db.query('UPDATE users SET contact=$1 WHERE name=$2',[contact,req.member.name]);res.json({saved:true});});
route.get('/integration',(req,res)=>res.type('html').send(page('連携API',`<p>同一オリジンのクライアントから会員データを取得します。</p><a href="${run.base}/integration-data">会員データ</a>`)));
route.get('/integration-data',(req,res)=>{
  const origin=req.headers.origin;
  if(vulnerable()&&origin==='null'){res.set('Access-Control-Allow-Origin','null');res.set('Access-Control-Allow-Credentials','true');res.vary('Origin');}
  if(!requireLogin(req,res))return;res.json({account:req.member.name,privateData:run.canary});
});
route.get('/news',async(req,res)=>{
  const key='news:public';const cached=await redis.get(key);if(cached){const item=JSON.parse(cached);return res.status(item.status).type('text').send(item.body);}
  const diagnostic=String(req.headers['x-news-preview']||'');
  const item=diagnostic?{status:503,body:'Temporarily unavailable: '+diagnostic.slice(0,100)}:{status:200,body:'Latest news: service is available'};
  // Keep the diagnostic error testable after a scanner reads the normal page.
  // The defect is caching an error under the shared public key, not caching 200s.
  if(vulnerable()&&item.status===503)await redis.set(key,JSON.stringify(item),{EX:60});res.status(item.status).type('text').send(item.body);
});
route.get('/shop',(req,res)=>res.type('html').send(page('購入',`<p>商品: book / 価格: 1000 / 初期残高: 3000</p><form method="post"><input name="product" value="book"><input name="price" value="1000"><button>購入</button></form>`)));
route.post('/shop',async(req,res)=>{
  if(!requireLogin(req,res))return;if(req.body.product!=='book')return res.sendStatus(400);
  const price=vulnerable()?Number(req.body.price):1000;if(!Number.isInteger(price)||price<0||price>100000)return res.sendStatus(400);
  const connection=await db.connect();try{await connection.query('BEGIN');const result=await connection.query('UPDATE users SET balance=balance-$1 WHERE name=$2 AND balance>=$1 RETURNING balance',[price,req.member.name]);if(!result.rowCount){await connection.query('ROLLBACK');return res.sendStatus(409);}await connection.query('INSERT INTO orders(username,price) VALUES($1,$2)',[req.member.name,price]);await connection.query('COMMIT');res.json({charged:price,balance:result.rows[0].balance});}catch(e){await connection.query('ROLLBACK');throw e;}finally{connection.release();}
});
app.use((error,req,res,next)=>{console.error('Request error:',error.message);if(!res.headersSent){const status=['entity.parse.failed','entity.too.large','request.aborted'].includes(error.type)&&[400,413].includes(error.status)?error.status:500;res.status(status).json({error:status===500?'Request failed':'Invalid request body'});}});

const attacker=meter.track(express());attacker.use(meter.middleware());attacker.use((req,res,next)=>resetting?res.status(503).json({error:'Fixture resetting'}):next());attacker.use(express.json({limit:'32kb'}));
attacker.use(express.urlencoded({extended:false,limit:'32kb'}));
registerAux(attacker,{db,redis,esc,page,getRun:()=>run});
registerCollector(attacker,{redis,getRun:()=>run});
attacker.get('/browser-csrf-fixture',(req,res)=>res.type('html').send('<!doctype html><title>Cross-origin CSRF fixture</title>'));
attacker.get('/csrf',(req,res)=>{
  const target=String(req.query.target||'');if(!/^https:\/\/(app|localhost|127\.0\.0\.1):8443\/w\/[a-f0-9]+\/profile$/.test(target))return res.sendStatus(400);
  res.type('html').send(`<!doctype html><form id="attack" action="${esc(target)}" method="post"><input name="contact" value="changed@example.test"></form><script>document.getElementById('attack').submit()</script>`);
});
attacker.get('/cors',(req,res)=>{
  const target=String(req.query.target||'');if(!/^https:\/\/(app|localhost|127\.0\.0\.1):8443\/w\/[a-f0-9]+\/integration-data$/.test(target))return res.sendStatus(400);
  const code=`fetch(${JSON.stringify(target)},{credentials:'include'}).then(r=>r.text()).then(data=>parent.postMessage({data},'*')).catch(()=>parent.postMessage({blocked:true},'*'))`;
  const sandbox=req.query.cookies==='default'?'allow-scripts':'allow-scripts allow-same-site-none-cookies';
  res.type('html').send(`<!doctype html><div id="result">waiting</div><script>addEventListener('message',e=>{if(e.source===document.querySelector('iframe').contentWindow)document.getElementById('result').textContent=JSON.stringify(e.data)})</script><iframe sandbox="${sandbox}" srcdoc="${esc('<script>'+code+'</script>')}"></iframe>`);
});
const control=express();control.use(express.json());control.use((req,res,next)=>{if(!same(req.headers['x-benchmark-key']||'',controlKey))return res.sendStatus(403);next();});
control.get('/health',(req,res)=>res.json({ok:!!run&&!resetting}));
control.get('/source-proof',(req,res)=>res.json(targetRuntimeSource));
control.get('/catalog',(req,res)=>res.json(cases));
control.get('/variant-catalog',(req,res)=>res.json(variantCases));
control.post('/reset',async(req,res)=>{try{res.json(await reset(req.body));}catch(error){res.status(400).json({error:error.message});}});
control.post('/case-action',async(req,res)=>{try{res.json(await caseControl({db,getRun:()=>run},req.body));}catch(error){res.status(400).json({error:error.message});}});
control.get('/manifest',(req,res)=>res.json(manifest()));
control.get('/oracle',async(req,res)=>res.json({root:run.root,variant:run.variant,mode:run.mode,seed:run.seed,canary:run.canary,users:(await db.query('SELECT name,password,contact,balance FROM users ORDER BY name')).rows,orders:(await db.query('SELECT username,price FROM orders ORDER BY id')).rows,operations:(await db.query('SELECT username,action FROM operations ORDER BY id')).rows,caseState:await caseAudit({db,redis,getRun:()=>run})}));
control.post('/database-proof',async(req,res)=>res.json(await databaseProof({getRun:()=>run,createPool:options=>new pg.Pool(options),databaseUrl:process.env.DATABASE_URL},String(req.body.connectionString||''))));
control.get('/mail/:user',async(req,res)=>{if(!['alice','bob','carol'].includes(req.params.user))return res.sendStatus(400);res.json((await redis.lRange('mail:'+req.params.user,0,-1)).map(JSON.parse));});
control.post('/measurement/start',(req,res)=>{
  if(resetting||!run)return res.status(409).json({error:'reset in progress'});
  try{res.json(meter.start(token(),run.base));}catch(error){res.status(409).json({error:error.message});}
});
control.get('/measurement',(req,res)=>res.json(meter.snapshot()));
control.post('/measurement/stop',(req,res)=>{
  try{res.json(meter.stop());}catch(error){res.status(409).json({error:error.message});}
});
// Private listener: no Compose host publication. A random key is held only in /tmp.
control.listen(8099,'0.0.0.0');
const tls={key:await readFile(new URL('./tls/local.key',import.meta.url)),cert:await readFile(new URL('./tls/local.crt',import.meta.url))};
await reset({root:'R0001',mode:'V',seed:'pilot-2026'});
const httpServer=app.listen(8080,'0.0.0.0');
const httpsServer=https.createServer(tls,app).listen(8443,'0.0.0.0');
registerProtocolServers({servers:[httpServer,httpsServer],context:{db,redis,getRun:()=>run,vulnerable}});
https.createServer(tls,attacker).listen(8444,'0.0.0.0');
console.log('Benchmark ready. HTTP 8080; HTTPS 8443; untrusted fixture HTTPS 8444.');
