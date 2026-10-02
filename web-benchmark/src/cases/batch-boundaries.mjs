import {mkdir,readFile,writeFile,realpath,symlink,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac,timingSafeEqual} from 'node:crypto';

const define=(root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote,sessionProtectedPath)=>({root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote,...(sessionProtectedPath?{sessionProtectedPath}:{})});
export const definitions=[
  define('R0003','B0003','商品表示項目','column-selection','SELECT列の識別子境界','/product-columns',['product-columns'],[['GET','/product-columns',{columns:'title',q:'Apple'}]],'正規の表示列の組合せと引用符を含む検索語は利用でき、秘密列は選択できない。','実PostgreSQL SELECTリストへ利用者の列指定を採用するVと固定列対応表のF/Nを比較。検索値は全条件でbindし、ORDER BY式のR0005・値連結のR0001と分離する。'),
  define('R0006','B0006','商品番号フィルタ','operator-selection','WHERE比較演算子の境界','/product-filter',['product-filter'],[['GET','/product-filter',{comparator:'=',value:'1'}]],'許可された等値・大小比較は使え、利用者の演算子文字列で保護行の条件を変更できない。','実PostgreSQL WHEREの比較演算子だけをVで連結。比較値は全条件bindし、F/Nは固定演算子対応表を使う。秘密行の検索値やSELECT列は入力へ開放しない。'),
  define('R0121','B0121','公開文書の読込','relative-file-read','相対pathのroot境界','/public-document',['public-document'],[['GET','/public-document',{filename:'readme.txt'}]],'root内の正規ファイルとroot内に戻る相対pathは読め、親directoryの秘密ファイルは読めない。','実fs.readFileとrealpathで相対pathのroot境界を比較。全条件でfixture全体の外を拒否し、Vだけ公開root境界が欠ける。R0124の区切り解釈差とは独立。'),
  define('R0123','B0123','エンコード文書の読込','decoded-file-read','検査後の二段URL decode','/encoded-document',['encoded-document'],[['GET','/encoded-document',{urlPath:'readme.txt'}]],'空白を符号化した正規名とpercent文字を含む実ファイルは読め、検査後のdecodeで公開rootを出られない。','Expressのquery decode後にアプリ側decodeを行う実装。Vはアプリ側decode前のpathを検査し、F/Nは利用するdecode済みpathを検査する。全条件で最終read先を固定fixture内に制限。'),
  define('R0126','B0126','リンク文書の読込','linked-file-read','symlinkの解決先境界','/linked-document',['linked-document'],[['GET','/linked-document',{link:'guide-link.txt'}]],'公開root内への正規symlinkは利用でき、公開root内の名前から非公開inodeを読めない。','実Linux symlinkとrealpathを使用。全条件で入力pathの公開root内を確認し、Vだけ解決先の公開root検査が欠ける。HTTPエラーだけでlink追跡成立を判定しない。'),
  define('R0135','B0135','配信context','relative-static-root','相対static root構築','/site-static/readme.txt',['site-static','static-context'],[['GET','/site-static/readme.txt',{}],['GET','/static-context',{}],['POST','/static-context',{workingDirectory:'site'}]],'固定された配信contextを切り替えても公開ガイドの配信を維持し、作業directory側の内部ファイルを公開しない。','実express.static factoryが相対rootを構築時のcwdから絶対化する挙動を比較。固定2dirのcontext選択でmiddlewareを再構築し、Vは相対public、F/Nは絶対public。通常フォームにsite/previewの正当な選択肢を提示する。既存middlewareが後からcwd変更に追随すると主張しない。process.chdirは同期factory区間だけで必ず復元し、resetで/opt/benchmarkへ戻す。'),
  define('R0137','B0137','ガイドURI','file-uri-loader','URI schemeとlocal file読込','/uri-document',['uri-document'],[['GET','/uri-document',{uri:'guide:readme'}]],'正規guide URIは利用でき、HTTP入力のfile URIから非公開ファイルを読めない。','実URL/fileURLToPath/fs.readFileでVのfile scheme読込を実証。F/Nはguide schemeの固定resourceだけを許可する。ネットワークschemeの接続は全条件で行わず、fileは有限fixture内だけを許可。'),
  define('R0138','B0138','会員ファイル領域','filesystem-mount','主体とFS mount名前空間','/mounted-document',['mounted-document'],[['GET','/mounted-document',{mountId:'alice'}]],'本人のmount上の文書は取得でき、他主体のmount指定では非公開文書を読めない。','固定5主体の実directoryを仮想mount表として利用。Vだけ利用者が別主体のmountを選べ、F/Nは認証主体へ固定する。任意host mountやOS権限変更は行わない。','/mounted-document'),
  define('R0247','B0247','会員APIアクセス券','jwt-audience','JWT audience境界','/access-pass',['access-pass','connected-pass','account-report','connected-report'],[['GET','/access-pass',{}],['GET','/connected-pass',{}],['GET','/account-report',{}],['GET','/connected-report',{}]],'正常な会員API券は利用でき、同じ鍵で正規署名された別サービス券は会員APIへ転用できない。','実HMAC署名・期限・issuer・token目的・存在する主体を全条件で検証し、Vだけ会員APIの期待aud検査を省く。別サービス側でも正規券として利用できるfixtureを発行。','/access-pass'),
  define('R0248','B0248','連携発行系のアクセス券','jwt-issuer','JWT issuerと共有鍵の境界','/access-pass',['access-pass','connected-pass','account-report','connected-report'],[['GET','/access-pass',{}],['GET','/connected-pass',{}],['GET','/account-report',{}],['GET','/connected-report',{}]],'信頼issuerの正規券は利用でき、共用署名鍵で発行された別issuer券は会員APIへ転用できない。','実HMACを全条件で検証し、Vだけissuerの固定対応を落とす。fixtureの2発行系が同じ強い鍵を使う条件は共通で、aud・期限・用途の検査は維持する。','/access-pass'),
  define('R0249','B0249','用途別アクセス券','jwt-purpose','ID tokenとAPI access tokenの境界','/access-pass',['access-pass','connected-pass','account-report','connected-report'],[['GET','/access-pass',{}],['GET','/connected-pass',{}],['GET','/account-report',{}],['GET','/connected-report',{}]],'正規API access tokenは利用でき、正規ID tokenのtypと目的をAPI access tokenとして受理しない。','実HMAC署名とaud/issuer/期限を全条件で検証。Vだけtypとpurposeの組を確認せず、F/Nはat+jwt/apiを要求する。ID tokenは別の本人情報確認機能で正規に使用できる。','/access-pass'),
  define('R0368','B0368','サービスから戻る','return-redirect','Locationの遷移先URL境界','/return-redirect',['return-redirect','return-complete'],[['GET','/return-redirect',{returnUrl:'return-complete'}],['GET','/return-complete',{}]],'許可された相対pathとURL風のquery値は利用でき、別originへ戻り先を変更できない。','実Location応答と別ローカルHTTPS listenerへのブラウザー遷移で検証。F/NはWHATWG URLで同一originかつ固定workspace pathを要求。外部originは応答解析だけで確認し接続しない。元protocol_concurrency trackを維持し、request smuggling等のparser欠陥は対象にしない。'),
  define('R0497','B0497','件数指定の文書取得','nan-limit','NaN比較による範囲検査回避','/limited-records',['limited-records'],[['GET','/limited-records',{numericValue:'3'}]],'正規の0～5整数件数は利用でき、数値変換失敗で比較条件を迂回して保護末尾行を取得できない。','実JavaScript Number/NaN比較と実PostgreSQLの12行を使用。VはNaNが上限・下限比較を通過し、ループ停止比較も成立せず12行を読む。全条件の物理guardは12行。元core_dast trackを維持し、N-API/nativeメモリ破壊・ASanは実装/検証していない。'),
  define('R0498','B0498','大きな番号の文書','integer-precision','64bit IDのNumber衝突','/precision-object',['precision-object'],[['GET','/precision-object',{objectId:'42'}]],'通常番号と正確に保持した大きな番号は区別され、許可された番号が他の秘密番号へ衝突しない。','PostgreSQL bigintで保持した別IDをVだけ実JavaScript NumberキーのMapへ変換。秘密IDの直接指定は全条件で拒否した上で、許可IDが別IDへ衝突する境界を検証。F/Nは文字列キー。元core_dast trackを維持し、native overflow/ASanとは称さない。'),
  define('R0499','B0499','小口見積明細','decimal-rounding','浮動小数と段階丸めの境界','/decimal-invoice',['decimal-invoice'],[['GET','/decimal-invoice',{}],['POST','/decimal-invoice',{money:'0.10,0.20'}]],'正規の小数価格と上限金額は利用でき、保存した明細のminor単位合計と請求額が一致する。','実JavaScript浮動小数の明細丸めと合計丸めをVで使用し、実PostgreSQLに両方を保存。F/Nはdecimal文字列を整数minor単位へ一度変換して合算。既存購入の指定価格・数量欠陥とは独立。元core_dast trackを維持し、nativeメモリ破壊/ASanは未対象。'),
  define('R0500','B0500','並び順の文書','negative-array-index','Array.atの負index境界','/indexed-document',['indexed-document'],[['GET','/indexed-document',{index:'0'}]],'公開の0・1番号は取得でき、負indexが末尾の保護文書を参照できない。','実JavaScript Array.atを使用。全条件で整数型と公開上限を検査し、Vだけindex非負を検査しない。元core_dast trackを維持し、native境界外memoryアクセスやASan検知を主張しない。')
];

