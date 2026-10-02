const definition=(root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote)=>({root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote});
const passwordRequests=[['GET','/password-help',{}],['POST','/password-help',{username:'alice'}],['POST','/password-update',{username:'alice',token:'supplied-by-own-inbox',password:'Changed-alice-2026!'}]];
export const definitions=[
  definition('R0202','B0202','アカウント回復','timed-recovery','回復トークン期限','/password-help',['password-help','password-update','account-history'],[...passwordRequests,['GET','/account-history',{}]],'有効期間内の本人トークンは使用でき、本人が保管していた期限切れトークンは拒否する。','代表変種のみ。DBのトークン照合/主体/用途/一回性は共通で維持し、保存されたexpires_atと実サーバ時刻の比較だけを切り替える。本人限定の歴史的トークンfixtureで長いsleepを不要にする。'),
  definition('R0203','B0203','アカウント回復','purpose-recovery','回復トークン用途','/password-help',['password-help','password-update','email-check','email-confirm'],[...passwordRequests,['POST','/email-check',{}],['POST','/email-confirm',{token:'supplied-by-own-inbox'}]],'メール確認トークンはメール確認に使え、回復に使っても認証情報を変更しない。','代表変種のみ。トークンの期限/主体/一回性を維持し、purpose=email-confirmをpassword-resetとして受理する用途境界だけを切り替える。'),
  definition('R0204','B0204','アカウント回復','subject-recovery','回復トークン主体','/password-help',['password-help','password-update'],passwordRequests,'本人のトークンと本人IDの組合せでは変更でき、別人IDとの組合せは拒否する。','代表変種のみ。期限/用途/一回性を維持し、検証済みトークンのusernameをbodyのusernameで上書きする境界だけを切り替える。'),
  definition('R0273','B0273','文書一括整理','batch-documents','一括対象認可','/batch-documents',['batch-documents'],[['GET','/batch-documents',{}],['GET','/batch-documents/{id}',{},{id:101}],['POST','/batch-documents',{ids:'101'}]],'所有文書だけの一括操作は成功し、配列後半に非所有文書がある場合は全体を拒否する。','代表変種のみ。ID配列またはフォームのCSVを同じ配列へ正規化し、先頭要素だけの認可と全要素認可を比較する。実documentsの本文を変更する。'),
  definition('R0275','B0275','ワークスペース文書','cursor-documents','ページcursorのtenant','/workspace-documents',['workspace-documents'],[['GET','/workspace-documents',{cursor:''}]],'同じ所属tenantの次ページは利用でき、cursor内のtenant変更で他tenantへ移動できない。','代表変種のみ。tenant内の文書はこの機能では全員に共有される仕様。ページcursorのtenantで認証済みtenant条件を上書きする境界を比較し、通常のowner認可欠落とは区別する。'),
  definition('R0281','B0281','文書リンク共有','revocable-sharing','共有リンク失効','/sharing',['sharing','shared'],[['GET','/sharing',{}],['POST','/sharing',{document:101}],['GET','/shared/{value}',{},{value:'from-own-share'}],['POST','/sharing/revoke',{document:101}]],'有効な共有リンクは利用でき、解除済みの旧リンクは新しい共有の発行後も利用できない。','代表変種のみ。所有者認可とランダムtoken生成を維持し、DBのactive失効状態を共有読取時に検査するかだけを切り替える。'),
  definition('R0284','B0284','所属ワークスペース','tenant-console','tenantヘッダ信頼','/tenant-console',['tenant-console','tenant-records'],[['GET','/tenant-console',{}],['GET','/tenant-records',{}]],'表示用の所属tenantヘッダで正常読取でき、別tenantを申告しても認証主体の所属だけを取得する。','代表変種のみ。tenant内の文書共有仕様は維持し、X-Tenantを認可情報として使うかを切り替える。R0275のページ状態上書きとは異なるHTTPヘッダ境界。'),
  definition('R0395','B0395','購入申請','purchase-requests','承認遷移の省略','/purchase-requests',['purchase-requests'],[['GET','/purchase-requests',{}],['POST','/purchase-requests/{id}/submit',{},{id:601}],['POST','/purchase-requests/{id}/approve',{},{id:601}],['POST','/purchase-requests/{id}/pay',{},{id:601}]],'申請・権限を持つ承認者の承認・本人の決済が成功し、下書きからの直接決済や二重決済は拒否する。','代表変種のみ。金額/主体/承認者role/一回性は維持し、決済前提状態approvedの検査だけを切り替える。実残高・注文・購入申請状態を同一transactionで更新。'),
  definition('R0397','B0397','支払履歴と返金','refund-history','累積返金上限','/refunds',['refunds'],[['GET','/refunds',{}],['GET','/refunds/{id}',{},{id:701}],['POST','/refunds/{id}',{amount:600},{id:701}]],'支払額の範囲内の部分返金は成功し、正の個別返金を重ねても累積額は支払額を超えない。','代表変種のみ。過去の支払1000を歴史的fixtureとして保持。所有者と個別返金額の検査を維持し、累積refunded+amountの上限検査だけを切り替える。行lockにより競合欠陥とは区別。'),
  definition('R0484','B0484','会員間送金','atomic-transfer','後半障害の部分確定','/transfers',['transfers'],[['GET','/transfers',{}],['POST','/transfers',{recipient:'bob',amount:100}]],'正常な送金では両者の残高を更新し、受取限度のDB制約で後半が失敗した場合は両者の残高を保持する。','代表変種のみ。受取限度が0のCarolに送金すると後半の実PostgreSQL CHECK制約が失敗する。陽性は各SQLの自動commit、修正版は業務全体のtransaction。payload文字列による故障mockは使わない。')
];

