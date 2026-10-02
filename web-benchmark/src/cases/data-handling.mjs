import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';

const define=(root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote)=>({root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote,...(feature==='login-analytics'?{}:{sessionProtectedPath:entry})});
export const definitions=[
  define('R0094','B0451','会員カード','member-card','公開DTOの秘密属性','/member-card',['member-card'],[['GET','/member-card',{}]],'本人の公開プロフィールは取得できるが、内部連携コードは公開DTOに含めない。','PostgreSQLの実プロフィールモデルに保持した内部コードの全属性直列化と固定DTOを比較。オブジェクト所有者の認可は全条件で維持し、属性レベルの返却境界だけを切り替える。'),
  define('R0452','B0452','会員アクセスパス','browser-pass','localStorageへの資格情報保存','/browser-access',['browser-access','browser-pass','browser-member'],[['GET','/browser-access',{}],['GET','/browser-pass',{}],['GET','/browser-member',{}]],'正常な会員データ取得は成功し、アクセスパスをlocalStorageに残さない。','実Redisの一時間アクセスパスで保護APIを呼ぶ。VはlocalStorageへ保存し、F/Nはページ内closureだけに保持。全条件で同じ期限と権限を維持する。この修正を同一originの任意JavaScript実行に対する完全な保護とは称さない。'),
  define('R0453','B0453','会員ダッシュボード','offline-dashboard','Service Workerの個人cache','/offline-dashboard',['offline-dashboard','dashboard-worker.js','dashboard-data','dashboard-public'],[['GET','/offline-dashboard',{}],['GET','/dashboard-data',{}],['GET','/dashboard-public',{}]],'公開案内のworker cacheは利用できるが、ログアウト後と別会員のログイン後に前会員の個人応答を取得できない。','実Chromium Service Worker/CacheStorageで比較。HTTP応答は全条件no-storeとし、workerが個人応答を保存するかだけを切り替える。F/Nのactivationはこのworker専用cacheを消去する。通常HTTP cacheのR0477とは保存主体が異なる。'),
  define('R0455','B0455','個人帳票','personal-reports','秘密ファイルの公開領域','/personal-reports',['personal-reports','generated-report'],[['GET','/personal-reports',{}],['POST','/personal-reports',{}],['GET','/generated-report/alice.txt',{}]],'本人の帳票生成・ダウンロードは成功し、生成後にログアウトしても公開領域からその帳票を取得できない。','実ファイルをVでは公開配信領域、F/Nでは非公開領域へ保存する。同じdownload URLでVは無認証の静的読取、F/Nは所有者認可後に読取。ディレクトリ一覧を作らず、DBオブジェクト認可とは保存・配信境界を分ける。'),
  define('R0457','B0457','ログイン利用状況','login-analytics','分析イベントへのパスワード送信','/login-analytics',['login-analytics'],[['GET','/login-analytics',{}]],'正常ログインの件数・主体を集計できるが、分析collectorへ有効なパスワードを送信しない。','ブラウザーで正常ログインが成功した後、別HTTPSリスナーのローカルcollectorへ実際にJSONを送信する。Vは入力passwordを含め、F/Nは公開属性だけを送る。ブラウザーの正常操作と両originの観測が必要。外部サービスへの通信は行わない。'),
  define('R0458','B0458','文書読込の診断記録','error-reporting','エラーcollectorへのAuthorization送信','/error-reporting',['error-reporting','token'],[['GET','/error-reporting',{}],['GET','/token',{}],['POST','/error-reporting',{document:'{}'}]],'正常読込と汎用障害記録は維持し、実例外のcontextからAuthorizationを除いてcollectorへ送信する。','ブラウザーが実署名済みJWTで読込APIを呼び、JSON.parseの実例外による400を受けた際に別HTTPSリスナーのローカルcollectorへ障害contextを送る。Vは実リクエストAuthorizationを含め、F/Nは公開属性だけを送信。ブラウザー操作と両originの観測が必要。公開エラー本文へ秘密を返すR0481とは宛先境界が異なる。')
];

