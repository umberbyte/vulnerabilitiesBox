import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';

const definition=(root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote)=>({root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote});
export const definitions=[
  definition('R0461','B0461','会員アクセス','transport-access','HTTPの認証情報送信','/transport-access',['transport-access','transport-help'],[['GET','/transport-access',{}],['POST','/transport-access',{username:'alice',password:'Fixture-alice-2026!'}],['GET','/transport-help',{}]],'HTTP上の公開案内は利用できるが、正常なログインフォームは資格情報の入力前にHTTPSへ移動する。','HTTP 8080を開始点とする実ブラウザーのフォーム通信で比較。F/NはGETをHTTPSへ移動しHTTP POSTを拒否する。拒否しても既に送信された資格情報を秘匿できるとは主張しない。現行ZAP wrapperはHTTPSのみのscopeなので、HTTP側は別の診断条件が必要。'),
  definition('R0464','B0464','公開ダウンロード','download-listing','公開rootとディレクトリ一覧','/downloads',['downloads'],[['GET','/downloads',{}],['GET','/downloads/list',{}],['GET','/downloads/files/guide.txt',{}]],'明示的に公開したガイドは取得できるが、内部バックアップの一覧・本文は公開しない。','実ファイルとreaddirで一覧と本文取得を確認。Vは公開ガイドと内部バックアップの混在directoryを公開し、F/Nは公開ファイルの固定許可表で配信する。経路解釈差のR0124とは区別する。'),
  definition('R0465','B0465','サービス状態','support-status','公開debugルート','/support-status',['support-status','support-diagnostics'],[['GET','/support-status',{}],['GET','/support-diagnostics',{}]],'公開してよい状態確認は利用できるが、詳細debugルートから実行中の秘密設定を取得できない。','debug経路が実際に使用する内部DB設定を出力。F/Nではこのルートを公開面から除外し、通常の状態確認を維持する。制御鍵・oracle・ホストの実秘密は含めない。'),
  definition('R0477','B0477','会員レポート','private-cache','ログアウト後のブラウザーcache','/account-summary',['account-summary','private-report','public-report'],[['GET','/account-summary',{}],['GET','/private-report',{}],['GET','/public-report',{}]],'公開情報のcacheは再利用できるが、機密レポートはログアウト後にブラウザーcacheから取得できない。','実ChromiumのHTTP cacheで確認。Vはno-storeを欠くfreshなprivate応答、F/Nはno-store。サーバーは全条件でログアウト後の再要求を拒否し、Redis共有cacheの混在とは区別する。'),
  definition('R0478','B0478','公開クライアント設定','client-configuration','DB資格情報の公開config混入','/client-settings',['client-settings','client-settings.js'],[['GET','/client-settings',{}],['GET','/client-settings.js',{}]],'公開のアプリ設定は利用できるが、実DBのログイン資格情報を含めない。','専用の読取用PostgreSQL roleを作成し、実際のアプリDB接続に使うURLをVだけで公開JSへ混入する。公開で観察した資格情報による秘密行の実読取を非公開の管理者probeで検証。DBポートは診断networkへ公開しない。'),
  definition('R0481','B0481','商品照会','error-detail','例外応答の秘密context','/item-status',['item-status'],[['GET','/item-status',{id:1}]],'正常照会は成功し、DBが不正な型を拒否しても公開エラーには秘密設定やstackを含めない。','実PostgreSQLのinteger変換エラーを発生させ、実際の接続設定を含む詳細例外応答と外部汎用応答を比較する。HTTP 400/500という状態だけでは成立としない。')
];

const directory='/opt/benchmark/fixtures/configuration';
const role='fixture_feature_reader';
const databaseRoots=['R0465','R0478','R0481'];
let client=null,privateConfiguration=null,publicReportSequence=0;