const own=(record,member)=>record&&record.owner===member.name;
export async function reset(ctx) {
  const {db,getRun,token}=ctx;const run=getRun();
  await db.query(`CREATE TABLE IF NOT EXISTS workflow_tokens(value text PRIMARY KEY,username text NOT NULL,purpose text NOT NULL,expires_at timestamptz NOT NULL,used boolean NOT NULL DEFAULT false);
    CREATE TABLE IF NOT EXISTS workflow_shares(value text PRIMARY KEY,document_id integer NOT NULL,owner text NOT NULL,active boolean NOT NULL DEFAULT true);
    CREATE TABLE IF NOT EXISTS workflow_purchases(id integer PRIMARY KEY,owner text NOT NULL,state text NOT NULL,price integer NOT NULL);
    CREATE TABLE IF NOT EXISTS workflow_payments(id integer PRIMARY KEY,owner text NOT NULL,paid integer NOT NULL,refunded integer NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS workflow_limits(username text PRIMARY KEY,remaining integer NOT NULL CHECK(remaining>=0));
    TRUNCATE workflow_tokens,workflow_shares,workflow_purchases,workflow_payments,workflow_limits;`);
  if(run.root==='R0202')await db.query('INSERT INTO workflow_tokens(value,username,purpose,expires_at) VALUES($1,$2,$3,$4)',[token(),'alice','password-reset',new Date(Date.now()-3600000)]);
  if(['R0275','R0284'].includes(run.root))await db.query('UPDATE documents SET body=$1 WHERE id=102',['Tenant A working notes']);
  if(run.root==='R0281')await db.query('UPDATE documents SET body=$1 WHERE id=101',[run.canary]);
  if(run.root==='R0395')await db.query("INSERT INTO workflow_purchases VALUES(601,'alice','draft',1000),(602,'alice','draft',1000)");
  if(run.root==='R0397')await db.query("INSERT INTO workflow_payments VALUES(701,'alice',1000,0)");
  if(run.root==='R0484')await db.query("INSERT INTO workflow_limits VALUES('alice',5000),('bob',5000),('carol',0),('approver',5000),('admin',5000)");
}