const fixture='/opt/benchmark/fixtures/batch-boundaries';
const publicRoot=fixture+'/public';
const inRoot=(root,value)=>value===root||value.startsWith(root+path.sep);
const names=['alice','bob','carol','approver','admin'];
let staticMiddleware=null;
function staticFactory(serveStatic,vulnerable,directory) {
  const previous=process.cwd();
  try {process.chdir(fixture+'/contexts/'+directory);return serveStatic(vulnerable?'public':fixture+'/contexts/site/public',{index:false,redirect:false,dotfiles:'deny'});}
  finally {process.chdir(previous);}
}
export async function reset({db,getRun}) {
  // This reset belongs to the container app. No host working directory is used.
  process.chdir('/opt/benchmark');staticMiddleware=null;
  await db.query(`CREATE TABLE IF NOT EXISTS boundary_products(id integer PRIMARY KEY,title text NOT NULL,category text NOT NULL,secret_note text NOT NULL,private boolean NOT NULL);
    CREATE TABLE IF NOT EXISTS boundary_numeric_records(id integer PRIMARY KEY,body text NOT NULL);
    CREATE TABLE IF NOT EXISTS boundary_precision_objects(id bigint PRIMARY KEY,body text NOT NULL,private boolean NOT NULL);
    CREATE TABLE IF NOT EXISTS boundary_invoices(id serial PRIMARY KEY,total_minor integer NOT NULL);
    CREATE TABLE IF NOT EXISTS boundary_invoice_lines(invoice_id integer NOT NULL,position integer NOT NULL,amount_minor integer NOT NULL);
    TRUNCATE boundary_products,boundary_numeric_records,boundary_precision_objects,boundary_invoices,boundary_invoice_lines RESTART IDENTITY;`);
  const c=getRun().canary;
  await db.query('INSERT INTO boundary_products VALUES(1,$1,$2,$3,false),(2,$4,$2,$3,false),(3,$3,$5,$3,true)',['Apple','fruit',c,'Banana','restricted']);
  for(let i=0;i<12;i++)await db.query('INSERT INTO boundary_numeric_records VALUES($1,$2)',[i,i===11?c:'Public record '+i]);
  for(const [id,body,privateFlag] of [['42','Ordinary object',false],['9007199254740992','Large public object',false],['9007199254740993',c,true],['9007199254740994','Another large public object',false]])await db.query('INSERT INTO boundary_precision_objects VALUES($1,$2,$3)',[id,body,privateFlag]);
  for(const directory of [publicRoot,publicRoot+'/archive',fixture+'/private',fixture+'/contexts/site/public',fixture+'/contexts/preview/public',...names.map(name=>fixture+'/mounts/'+name)])await mkdir(directory,{recursive:true});
  await writeFile(publicRoot+'/readme.txt','Public boundary guide');
  await writeFile(publicRoot+"/quarter'notes.txt",'Quoted filename guide');
  await writeFile(publicRoot+'/public-note space.txt','Space filename guide');
  await writeFile(publicRoot+'/literal%.txt','Percent filename guide');
  await writeFile(fixture+'/private/report.txt',c);
  for(const [name,target] of [['guide-link.txt',publicRoot+'/readme.txt'],['linked-report.txt',fixture+'/private/report.txt']]){
    await unlink(publicRoot+'/'+name).catch(error=>{if(error.code!=='ENOENT')throw error;});await symlink(target,publicRoot+'/'+name);
  }
  for(const context of ['site','preview'])await writeFile(fixture+'/contexts/'+context+'/public/readme.txt','Public site guide');
  await unlink(fixture+'/contexts/site/public/report.txt').catch(error=>{if(error.code!=='ENOENT')throw error;});
  await writeFile(fixture+'/contexts/preview/public/report.txt',c);
  for(const name of names)await writeFile(fixture+'/mounts/'+name+'/note.txt',name==='bob'?c:name+' filesystem note');
}
export async function audit({db,getRun}) {
  if(!definitions.some(item=>item.root===getRun().root))return null;
  return {boundaries:{numericOperations:(await db.query("SELECT username,action FROM operations WHERE action='nan-limited-read' ORDER BY id")).rows,invoices:(await db.query('SELECT id,total_minor FROM boundary_invoices ORDER BY id')).rows,invoiceLines:(await db.query('SELECT invoice_id,position,amount_minor FROM boundary_invoice_lines ORDER BY invoice_id,position')).rows}};
}