const folder='/opt/benchmark/fixtures/data-handling';
const roots=definitions.map(item=>item.root);
let collectorKey=null,publicGeneration=0;
export async function reset({db,getRun,token}) {
  await db.query('CREATE TABLE IF NOT EXISTS presentation_profiles(username text PRIMARY KEY,display_name text NOT NULL,internal_code text NOT NULL,report text NOT NULL); TRUNCATE presentation_profiles;');
  const run=getRun();
  for(const name of ['alice','bob','carol','approver','admin'])await db.query('INSERT INTO presentation_profiles VALUES($1,$2,$3,$4)',[name,name==='alice'?'Alice Member':name+' Member',name==='alice'?run.canary:token(),name==='alice'?run.canary:name+' operating notes']);
  await mkdir(folder+'/public',{recursive:true});await mkdir(folder+'/private',{recursive:true});
  for(const area of ['public','private'])for(const name of ['alice','bob','carol','approver','admin'])await unlink(folder+'/'+area+'/'+name+'.txt').catch(error=>{if(error.code!=='ENOENT')throw error;});
  collectorKey=token();publicGeneration=0;
}
const collectorAdmission="if redis.call('LLEN',KEYS[1])>=24 then return 0 end;redis.call('RPUSH',KEYS[1],ARGV[1]);return 1";
export function registerCollector(router,{redis,getRun}) {
  router.use('/collect-events',(req,res,next)=>{
    if(!['R0457','R0458'].includes(getRun().root))return res.sendStatus(404);
    const origin=String(req.headers.origin||'');
    if(!/^https:\/\/(app|localhost|127\.0\.0\.1):8443$/.test(origin))return res.sendStatus(403);
    res.set({'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type, X-Event-Key','Cache-Control':'no-store'});
    if(req.method==='OPTIONS')return res.sendStatus(204);next();
  });
  router.post('/collect-events',async(req,res)=>{
    if(req.headers['x-event-key']!==collectorKey)return res.sendStatus(404);
    if(req.body?.kind!==(getRun().root==='R0457'?'analytics':'error')||!req.body.event||typeof req.body.event!=='object'||Array.isArray(req.body.event))return res.sendStatus(400);
    const key='collector:'+req.body.kind;
    const admitted=await redis.eval(collectorAdmission,{keys:[key],arguments:[JSON.stringify(req.body.event)]});
    res.sendStatus(admitted===1?202:429);
  });
}
export async function audit({redis,getRun}) {
  if(!roots.includes(getRun().root))return null;
  return {collector:{analytics:(await redis.lRange('collector:analytics',0,-1)).map(JSON.parse),error:(await redis.lRange('collector:error',0,-1)).map(JSON.parse)}};
}
export function register(router,ctx) {
  const {db,redis,getRun,vulnerable,requireLogin,page,esc,token,decodeJWT,jwt,serveStatic}=ctx;
  const get=(path,root,handler)=>router.get(path,(req,res,next)=>getRun().root===root?handler(req,res,next):next());
  const post=(path,root,handler)=>router.post(path,(req,res,next)=>getRun().root===root?handler(req,res,next):next());
  const html=(res,title,body)=>res.set('Cache-Control','no-store').type('html').send(page(title,body));
  // These two delivery paths have the same policy in every arm. Only the
  // generator's storage destination changes; public placement bypasses private delivery.
  router.use('/generated-report',(req,res,next)=>getRun().root==='R0455'?next():res.sendStatus(404),serveStatic(folder+'/public',{index:false,dotfiles:'deny',redirect:false,setHeaders:res=>res.setHeader('Cache-Control','no-store')}));
  // The event key only admits bounded fixture writes. It grants no read,
  // control, user session, or private oracle capability.
  const collectorScript=()=>`const collector=new URL(location.href);collector.port='8444';collector.pathname='/collect-events';collector.search='';collector.hash='';const sendEvent=async(kind,event)=>{const r=await fetch(collector,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-Event-Key':${JSON.stringify(collectorKey)}},body:JSON.stringify({kind,event})});if(r.status!==202)throw Error('Collector unavailable')};`;
  get('/member-card','R0094',async(req,res)=>{
    if(!requireLogin(req,res))return;
    const model=(await db.query('SELECT username,display_name,internal_code FROM presentation_profiles WHERE username=$1',[req.member.name])).rows[0];
    res.set('Cache-Control','no-store').json(vulnerable()?model:{username:model.username,display_name:model.display_name});
  });
  get('/browser-access','R0452',(req,res)=>{
    if(!requireLogin(req,res))return;
    const key='member-access:'+getRun().base;
    html(res,'会員アクセスパス',`<pre id="result">Loading</pre><script>(async()=>{const data=await(await fetch(${JSON.stringify(getRun().base+'/browser-pass')})).json();const pass=data.token;${vulnerable()?'localStorage.setItem('+JSON.stringify(key)+',pass);':''}window.readMember=async()=>{const r=await fetch(${JSON.stringify(getRun().base+'/browser-member')},{headers:{Authorization:'Bearer '+pass}});document.getElementById('result').textContent=await r.text();return r.status};await window.readMember()})()</script>`);
  });
  get('/browser-pass','R0452',async(req,res)=>{
    if(!requireLogin(req,res))return;
    const value=token();await redis.set('browser-pass:'+value,JSON.stringify({username:req.member.name}),{EX:3600});
    res.set('Cache-Control','no-store').json({token:value,expiresIn:3600});
  });
  get('/browser-member','R0452',async(req,res)=>{
    const value=/^Bearer ([a-f0-9]{48})$/.exec(req.headers.authorization||'')?.[1];
    const raw=value?await redis.get('browser-pass:'+value):null;if(!raw)return res.sendStatus(401);
    const member=JSON.parse(raw);res.set('Cache-Control','no-store').json({username:member.username,service:'Member access is available'});
  });
  get('/offline-dashboard','R0453',(req,res)=>{
    if(!requireLogin(req,res))return;
    html(res,'会員ダッシュボード',`<button id="load">会員データ</button><pre id="report"></pre><script>navigator.serviceWorker.register(${JSON.stringify(getRun().base+'/dashboard-worker.js')},{scope:${JSON.stringify(getRun().base+'/')}});document.getElementById('load').onclick=async()=>{const r=await fetch(${JSON.stringify(getRun().base+'/dashboard-data')});document.getElementById('report').textContent=await r.text()}</script>`);
  });
  get('/dashboard-worker.js','R0453',(req,res)=>{
    const base=getRun().base,cache='dashboard:'+base;
    res.set({'Cache-Control':'no-store','Service-Worker-Allowed':base+'/'}).type('application/javascript').send(`const cacheName=${JSON.stringify(cache)};self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil((async()=>{await caches.delete(cacheName);await self.clients.claim()})()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==self.location.origin||e.request.method!=='GET')return;const personal=u.pathname===${JSON.stringify(base+'/dashboard-data')};const publicInfo=u.pathname===${JSON.stringify(base+'/dashboard-public')};if(!publicInfo${vulnerable()?'&&!personal':''})return;e.respondWith((async()=>{const store=await caches.open(cacheName);const hit=await store.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)await store.put(e.request,r.clone());return r})())});`);
  });
  get('/dashboard-data','R0453',async(req,res)=>{
    res.set('Cache-Control','no-store');if(!requireLogin(req,res))return;
    const item=(await db.query('SELECT report FROM presentation_profiles WHERE username=$1',[req.member.name])).rows[0];res.json({username:req.member.name,report:item.report});
  });
  get('/dashboard-public','R0453',(req,res)=>res.set('Cache-Control','no-store').json({message:'Public opening hours',generation:++publicGeneration}));
  get('/personal-reports','R0455',(req,res)=>{
    if(!requireLogin(req,res))return;
    html(res,'個人帳票',`<form method="post"><button>帳票を生成</button></form><a href="${getRun().base}/generated-report/${esc(req.member.name)}.txt">取得</a>`);
  });
  post('/personal-reports','R0455',async(req,res)=>{
    if(!requireLogin(req,res))return;
    const item=(await db.query('SELECT report FROM presentation_profiles WHERE username=$1',[req.member.name])).rows[0];
    await writeFile(folder+'/'+(vulnerable()?'public':'private')+'/'+req.member.name+'.txt',item.report);
    await redis.set('generated-report:'+req.member.name,'ready');res.json({url:getRun().base+'/generated-report/'+req.member.name+'.txt'});
  });
  get('/generated-report/:filename','R0455',async(req,res)=>{
    const match=/^(alice|bob|carol|approver|admin)\.txt$/.exec(req.params.filename);if(!match||!await redis.get('generated-report:'+match[1]))return res.sendStatus(404);
    if(!requireLogin(req,res))return;if(req.member.name!==match[1])return res.sendStatus(403);
    res.set('Cache-Control','no-store').type('text').send(await readFile(folder+'/private/'+req.params.filename,'utf8'));
  });
  get('/login-analytics','R0457',(req,res)=>html(res,'ログイン利用状況',`<form id="analytics-login" action="${getRun().base}/login" method="post"><input name="username" value="alice"><input name="password" type="password"><button>ログイン</button></form><pre id="result"></pre><script>${collectorScript()}document.getElementById('analytics-login').onsubmit=async e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.target));const r=await fetch(e.target.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});if(!r.ok){document.getElementById('result').textContent='Login failed';return}const event={action:'login_success',username:fields.username${vulnerable()?',password:fields.password':''}};await sendEvent('analytics',event);document.getElementById('result').textContent='Logged in';window.analyticsComplete=true}</script>`));
  get('/error-reporting','R0458',(req,res)=>{
    if(!requireLogin(req,res))return;
    html(res,'文書読込の診断記録',`<p>会員アクセストークンを使いJSON文書を読み込みます。</p><textarea id="document">{}</textarea><button id="load">読み込む</button><pre id="result"></pre><script>${collectorScript()}document.getElementById('load').onclick=async()=>{window.errorEventComplete=false;const issued=await(await fetch(${JSON.stringify(getRun().base+'/token')})).json();const headers={'Content-Type':'application/json',Authorization:'Bearer '+issued.token};const r=await fetch(${JSON.stringify(getRun().base+'/error-reporting')},{method:'POST',headers,body:JSON.stringify({document:document.getElementById('document').value})});const data=await r.json();document.getElementById('result').textContent=JSON.stringify(data);if(r.status===400){const event={message:'Document parse failed',type:data.type,username:${JSON.stringify(req.member.name)}${vulnerable()?',authorization:headers.Authorization':''}};await sendEvent('error',event);window.errorEventComplete=true}}</script>`);
  });
  get('/token','R0458',(req,res)=>{
    if(!requireLogin(req,res))return;
    res.set('Cache-Control','no-store').json({token:jwt({sub:req.member.name,role:req.member.role,iss:'fixture-idp',aud:'member-api',exp:Math.floor(Date.now()/1000)+600})});
  });
  post('/error-reporting','R0458',async(req,res)=>{
    if(!requireLogin(req,res))return;
    const auth=String(req.headers.authorization||''),claims=decodeJWT(auth.replace(/^Bearer /,''));
    if(!claims||claims.sub!==req.member.name)return res.sendStatus(401);
    try{JSON.parse(String(req.body.document));res.json({loaded:true});}
    catch(error){res.status(400).json({error:'Invalid document',type:error.name});}
  });
}