export function register(router,ctx) {
  const {db,redis,user,token,esc,page,requireLogin,getRun,vulnerable}=ctx;
  const only=(selected,handler)=>(req,res,next)=>selected.includes(getRun().root)?handler(req,res,next):next();
  const get=(p,selected,handler)=>router.get(p,only(selected,handler));
  const post=(p,selected,handler)=>router.post(p,only(selected,handler));
  const html=(res,title,body)=>res.type('html').send(page(title,body));
  const recoveryRoots=['R0202','R0203','R0204'];
  async function deliver(username,purpose) {
    const value=token(),expiresAt=new Date(Date.now()+600000);
    await db.query('INSERT INTO workflow_tokens(value,username,purpose,expires_at) VALUES($1,$2,$3,$4)',[value,username,purpose,expiresAt]);
    await redis.rPush('mail:'+username,JSON.stringify({token:value,purpose,expiresAt:expiresAt.toISOString()}));
  }
  get('/password-help',recoveryRoots,(req,res)=>html(res,'アカウント回復','<form method="post"><input name="username" value="alice"><button>回復メールを依頼</button></form>'));
  post('/password-help',recoveryRoots,async(req,res)=>{const name=String(req.body.username||'');if(await user(name))await deliver(name,'password-reset');res.json({message:'If the account exists, a recovery email has been sent.'});});
  get('/account-history',['R0202'],async(req,res)=>{if(!requireLogin(req,res))return;const rows=(await db.query("SELECT value AS token,expires_at AS \"expiresAt\" FROM workflow_tokens WHERE username=$1 AND purpose='password-reset' AND expires_at<clock_timestamp() ORDER BY expires_at",[req.member.name])).rows;res.json({archivedRecoveryMessages:rows});});
  post('/email-check',['R0203'],async(req,res)=>{if(!requireLogin(req,res))return;await deliver(req.member.name,'email-confirm');res.json({message:'A verification email has been sent.'});});
  post('/email-confirm',['R0203'],async(req,res)=>{
    const row=(await db.query("UPDATE workflow_tokens SET used=true WHERE value=$1 AND purpose='email-confirm' AND used=false AND expires_at>clock_timestamp() RETURNING username",[String(req.body.token||'')])).rows[0];
    if(!row)return res.sendStatus(400);await db.query('INSERT INTO operations(username,action) VALUES($1,$2)',[row.username,'email-confirmed']);res.json({confirmed:true});
  });
  post('/password-update',recoveryRoots,async(req,res)=>{
    const password=String(req.body.password||''),claimed=String(req.body.username||'');if(password.length<12||password.length>200)return res.sendStatus(400);
    const connection=await db.connect();try {
      await connection.query('BEGIN');const record=(await connection.query('SELECT * FROM workflow_tokens WHERE value=$1 AND used=false FOR UPDATE',[String(req.body.token||'')])).rows[0];
      const allowExpired=getRun().root==='R0202'&&vulnerable(),allowWrongPurpose=getRun().root==='R0203'&&vulnerable();
      if(!record||(!allowExpired&&new Date(record.expires_at).getTime()<=Date.now())||(!allowWrongPurpose&&record.purpose!=='password-reset')){await connection.query('ROLLBACK');return res.sendStatus(400);}
      const switched=getRun().root==='R0204'&&vulnerable();
      if(!switched&&claimed&&claimed!==record.username){await connection.query('ROLLBACK');return res.sendStatus(403);}
      const name=switched?claimed:record.username;if(!(await connection.query('SELECT 1 FROM users WHERE name=$1',[name])).rowCount){await connection.query('ROLLBACK');return res.sendStatus(400);}
      await connection.query('UPDATE users SET password=$1 WHERE name=$2',[password,name]);await connection.query('UPDATE workflow_tokens SET used=true WHERE value=$1',[record.value]);await connection.query('COMMIT');res.json({changed:true});
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  });

  get('/batch-documents',['R0273'],async(req,res)=>{if(!requireLogin(req,res))return;res.json({documents:(await db.query('SELECT id,body FROM documents WHERE owner=$1 ORDER BY id',[req.member.name])).rows});});
  get('/batch-documents/:id',['R0273'],async(req,res)=>{if(!requireLogin(req,res))return;const row=(await db.query('SELECT * FROM documents WHERE id=$1',[Number(req.params.id)||0])).rows[0];if(!own(row,req.member))return res.sendStatus(403);res.json({id:row.id,body:row.body});});
  post('/batch-documents',['R0273'],async(req,res)=>{
    if(!requireLogin(req,res))return;const input=Array.isArray(req.body.ids)?req.body.ids:String(req.body.ids||'').split(',');const ids=input.map(Number);
    if(ids.length<1||ids.length>16||ids.some(n=>!Number.isSafeInteger(n)||n<=0||n>2147483647)||new Set(ids).size!==ids.length)return res.sendStatus(400);
    const connection=await db.connect();try{
      await connection.query('BEGIN');const records=(await connection.query('SELECT * FROM documents WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;const first=records.find(r=>r.id===ids[0]);
      if(records.length!==ids.length||!own(first,req.member)||(!vulnerable()&&records.some(r=>!own(r,req.member)))){await connection.query('ROLLBACK');return res.sendStatus(403);}
      await connection.query('UPDATE documents SET body=$1 WHERE id=ANY($2::int[])',['Archived note',ids]);
      for(const id of ids)await connection.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,'archive:'+id]);
      await connection.query('COMMIT');res.json({archived:ids});
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  });

  get('/workspace-documents',['R0275'],async(req,res)=>{
    if(!requireLogin(req,res))return;let cursor={tenant:req.member.tenant,after:0};
    try{if(req.query.cursor){if(String(req.query.cursor).length>1024)return res.sendStatus(400);cursor=JSON.parse(Buffer.from(String(req.query.cursor),'base64url'));}}catch{return res.sendStatus(400);}
    if(!cursor||!['A','B'].includes(cursor.tenant)||!Number.isSafeInteger(cursor.after)||cursor.after<0)return res.sendStatus(400);
    if(!vulnerable()&&cursor.tenant!==req.member.tenant)return res.sendStatus(403);
    const tenant=vulnerable()?cursor.tenant:req.member.tenant;const rows=(await db.query('SELECT id,body,tenant FROM documents WHERE tenant=$1 AND id>$2 ORDER BY id LIMIT 2',[tenant,cursor.after])).rows;
    const records=rows.slice(0,1);const nextCursor=rows.length>1?Buffer.from(JSON.stringify({tenant,after:records[0].id})).toString('base64url'):null;res.json({records,nextCursor});
  });

  get('/sharing',['R0281'],async(req,res)=>{if(!requireLogin(req,res))return;res.json({documents:(await db.query('SELECT id FROM documents WHERE owner=$1 ORDER BY id',[req.member.name])).rows,shares:(await db.query('SELECT value,document_id AS document,active FROM workflow_shares WHERE owner=$1',[req.member.name])).rows});});
  post('/sharing',['R0281'],async(req,res)=>{if(!requireLogin(req,res))return;const id=Number(req.body.document)||0;const document=(await db.query('SELECT * FROM documents WHERE id=$1',[id])).rows[0];if(!own(document,req.member))return res.sendStatus(403);const value=token();await db.query('INSERT INTO workflow_shares(value,document_id,owner) VALUES($1,$2,$3)',[value,id,req.member.name]);res.json({token:value,url:getRun().base+'/shared/'+value});});
  post('/sharing/revoke',['R0281'],async(req,res)=>{if(!requireLogin(req,res))return;const id=Number(req.body.document)||0;const document=(await db.query('SELECT * FROM documents WHERE id=$1',[id])).rows[0];if(!own(document,req.member))return res.sendStatus(403);await db.query('UPDATE workflow_shares SET active=false WHERE document_id=$1 AND owner=$2',[id,req.member.name]);res.json({revoked:true});});
  get('/shared/:value',['R0281'],async(req,res)=>{const share=(await db.query('SELECT * FROM workflow_shares WHERE value=$1',[String(req.params.value)])).rows[0];if(!share||(!vulnerable()&&!share.active))return res.sendStatus(404);const document=(await db.query('SELECT id,body FROM documents WHERE id=$1',[share.document_id])).rows[0];if(!document)return res.sendStatus(404);res.json(document);});

  get('/tenant-console',['R0284'],(req,res)=>{if(!requireLogin(req,res))return;html(res,'所属ワークスペース',`<p>所属: ${esc(req.member.tenant)}</p><button id="load">文書を表示</button><pre id="records"></pre><script>document.getElementById('load').onclick=async()=>{const r=await fetch(${JSON.stringify(getRun().base+'/tenant-records')},{headers:{'X-Tenant':${JSON.stringify(req.member.tenant)}}});document.getElementById('records').textContent=await r.text()}</script>`);});
  get('/tenant-records',['R0284'],async(req,res)=>{if(!requireLogin(req,res))return;const requested=String(req.headers['x-tenant']||req.member.tenant);if(!['A','B'].includes(requested))return res.sendStatus(400);const tenant=vulnerable()?requested:req.member.tenant;res.json({tenant,documents:(await db.query('SELECT id,body FROM documents WHERE tenant=$1 ORDER BY id',[tenant])).rows});});

  get('/purchase-requests',['R0395'],async(req,res)=>{if(!requireLogin(req,res))return;const records=(await db.query('SELECT * FROM workflow_purchases WHERE owner=$1 OR $2 ORDER BY id',[req.member.name,['approver','admin'].includes(req.member.role)])).rows;res.json({requests:records});});
  async function transition(req,res,nextState) {
    if(!requireLogin(req,res))return;const approve=nextState==='approved';if(approve&&!['approver','admin'].includes(req.member.role))return res.sendStatus(403);
    const connection=await db.connect();try{
      await connection.query('BEGIN');const request=(await connection.query('SELECT * FROM workflow_purchases WHERE id=$1 FOR UPDATE',[Number(req.params.id)||0])).rows[0];
      if(!request||(!approve&&request.owner!==req.member.name)){await connection.query('ROLLBACK');return res.sendStatus(403);}
      const allowed=nextState==='submitted'?request.state==='draft':approve?request.state==='submitted':request.state==='approved'||(vulnerable()&&['draft','submitted'].includes(request.state));
      if(!allowed){await connection.query('ROLLBACK');return res.sendStatus(409);}
      if(nextState==='paid'){
        const account=await connection.query('UPDATE users SET balance=balance-$1 WHERE name=$2 AND balance>=$1 RETURNING balance',[request.price,request.owner]);if(!account.rowCount){await connection.query('ROLLBACK');return res.sendStatus(409);}
        await connection.query('INSERT INTO orders(username,price) VALUES($1,$2)',[request.owner,request.price]);
      }
      await connection.query('UPDATE workflow_purchases SET state=$1 WHERE id=$2',[nextState,request.id]);await connection.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,'purchase:'+request.id+':'+nextState]);await connection.query('COMMIT');res.json({id:request.id,state:nextState});
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  }
  post('/purchase-requests/:id/submit',['R0395'],(req,res)=>transition(req,res,'submitted'));
  post('/purchase-requests/:id/approve',['R0395'],(req,res)=>transition(req,res,'approved'));
  post('/purchase-requests/:id/pay',['R0395'],(req,res)=>transition(req,res,'paid'));

  get('/refunds',['R0397'],async(req,res)=>{if(!requireLogin(req,res))return;res.json({payments:(await db.query('SELECT * FROM workflow_payments WHERE owner=$1 ORDER BY id',[req.member.name])).rows});});
  get('/refunds/:id',['R0397'],async(req,res)=>{if(!requireLogin(req,res))return;const payment=(await db.query('SELECT * FROM workflow_payments WHERE id=$1',[Number(req.params.id)||0])).rows[0];if(!own(payment,req.member))return res.sendStatus(403);res.json(payment);});
  post('/refunds/:id',['R0397'],async(req,res)=>{
    if(!requireLogin(req,res))return;const amount=Number(req.body.amount);if(!Number.isSafeInteger(amount)||amount<=0||amount>100000)return res.sendStatus(400);
    const connection=await db.connect();try{
      await connection.query('BEGIN');const payment=(await connection.query('SELECT * FROM workflow_payments WHERE id=$1 FOR UPDATE',[Number(req.params.id)||0])).rows[0];
      if(!own(payment,req.member)){await connection.query('ROLLBACK');return res.sendStatus(403);}
      if(amount>payment.paid||(!vulnerable()&&payment.refunded+amount>payment.paid)){await connection.query('ROLLBACK');return res.sendStatus(409);}
      await connection.query('UPDATE workflow_payments SET refunded=refunded+$1 WHERE id=$2',[amount,payment.id]);await connection.query('UPDATE users SET balance=balance+$1 WHERE name=$2',[amount,req.member.name]);await connection.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,'refund:'+payment.id+':'+amount]);await connection.query('COMMIT');res.json({refunded:payment.refunded+amount});
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  });

  get('/transfers',['R0484'],async(req,res)=>{if(!requireLogin(req,res))return;res.json({balance:req.member.balance,recipients:(await db.query('SELECT username,remaining FROM workflow_limits WHERE username<>$1 ORDER BY username',[req.member.name])).rows});});
  post('/transfers',['R0484'],async(req,res)=>{
    if(!requireLogin(req,res))return;const recipient=String(req.body.recipient||''),amount=Number(req.body.amount);
    if(!Number.isSafeInteger(amount)||amount<=0||amount>1000||recipient===req.member.name||!await user(recipient))return res.sendStatus(400);
    const connection=await db.connect(),atomic=!vulnerable();try{
      if(atomic)await connection.query('BEGIN');const sender=await connection.query('UPDATE users SET balance=balance-$1 WHERE name=$2 AND balance>=$1 RETURNING balance',[amount,req.member.name]);
      if(!sender.rowCount){if(atomic)await connection.query('ROLLBACK');return res.sendStatus(409);}
      // An actual PostgreSQL CHECK violation can occur after the debit here.
      const capacity=await connection.query('UPDATE workflow_limits SET remaining=remaining-$1 WHERE username=$2 RETURNING remaining',[amount,recipient]);if(!capacity.rowCount)throw new Error('Receiver is not configured');
      await connection.query('UPDATE users SET balance=balance+$1 WHERE name=$2',[amount,recipient]);await connection.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,'transfer:'+recipient+':'+amount]);if(atomic)await connection.query('COMMIT');res.json({transferred:amount,recipient});
    }catch(error){if(atomic)await connection.query('ROLLBACK');if(error.code==='23514')return res.status(409).json({error:'Receiver capacity exceeded'});throw error;}finally{connection.release();}
  });
}