const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const signed=(header,body,key)=>{const data=b64(header)+'.'+b64(body);return data+'.'+createHmac('sha256',key).update(data).digest('base64url');};
function parsedJWT(value,key) {
  try {
    if(typeof value!=='string'||value.length>8192)return null;
    const parts=value.split('.');if(parts.length!==3)return null;
    const header=JSON.parse(Buffer.from(parts[0],'base64url')),body=JSON.parse(Buffer.from(parts[1],'base64url'));
    if(!header||header.alg!=='HS256'||!body||!equal(parts[2],createHmac('sha256',key).update(parts[0]+'.'+parts[1]).digest('base64url')))return null;
    if(typeof body.sub!=='string'||!Number.isFinite(body.exp)||body.exp<=Date.now()/1000)return null;
    return {header,body};
  }catch{return null;}
}
const decimalMinor=value=>{const [integer,fraction='']=value.split('.'),milli=BigInt(integer)*1000n+BigInt((fraction+'000').slice(0,3));return Number((milli+5n)/10n);};

export function register(router,ctx) {
  const {db,getRun,vulnerable,requireLogin,page,user,serveStatic}=ctx;
  const get=(route,root,handler)=>router.get(route,(req,res,next)=>getRun().root===root?handler(req,res,next):next());
  const post=(route,root,handler)=>router.post(route,(req,res,next)=>getRun().root===root?handler(req,res,next):next());
  const textFile=async(res,filename)=>{if(!inRoot(fixture,path.resolve(filename)))return res.sendStatus(403);try {const resolved=await realpath(filename);if(!inRoot(fixture,resolved))return res.sendStatus(403);res.set('Cache-Control','no-store').type('text').send(await readFile(resolved,'utf8'));}catch(error){if(['ENOENT','ENOTDIR','EINVAL'].includes(error.code))return res.sendStatus(404);throw error;}};
  get('/product-columns','R0003',async(req,res)=>{
    const columns=String(req.query.columns||'title'),q=String(req.query.q||'');if(columns.length>256||q.length>256)return res.sendStatus(400);
    const allowed={title:'title',category:'category','title,category':'title,category'};
    const selected=vulnerable()?(allowed[columns]||columns):allowed[columns];if(!selected)return res.sendStatus(400);
    try {res.json({items:(await db.query(`SELECT ${selected} FROM boundary_products WHERE private=false AND title ILIKE $1 ORDER BY id`,['%'+q+'%'])).rows});}
    catch {res.status(400).json({error:'Invalid columns'});}
  });
  get('/product-filter','R0006',async(req,res)=>{
    const comparator=String(req.query.comparator||'='),value=String(req.query.value??'1');if(comparator.length>128||!/^\d{1,3}$/.test(value))return res.sendStatus(400);
    const allowed={'=':'=','<':'<','>':'>','<=':'<=','>=':'>='};const selected=vulnerable()?(allowed[comparator]||comparator):allowed[comparator];if(!selected)return res.sendStatus(400);
    try {res.json({items:(await db.query(`SELECT id,title FROM boundary_products WHERE private=false AND id ${selected} $1 ORDER BY id`,[Number(value)])).rows});}
    catch {res.status(400).json({error:'Invalid comparator'});}
  });
  get('/public-document','R0121',async(req,res)=>{
    const name=String(req.query.filename||'readme.txt');if(name.length>256||name.includes('\0')||path.isAbsolute(name))return res.sendStatus(400);
    const target=path.resolve(publicRoot,name);if(!inRoot(fixture,target)||(!vulnerable()&&!inRoot(publicRoot,target)))return res.sendStatus(403);
    try {const resolved=await realpath(target);if(resolved!==target||(!vulnerable()&&!inRoot(publicRoot,resolved)))return res.sendStatus(403);await textFile(res,resolved);}
    catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return res.sendStatus(404);throw error;}
  });
  get('/encoded-document','R0123',async(req,res)=>{
    const raw=String(req.query.urlPath||'readme.txt');if(raw.length>256||raw.includes('\0'))return res.sendStatus(400);
    let decoded;try{decoded=decodeURIComponent(raw);}catch{return res.sendStatus(400);}
    if(decoded.includes('\0')||path.isAbsolute(decoded))return res.sendStatus(400);
    const checked=path.resolve(publicRoot,vulnerable()?raw:decoded),used=path.resolve(publicRoot,decoded);
    if(!inRoot(publicRoot,checked)||!inRoot(fixture,used))return res.sendStatus(403);
    // Reject links in every arm here so only the normalization order differs.
    try {const resolved=await realpath(used);if(resolved!==used||(!vulnerable()&&!inRoot(publicRoot,resolved)))return res.sendStatus(403);await textFile(res,resolved);}
    catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return res.sendStatus(404);throw error;}
  });
  get('/linked-document','R0126',async(req,res)=>{
    const name=String(req.query.link||'guide-link.txt');if(name.length>256||name.includes('\0'))return res.sendStatus(400);
    const lexical=path.resolve(publicRoot,name);if(!inRoot(publicRoot,lexical))return res.sendStatus(403);
    try {const resolved=await realpath(lexical);if(!inRoot(fixture,resolved)||(!vulnerable()&&!inRoot(publicRoot,resolved)))return res.sendStatus(403);await textFile(res,resolved);}
    catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return res.sendStatus(404);throw error;}
  });
  get('/static-context','R0135',(req,res)=>res.type('html').send(page('配信context',`<form id="static-context" method="post" action="${getRun().base}/static-context"><label>配信context <select name="workingDirectory"><option value="site">通常配信</option><option value="preview">プレビュー配信</option></select></label><button>選択する</button></form>`)));
  post('/static-context','R0135',(req,res)=>{
    const directory=String(req.body.workingDirectory||'');if(!['site','preview'].includes(directory))return res.sendStatus(400);
    staticMiddleware=staticFactory(serveStatic,vulnerable(),directory);res.json({context:directory});
  });
  router.use('/site-static',(req,res,next)=>{
    if(getRun().root!=='R0135')return next();
    if(!staticMiddleware)staticMiddleware=staticFactory(serveStatic,vulnerable(),'site');
    staticMiddleware(req,res,next);
  });
  get('/uri-document','R0137',async(req,res)=>{
    const raw=String(req.query.uri||'guide:readme');if(raw.length>512)return res.sendStatus(400);
    let uri;try{uri=new URL(raw);}catch{return res.sendStatus(400);}
    if(uri.protocol==='guide:'){
      const normal={readme:publicRoot+'/readme.txt',quoted:publicRoot+"/quarter'notes.txt"};if(!normal[uri.pathname]||uri.search||uri.hash)return res.sendStatus(404);return textFile(res,normal[uri.pathname]);
    }
    if(uri.protocol!=='file:'||!vulnerable())return res.sendStatus(403);
    let filename;try{filename=fileURLToPath(uri);}catch{return res.sendStatus(400);}
    return textFile(res,filename);
  });
  get('/mounted-document','R0138',async(req,res)=>{
    if(!requireLogin(req,res))return;const mount=String(req.query.mountId||req.member.name);
    if(!names.includes(mount))return res.sendStatus(400);if(!vulnerable()&&mount!==req.member.name)return res.sendStatus(403);
    return textFile(res,fixture+'/mounts/'+mount+'/note.txt');
  });
  const jwtRoots=['R0247','R0248','R0249'];
  const jwtRoute=(route,handler)=>router.get(route,(req,res,next)=>jwtRoots.includes(getRun().root)?handler(req,res,next):next());
  const jwtClaims=alternate=>({iss:alternate&&getRun().root==='R0248'?'partner-idp':'fixture-idp',aud:alternate&&getRun().root==='R0247'?'calendar-api':'member-api',purpose:alternate&&getRun().root==='R0249'?'identity':'api'});
  const jwtHeader=alternate=>({alg:'HS256',typ:alternate&&getRun().root==='R0249'?'id+jwt':'at+jwt'});
  for(const [route,alternate] of [['/access-pass',false],['/connected-pass',true]])jwtRoute(route,(req,res)=>{
    if(!requireLogin(req,res))return;res.set('Cache-Control','no-store').json({token:signed(jwtHeader(alternate),{sub:req.member.name,...jwtClaims(alternate),exp:Math.floor(Date.now()/1000)+600},getRun().jwtSecret)});
  });
  for(const [route,alternate] of [['/account-report',false],['/connected-report',true]])jwtRoute(route,async(req,res)=>{
    const parsed=parsedJWT(String(req.headers.authorization||'').replace(/^Bearer /,''),getRun().jwtSecret);if(!parsed||!await user(parsed.body.sub))return res.sendStatus(401);
    const expected=jwtClaims(alternate),root=getRun().root,{body,header}=parsed;
    if((!(!alternate&&root==='R0247'&&vulnerable())&&body.aud!==expected.aud)||(!(!alternate&&root==='R0248'&&vulnerable())&&body.iss!==expected.iss)||(!(!alternate&&root==='R0249'&&vulnerable())&&(body.purpose!==expected.purpose||header.typ!==jwtHeader(alternate).typ)))return res.sendStatus(401);
    res.set('Cache-Control','no-store').json(alternate?{username:body.sub,service:root==='R0249'?'Identity confirmation':'Connected service'}:{username:body.sub,privateReport:getRun().canary});
  });
  get('/return-redirect','R0368',(req,res)=>{
    const value=String(req.query.returnUrl||'return-complete');if(value.length>512||/[\r\n\0]/.test(value))return res.sendStatus(400);
    let destination;try{destination=new URL(value,req.protocol+'://'+req.headers.host+getRun().base+'/');}catch{return res.sendStatus(400);}
    if(!vulnerable()&&(destination.origin!==req.protocol+'://'+req.headers.host||destination.pathname!==getRun().base+'/return-complete'))return res.sendStatus(403);
    res.redirect(302,destination.href);
  });
  get('/return-complete','R0368',(req,res)=>res.type('html').send(page('戻り先','<p id="return-complete">Return completed</p>')));
  get('/limited-records','R0497',async(req,res)=>{
    const raw=req.query.numericValue??'3';if(typeof raw!=='string'||raw.length>48)return res.sendStatus(400);const count=Number(raw);
    if(count<0||count>5||(!Number.isNaN(count)&&!Number.isInteger(count))||(!vulnerable()&&(!/^\d+$/.test(raw)||!Number.isFinite(count))))return res.sendStatus(400);
    const source=(await db.query('SELECT id,body FROM boundary_numeric_records ORDER BY id')).rows,items=[];
    for(let index=0;index<source.length&&index<12;index++){if(index>=count)break;items.push(source[index]);}
    if(Number.isNaN(count))await db.query('INSERT INTO operations(username,action) VALUES($1,$2)',['anonymous','nan-limited-read']);
    res.json({items});
  });
  get('/precision-object','R0498',async(req,res)=>{
    const id=String(req.query.objectId??'42');if(!/^\d{1,19}$/.test(id)||BigInt(id)>9223372036854775807n)return res.sendStatus(400);
    const source=(await db.query('SELECT id::text,body,private FROM boundary_precision_objects ORDER BY id')).rows;
    const requested=source.find(item=>item.id===id);if(!requested)return res.sendStatus(404);if(requested.private)return res.sendStatus(403);
    const key=value=>vulnerable()?Number(value):value,objects=new Map(source.map(item=>[key(item.id),item]));
    const result=objects.get(key(id));res.json({objectId:result.id,body:result.body});
  });
  get('/decimal-invoice','R0499',async(req,res)=>{
    const result=await db.query('SELECT id,total_minor FROM boundary_invoices ORDER BY id DESC LIMIT 1');if(!result.rowCount)return res.json({invoice:null});
    const invoice=result.rows[0],lines=(await db.query('SELECT position,amount_minor FROM boundary_invoice_lines WHERE invoice_id=$1 ORDER BY position',[invoice.id])).rows;
    res.json({invoice:{id:invoice.id,totalMinor:invoice.total_minor,lines:lines.map(line=>({position:line.position,amountMinor:line.amount_minor}))}});
  });
  post('/decimal-invoice','R0499',async(req,res)=>{
    const raw=req.body.money;if(typeof raw!=='string'||raw.length>160)return res.sendStatus(400);const amounts=raw.split(',');
    if(amounts.length<1||amounts.length>8||amounts.some(value=>!/^\d{1,4}(\.\d{1,3})?$/.test(value)||Number(value)>1000))return res.sendStatus(400);
    const lines=amounts.map(value=>vulnerable()?Math.round(Number(value)*100):decimalMinor(value));
    const total=vulnerable()?Math.round(amounts.reduce((sum,value)=>sum+Number(value),0)*100):lines.reduce((sum,value)=>sum+value,0);
    const client=await db.connect();try{await client.query('BEGIN');const id=(await client.query('INSERT INTO boundary_invoices(total_minor) VALUES($1) RETURNING id',[total])).rows[0].id;for(let index=0;index<lines.length;index++)await client.query('INSERT INTO boundary_invoice_lines VALUES($1,$2,$3)',[id,index,lines[index]]);await client.query('COMMIT');res.status(201).json({id,totalMinor:total,lineMinor:lines});}
    catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
  get('/indexed-document','R0500',(req,res)=>{
    const raw=String(req.query.index??'0');if(!/^-?\d{1,2}$/.test(raw))return res.sendStatus(400);const index=Number(raw),documents=['First public document','Second public document',getRun().canary];
    if(!Number.isInteger(index)||Math.abs(index)>3||index>=2||(!vulnerable()&&index<0))return res.sendStatus(400);
    const document=documents.at(index);if(document===undefined)return res.sendStatus(404);res.json({document});
  });
}