export async function reset(ctx){
  if(client){await client.end();client=null;}
  const {db,getRun,token,createPool,databaseUrl}=ctx,run=getRun();
  publicReportSequence=0;
  // Replace the dedicated role's credential even when moving to another case.
  // No application, scanner or host credential is repurposed here.
  const password=databaseRoots.includes(run.root)?run.canary:token();
  await db.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fixture_feature_reader') THEN CREATE ROLE fixture_feature_reader LOGIN; END IF; END $$;`);
  const statement=(await db.query("SELECT format('ALTER ROLE fixture_feature_reader PASSWORD %L', $1::text) AS statement",[password])).rows[0].statement;
  await db.query(statement);await db.query('GRANT SELECT ON items TO fixture_feature_reader');
  await mkdir(directory,{recursive:true});
  await writeFile(directory+'/guide.txt','Public download guide');
  await writeFile(directory+'/internal-status.backup.txt',run.canary);
  privateConfiguration=null;
  if(databaseRoots.includes(run.root)){
    const url=new URL(databaseUrl);url.username=role;url.password=password;
    await writeFile(directory+'/private.json',JSON.stringify({databaseUrl:url.href}));
    privateConfiguration=JSON.parse(await readFile(directory+'/private.json','utf8'));
    client=createPool({connectionString:privateConfiguration.databaseUrl,max:1,connectionTimeoutMillis:3000});
    await client.query('SELECT 1');
  }else await writeFile(directory+'/private.json','{}');
  if(run.root==='R0477')await db.query('UPDATE documents SET body=$1 WHERE id=101',[run.canary]);
}

export async function databaseProof(ctx,submitted){
  if(ctx.getRun().root!=='R0478')return {supported:false};
  let url;try{url=new URL(submitted);}catch{return {supported:true,authenticated:false};}
  const expected=new URL(ctx.databaseUrl);
  if(url.protocol!==expected.protocol||url.hostname!==expected.hostname||url.port!==expected.port||url.pathname!==expected.pathname||url.username!==role||url.search||url.hash)return {supported:true,authenticated:false};
  const probe=ctx.createPool({connectionString:url.href,max:1,connectionTimeoutMillis:3000});
  try{
    const identity=(await probe.query('SELECT current_user AS username')).rows[0];
    const values=(await probe.query('SELECT title FROM items WHERE secret=true ORDER BY id')).rows;
    return {supported:true,authenticated:true,username:identity.username,privateRows:values};
  }catch{return {supported:true,authenticated:false};}finally{await probe.end();}
}

