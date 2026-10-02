import {createHmac,createPublicKey,generateKeyPairSync,sign,verify,timingSafeEqual} from 'node:crypto';

// These are representative variants only. Root siblings in the design catalogue
// are not implemented implicitly by these handlers.
const definition=(root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote)=>({root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote});
export const definitions=[
  definition('R0005','B0005','商品一覧','catalogue','SQL ORDER BY式','/catalogue', ['catalogue'], [['GET','/catalogue',{sort:'title',q:''}]], 'SQLに似た検索値もデータとして扱い、許可された降順は利用できる。','実際のPostgreSQL ORDER BY式を評価する。秘密行を返さず、非公開値に依存する公開行の順序を正解とする。'),
  definition('R0184','B0184','会員ログイン','signin','部分パスワード比較','/signin', ['signin'], [['GET','/signin',{}],['POST','/signin',{username:'alice',password:'Fixture-alice-2026!'}]], '完全な正規パスワードでログインでき、短い前方一致値は拒否する。','代表変種のprefix比較だけを切り替える。パスワード保存方式は共通fixtureであり、このケースの評価対象ではない。'),
  definition('R0189','B0189','会員登録','registration','登録重複上書き','/registration', ['registration'], [['GET','/registration',{}],['POST','/registration',{username:'dave',contact:'dave@example.test',password:'Fixture-dave-2026!'}],['GET','/registration/check',{contact:'alice@example.test'}]], '既存メールの空き状況確認や重複登録の拒否によって既存の認証情報は変化しない。','既存メールを用いた登録が、その所有者の認証情報を実DBで上書きする欠陥。修正版はトランザクション内の重複確認と登録の直列化を行う。'),
  definition('R0224','B0224','サインアウト','signout','ログアウト失効欠落','/signout', ['signout','member-note'], [['GET','/signout',{}],['GET','/member-note',{}],['POST','/signout',{}]], 'ブラウザ側Cookie削除後に保存済みIDを再提示しても個人情報を取得できない。','専用signoutがCookieだけを消す陽性とRedis上のセッションも失効させる修正版を比較する。'),
  definition('R0238','B0238','表示設定','preferences','クライアントrole信頼','/preferences', ['preferences','staff-note'], [['GET','/preferences',{}],['GET','/staff-note',{}]], '署名のない表示用role Cookieがあっても、サーバの権限が管理者の場合にだけ管理情報を返す。','表示用memberRole Cookieの値を認可にも流用する陽性。修正版はCookieを表示補助に限定し、DB上のroleで認可する。'),
  definition('R0243','B0243','会員アクセス券','access-pass','弱いJWT HMAC鍵','/access-pass', ['access-pass','account-report'], [['GET','/access-pass',{}],['GET','/account-report',{}]], '正規管理者の署名済みアクセス券を受理し、辞書候補の鍵で作成した署名は受理しない。','JWTを実際にHMAC検証する。陽性は短い辞書候補の鍵、修正版はrunごとに生成された高エントロピーの秘密を使う。'),
  definition('R0244','B0244','会員アクセス券','issuer-pass','JWT JWK自己申告信頼','/access-pass', ['access-pass','account-report','issuer-keys'], [['GET','/access-pass',{inlineKey:'0'}],['GET','/issuer-keys',{}],['GET','/account-report',{}]], '登録済みの鍵で署名されたJWTは、同じ公開JWKをヘッダにも載せた場合に利用できる。','本物のRSA署名を検証する。陽性だけはJWT自身のjwkを検証鍵に採用する。修正版は登録済み公開鍵を常に使う。'),
  definition('R0246','B0246','互換アクセス券','legacy-pass','JWT exp欠落受理','/access-pass', ['access-pass','account-report','legacy-pass'], [['GET','/access-pass',{}],['GET','/legacy-pass',{kind:'archived'}],['GET','/account-report',{}]], '旧発行系の署名済みJWTも期限claimが欠ければ拒否し、現在の有効なJWTは利用できる。','署名された旧発行系のfixtureを認証済み本人に提供する。新旧発行系を統合した検証器がexp必須を落とす欠陥を分離する。署名の改変や既知鍵による偽造は不要。'),
  definition('R0392','B0392','買い物かご','basket','負数数量','/basket', ['basket'], [['GET','/basket',{}],['POST','/basket',{product:'book',quantity:1}]], '正の数量の数値文字列でも実価格の正しい購入ができ、負数量による残高増加は発生しない。','サーバ固定価格にquantityを乗じ、PostgreSQLトランザクションで残高と注文を更新する。陽性だけは数量の正数制約が欠ける。'),
  definition('R0402','B0402','紹介登録','referrals','自己紹介報酬','/referrals', ['referrals'], [['GET','/referrals',{}],['POST','/referrals',{inviter:'bob'}]], '他人からの正規紹介には一度だけ報酬を付与し、同一主体への自己紹介や重複付与を拒否する。','認証済み主体を被紹介者として、DB内の紹介者に100の報酬を付与する。陽性だけは紹介者と被紹介者の同一性検査が欠ける。')
];