export function register(router,ctx){
  const {db,getRun,vulnerable,page,esc,requireLogin,user,newSession}=ctx;
  const only=(root,handler)=>(req,res,next)=>getRun().root===root?handler(req,res,next):next();
  const get=(p,root,handler)=>router.get(p,only(root,handler));
  const post=(p,root,handler)=>router.post(p,only(root,handler));
  const html=(res,title,body)=>res.type('html').send(page(title,body));
  const secureLocation=req=>{
    const host=['app','localhost','127.0.0.1'].includes(req.hostname)?req.hostname:'app';
    return 'https://'+host+':8443'+getRun().base+'/transport-access';
  };
  get('/transport-access','R0461',(req,res)=>{
    if(!vulnerable()&&!req.secure)return res.redirect(308,secureLocation(req));
    res.set('Cache-Control','no-store');html(res,'会員アクセス','<form method="post"><label>会員名<input name="username" value="alice"></label><label>パスワード<input name="password" type="password"></label><button>ログイン</button></form>');
  });
  post('/transport-access','R0461',async(req,res)=>{
    res.set('Cache-Control','no-store');if(!vulnerable()&&!req.secure)return res.status(426).json({error:'HTTPS required'});
    const member=await user(String(req.body.username||''));
    if(!member||member.password!==String(req.body.password||''))return res.sendStatus(401);
    await newSession(res,req.secure,member.name);res.json({loggedIn:true,username:member.name});
  });
  get('/transport-help','R0461',(req,res)=>res.type('text').send('Public information: use the member access page to sign in.'));

  get('/downloads','R0464',(req,res)=>html(res,'公開ダウンロード',`<a href="${getRun().base}/downloads/files/guide.txt">公開ガイド</a><a href="${getRun().base}/downloads/list">一覧</a>`));
  get('/downloads/list','R0464',async(req,res)=>{
    if(!vulnerable())return res.sendStatus(404);
    const files=(await readdir(directory)).filter(name=>['guide.txt','internal-status.backup.txt'].includes(name)).sort();
    html(res,'Index of downloads','<ul>'+files.map(name=>`<li><a href="${getRun().base}/downloads/files/${encodeURIComponent(name)}">${esc(name)}</a></li>`).join('')+'</ul>');
  });
  get('/downloads/files/:filename','R0464',async(req,res)=>{
    const name=req.params.filename,allowed=vulnerable()?['guide.txt','internal-status.backup.txt']:['guide.txt'];
    if(!allowed.includes(name))return res.sendStatus(404);
    res.type('text').send(await readFile(directory+'/'+name,'utf8'));
  });

  get('/support-status','R0465',async(req,res)=>{
    const count=(await client.query('SELECT count(*)::int AS count FROM items WHERE secret=false')).rows[0].count;
    res.json({status:'ready',publicItems:count,diagnostics:getRun().base+'/support-diagnostics'});
  });
  get('/support-diagnostics','R0465',async(req,res)=>{
    if(!vulnerable())return res.sendStatus(404);
    const identity=(await client.query('SELECT current_user AS username')).rows[0];
    res.set('Cache-Control','no-store').json({runtime:process.version,databaseUser:identity.username,configuration:privateConfiguration});
  });

  get('/account-summary','R0477',(req,res)=>{
    if(!requireLogin(req,res))return;
    res.set('Cache-Control','no-store');html(res,'会員レポート',`<button id="load">レポートを取得</button><pre id="report"></pre><script>document.getElementById('load').onclick=async()=>{const r=await fetch(${JSON.stringify(getRun().base+'/private-report')});document.getElementById('report').textContent=await r.text()}</script>`);
  });
  get('/private-report','R0477',async(req,res)=>{
    res.set('Cache-Control','no-store');if(!requireLogin(req,res))return;
    const document=(await db.query('SELECT body FROM documents WHERE id=101 AND owner=$1',[req.member.name])).rows[0];
    if(!document)return res.sendStatus(403);
    if(vulnerable())res.set('Cache-Control','private, max-age=300');
    res.json({username:req.member.name,report:document.body});
  });
  get('/public-report','R0477',(req,res)=>res.set('Cache-Control','public, max-age=300').json({message:'Public service hours: weekdays 09:00-17:00',generation:++publicReportSequence}));

  get('/client-settings','R0478',async(req,res)=>{
    const products=(await client.query('SELECT title FROM items WHERE secret=false ORDER BY id')).rows;
    html(res,'公開クライアント設定',`<script src="${getRun().base}/client-settings.js"></script><p>${products.map(p=>esc(p.title)).join(', ')}</p>`);
  });
  get('/client-settings.js','R0478',(req,res)=>{
    const configuration={appPath:getRun().base,...(vulnerable()?privateConfiguration:{})};
    res.set('Cache-Control','no-store').type('application/javascript').send('window.pageConfiguration='+JSON.stringify(configuration)+';');
  });

  get('/item-status','R0481',async(req,res)=>{
    const query='SELECT id,title FROM items WHERE id=$1 AND secret=false';
    try{
      const rows=(await client.query(query,[req.query.id??'1'])).rows;
      res.set('Cache-Control','no-store').json({items:rows});
    }catch(error){
      res.set('Cache-Control','no-store');
      if(vulnerable())return res.status(400).json({error:error.message,stack:error.stack,query,configuration:privateConfiguration});
      res.status(400).json({error:'Invalid item identifier'});
    }
  });
}