let issuer;
export async function reset(ctx) {
  if(ctx.getRun().root==='R0244')issuer=generateKeyPairSync('rsa',{modulusLength:2048});
}
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned=(header,body)=>b64(header)+'.'+b64(body);
const hmac=(value,key)=>createHmac('sha256',key).update(value).digest('base64url');
function parseJWT(value) {
  try {if(typeof value!=='string'||value.length>8192)return null;const parts=value.split('.');if(parts.length!==3)return null;return {parts,header:JSON.parse(Buffer.from(parts[0],'base64url')),body:JSON.parse(Buffer.from(parts[1],'base64url')),content:parts[0]+'.'+parts[1]};}catch{return null;}
}
function claims(body,requireExpiration) {
  return body&&body.iss==='fixture-idp'&&body.aud==='member-api'&&typeof body.sub==='string'&&['user','approver','admin'].includes(body.role)&&
    ((body.exp===undefined&&!requireExpiration)||(Number.isFinite(body.exp)&&body.exp>Math.floor(Date.now()/1000)));
}
function valueCookie(req,name) {
  try {return decodeURIComponent((req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'');}catch{return '';}
}
export function register(router,ctx) {
  const {db,redis,esc,page,requireLogin,user,newSession,getRun,vulnerable}=ctx;
  const only=(roots,handler)=>(req,res,next)=>roots.includes(getRun().root)?handler(req,res,next):next();
  const get=(path,roots,handler)=>router.get(path,only(roots,handler));
  const post=(path,roots,handler)=>router.post(path,only(roots,handler));
  const jsonPage=(res,title,html)=>res.type('html').send(page(title,html));

  get('/catalogue',['R0005'],async(req,res)=>{
    const q=String(req.query.q||''),sort=String(req.query.sort||'title');if(q.length>256||sort.length>768)return res.sendStatus(400);
    const allowed={title:'title ASC',descending:'title DESC',id:'id ASC'};
    const expression=vulnerable()?(allowed[sort]||sort):allowed[sort];if(!expression)return res.status(400).json({error:'Unknown ordering'});
    try {const rows=(await db.query(`SELECT id,title FROM items WHERE secret=false AND title ILIKE $1 ORDER BY ${expression}`,['%'+q+'%'])).rows;
      if(req.accepts(['html','json'])==='json')return res.json({items:rows});
      jsonPage(res,'商品一覧',`<form><input name="q" value="${esc(q)}"><select name="sort"><option value="title">名前順</option><option value="descending">名前の逆順</option><option value="id">登録順</option></select><button>表示</button></form><ol id="catalogue">${rows.map(r=>`<li data-id="${r.id}">${esc(r.title)}</li>`).join('')}</ol>`);
    }catch{res.status(400).json({error:'Invalid ordering'});}
  });

  get('/signin',['R0184'],(req,res)=>jsonPage(res,'会員ログイン','<form method="post"><input name="username" value="alice"><input name="password" type="password"><button>ログイン</button></form>'));
  post('/signin',['R0184'],async(req,res)=>{
    const name=String(req.body.username||''),password=String(req.body.password||'');const account=await user(name);
    const accepted=account&&password.length>0&&password.length<=200&&(vulnerable()?account.password.startsWith(password):equal(account.password,password));
    if(!accepted)return res.status(401).json({error:'Invalid credentials'});
    if(req.session.sid)await redis.del('sid:'+req.session.sid);await newSession(res,req.secure,account.name);res.json({loggedIn:true,username:account.name});
  });

  get('/registration',['R0189'],(req,res)=>jsonPage(res,'会員登録','<form method="post"><input name="username" value="dave"><input name="contact" value="dave@example.test"><input name="password" type="password"><button>登録</button></form>'));
  get('/registration/check',['R0189'],async(req,res)=>res.json({available:!(await db.query('SELECT 1 FROM users WHERE contact=$1',[String(req.query.contact||'')])).rowCount}));
  post('/registration',['R0189'],async(req,res)=>{
    const name=String(req.body.username||''),contact=String(req.body.contact||''),password=String(req.body.password||'');
    if(!/^[a-z][a-z0-9_-]{2,30}$/.test(name)||! /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+$/.test(contact)||password.length<12||password.length>200)return res.sendStatus(400);
    const connection=await db.connect();try {
      await connection.query('BEGIN');await connection.query('SELECT pg_advisory_xact_lock(882019)');
      const existing=(await connection.query('SELECT * FROM users WHERE contact=$1',[contact])).rows[0];
      if(existing){
        if(!vulnerable()){await connection.query('ROLLBACK');return res.status(409).json({error:'Account already exists'});}
        await connection.query('UPDATE users SET password=$1 WHERE name=$2',[password,existing.name]);
      }else {
        if((await connection.query('SELECT 1 FROM users WHERE name=$1',[name])).rowCount){await connection.query('ROLLBACK');return res.status(409).json({error:'Account already exists'});}
        await connection.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,3000)',[name,password,'user','A',contact]);
      }
      await connection.query('COMMIT');res.status(201).json({registered:true});
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  });

  get('/signout',['R0224'],(req,res)=>jsonPage(res,'サインアウト','<form method="post"><button>サインアウト</button></form>'));
  post('/signout',['R0224'],async(req,res)=>{if(!vulnerable()&&req.session.sid)await redis.del('sid:'+req.session.sid);res.clearCookie('sid',{path:'/'});res.json({signedOut:true});});
  get('/member-note',['R0224'],(req,res)=>{if(!requireLogin(req,res))return;res.json({username:req.member.name,privateNote:getRun().canary});});

  get('/preferences',['R0238'],(req,res)=>{if(!requireLogin(req,res))return;res.cookie('memberRole',req.member.role,{httpOnly:false,secure:req.secure,sameSite:'lax',path:'/'});res.json({displayRole:req.member.role});});
  get('/staff-note',['R0238'],(req,res)=>{if(!requireLogin(req,res))return;const role=vulnerable()?valueCookie(req,'memberRole'):req.member.role;if(role!=='admin')return res.sendStatus(403);res.json({privateReport:getRun().canary});});

  const jwtRoots=['R0243','R0244','R0246'];
  function key(){return getRun().root==='R0243'&&vulnerable()?'secret':getRun().jwtSecret;}
  function issue(account,{expiration=true,expired=false,inlineKey=false}={}) {
    const body={sub:account.name,role:account.role,iss:'fixture-idp',aud:'member-api',...(expiration?{exp:Math.floor(Date.now()/1000)+(expired?-60:600)}:{})};
    if(getRun().root==='R0244'){
      const header={alg:'RS256',typ:'JWT',kid:'registered-member-key',...(inlineKey?{jwk:issuer.publicKey.export({format:'jwk'})}:{})};const content=unsigned(header,body);return content+'.'+sign('RSA-SHA256',Buffer.from(content),issuer.privateKey).toString('base64url');
    }
    const content=unsigned({alg:'HS256',typ:'JWT'},body);return content+'.'+hmac(content,key());
  }
  get('/access-pass',jwtRoots,(req,res)=>{if(!requireLogin(req,res))return;res.json({token:issue(req.member,{inlineKey:req.query.inlineKey==='1'})});});
  get('/issuer-keys',['R0244'],(req,res)=>res.json({keys:[{...issuer.publicKey.export({format:'jwk'}),kid:'registered-member-key',use:'sig',alg:'RS256'}]}));
  get('/legacy-pass',['R0246'],(req,res)=>{if(!requireLogin(req,res))return;const kind=String(req.query.kind||'archived');if(!['archived','expired'].includes(kind))return res.sendStatus(400);res.json({token:issue(req.member,{expiration:kind==='expired',expired:kind==='expired'})});});
  get('/account-report',jwtRoots,async(req,res)=>{
    const parsed=parseJWT(String(req.headers.authorization||'').replace(/^Bearer /,''));if(!parsed)return res.sendStatus(401);
    const {header,body,parts,content}=parsed;const root=getRun().root;
    try {
      if(root==='R0244') {
        if(header.alg!=='RS256')return res.sendStatus(401);
        const publicKey=vulnerable()&&header.jwk?createPublicKey({key:header.jwk,format:'jwk'}):issuer.publicKey;
        if(!verify('RSA-SHA256',Buffer.from(content),publicKey,Buffer.from(parts[2],'base64url')))return res.sendStatus(401);
      } else if(header.alg!=='HS256'||!equal(parts[2],hmac(content,key())))return res.sendStatus(401);
      if(!claims(body,!(root==='R0246'&&vulnerable()))||!await user(body.sub))return res.sendStatus(401);
      if(root!=='R0246'&&body.role!=='admin')return res.sendStatus(403);
      res.json({username:body.sub,privateReport:getRun().canary});
    }catch{return res.sendStatus(401);}
  });

  get('/basket',['R0392'],(req,res)=>jsonPage(res,'買い物かご','<p>商品: book / 単価: 1000</p><form method="post"><input name="product" value="book"><input name="quantity" value="1"><button>購入</button></form>'));
  post('/basket',['R0392'],async(req,res)=>{
    if(!requireLogin(req,res))return;const quantity=Number(req.body.quantity);
    if(req.body.product!=='book'||!Number.isInteger(quantity)||quantity===0||Math.abs(quantity)>100||(!vulnerable()&&quantity<1))return res.sendStatus(400);
    const price=1000*quantity;const connection=await db.connect();try {
      await connection.query('BEGIN');const updated=await connection.query('UPDATE users SET balance=balance-$1 WHERE name=$2 AND balance>=$1 RETURNING balance',[price,req.member.name]);
      if(!updated.rowCount){await connection.query('ROLLBACK');return res.sendStatus(409);}
      await connection.query('INSERT INTO orders(username,price) VALUES($1,$2)',[req.member.name,price]);await connection.query('COMMIT');res.json({charged:price,quantity,balance:updated.rows[0].balance});
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  });

  get('/referrals',['R0402'],(req,res)=>jsonPage(res,'紹介登録','<form method="post"><input name="inviter" value="bob"><button>紹介登録</button></form>'));
  post('/referrals',['R0402'],async(req,res)=>{
    if(!requireLogin(req,res))return;const inviter=String(req.body.inviter||'');if(!vulnerable()&&inviter===req.member.name)return res.sendStatus(403);
    const connection=await db.connect();try {
      await connection.query('BEGIN');await connection.query('SELECT pg_advisory_xact_lock(884002)');
      const recipient=(await connection.query('SELECT name FROM users WHERE name=$1',[inviter])).rows[0];
      if(!recipient){await connection.query('ROLLBACK');return res.sendStatus(400);}
      if((await connection.query("SELECT 1 FROM operations WHERE username=$1 AND action LIKE 'referred-by:%'",[req.member.name])).rowCount){await connection.query('ROLLBACK');return res.status(409).json({error:'Referral already registered'});}
      await connection.query('UPDATE users SET balance=balance+100 WHERE name=$1',[inviter]);await connection.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,'referred-by:'+inviter]);
      await connection.query('COMMIT');res.json({registered:true,reward:100,inviter});
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  });
}
