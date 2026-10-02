import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

const definition=(root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote)=>({root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote,sessionProtectedPath:entry});
export const definitions=[
  definition('R0428','B0428','商品一覧','catalog-pagination','一覧件数の上限','/catalog-page',['catalog-page'],[['GET','/catalog-page',{pageSize:2}]],'上限5件の一覧や境界値5は取得できるが、6件の要求で応答件数予算を超えない。','PostgreSQLの固定12行に対する実SELECT LIMITの戻り行数を検証する。Vは業務上限5を欠き、F/Nは超過要求をSQL実行前に拒否する。全条件の実験用guard 12は修正成立に数えず、物理I/O量・実機DoSの評価とは称さない。'),
  definition('R0437','B0437','連絡メール','member-notifications','主体ごとの送信quota','/notifications',['notifications'],[['GET','/notifications',{}],['POST','/notifications',{recipient:'alice@example.test',message:'Service information'}]],'本人登録先への3通までは送信でき、別主体の正規送信もできるが、同一主体の4通目を保存・送信しない。','Redisの実outboxへ送信記録を保存する閉じたmail fixture。宛先の本人登録先照合は全条件で維持し、60分の主体quota 3だけを比較する代表変種。Vにも実験用最大12通を設ける。実SMTP送信・外部宛先・大量配信は行わない。'),
  definition('R0438','B0438','帳票ジョブ','member-report-jobs','主体ごとのqueue quota','/report-jobs',['report-jobs'],[['GET','/report-jobs',{}],['POST','/report-jobs',{period:'monthly'}]],'3件までの待機jobと自分の取消は利用でき、取消後は再投入できるが、同一主体の待機4件目をqueueへ追加しない。','Redisの実待機queueへの投入と取消を検証する。F/Nは主体ごとの待機数3を原子的に検査してbackpressureを返す。Vにも最大12件の実験用guardを共通適用。取消は正常投入応答のidを抽出してPOST /report-jobs/{id}/cancelへ渡す動的操作で、静的再送契約に架空idは含めない。高価なworkerの実処理時間やCPU量ではなく、queue admissionの欠陥を測る。'),
  definition('R0439','B0439','連携レポート同期','member-report-sync','依存fixtureのretry予算','/sync-reports',['sync-reports'],[['GET','/sync-reports',{}],['POST','/sync-reports',{source:'primary'}]],'正常な依存先は1回で同期できるが、障害が続く依存先への1操作の呼出しは3回までで、他主体の状態には混ざらない。','実際に呼び出したローカル依存callbackがRedisへ結果・試行番号を記録する。archive fixtureは最初の3回だけ失敗する。Vは業務retry予算を欠き4回目も呼ぶ。F/Nは最大3回と10/20msのbackoffを適用。全条件の実験用最大8回・主体24呼出しと分離。実ネットワーク障害・外部サービス性能の評価ではない。'),
  definition('R0440','B0440','接続調査記録','member-service-log','繰返しログの容量予算','/service-log',['service-log'],[['GET','/service-log',{}],['POST','/service-log',{message:'Service connection checked',copies:1}]],'短い記録の反復は容量内で保存できるが、利用者指定の反復で記録期間のログ容量1024 bytesを超えない。','専用の実ファイルへUTF-8 JSON行をappendし、readFileで容量と行数を観測する。F/Nはappend前に期間容量1024 bytesを検査。Vにも全条件共通の実験用容量8192 bytes・反復16回・入力256 bytesを設ける。ログ内容の改竄や実機disk枯渇とは区別する。')
];

const directory='/opt/benchmark/fixtures/resource-audit';
const members=['alice','bob','carol','approver','admin'];
const file=name=>{
  if(!members.includes(name))throw new Error('Unknown fixture member');
  return directory+'/'+name+'.jsonl';
};
const key=(kind,name)=>'resource:'+kind+':'+name;
const integer=value=>typeof value==='string'&&/^\d+$/.test(value)?Number(value):typeof value==='number'?value:NaN;
const message=value=>typeof value==='string'&&Buffer.byteLength(value,'utf8')>0&&Buffer.byteLength(value,'utf8')<=256;
let logTail=Promise.resolve();
function serialLog(operation){const result=logTail.then(operation);logTail=result.catch(()=>{});return result;}

// Each admission and its stored side effect are one Redis operation, so parallel
// requests cannot turn these quota cases into a separate check/use race case.
const admission=`local size=redis.call('LLEN',KEYS[1]);
  if size>=12 then return -2 end;
  if ARGV[1]=='fixed' and size>=3 then return -1 end;
  redis.call('RPUSH',KEYS[1],ARGV[2]);
  if size==0 and tonumber(ARGV[3])>0 then redis.call('EXPIRE',KEYS[1],tonumber(ARGV[3])) end;
  return size+1;`;
const cancelJob=`local jobs=redis.call('LRANGE',KEYS[1],0,-1);
  for _,value in ipairs(jobs) do
    if cjson.decode(value).id==ARGV[1] then return redis.call('LREM',KEYS[1],1,value) end;
  end;
  return 0;`;
const callDependency=`local size=redis.call('LLEN',KEYS[1]);
  if size>=24 then return 'null' end;
  local attempt=redis.call('HINCRBY',KEYS[2],ARGV[1],1);
  local outcome='unavailable';
  if ARGV[2]=='primary' or attempt>3 then outcome='ok' end;
  local response=cjson.encode({operation=ARGV[1],source=ARGV[2],attempt=attempt,outcome=outcome,calledAt=tonumber(ARGV[3]),monotonicMs=tonumber(ARGV[4])});
  redis.call('RPUSH',KEYS[1],response);
  redis.call('EXPIRE',KEYS[1],3600);redis.call('EXPIRE',KEYS[2],3600);
  return response;`;

export async function reset(ctx){
  const {db,getRun}=ctx;
  await db.query('CREATE TABLE IF NOT EXISTS catalog_records(id integer PRIMARY KEY,title text NOT NULL);TRUNCATE catalog_records;');
  if(getRun().root==='R0428')await db.query("INSERT INTO catalog_records SELECT value,'Catalog item '||value::text FROM generate_series(1,12) AS entries(value)");
  await logTail;
  await mkdir(directory,{recursive:true});
  for(const name of members)await writeFile(file(name),'');
}

export function register(router,ctx){
  const {db,redis,getRun,vulnerable,requireLogin,token}=ctx;
  const only=(root,handler)=>(req,res,next)=>getRun().root===root?handler(req,res,next):next();
  const get=(path,root,handler)=>router.get(path,only(root,handler));
  const post=(path,root,handler)=>router.post(path,only(root,handler));
  const stored=async(kind,name)=>(await redis.lRange(key(kind,name),0,-1)).map(JSON.parse);
  const admit=(kind,name,record)=>redis.eval(admission,{keys:[key(kind,name)],arguments:[vulnerable()?'open':'fixed',JSON.stringify(record),kind==='outbox'?'3600':'0']});
  const invokeReportSource=async(name,operation,source)=>JSON.parse(await redis.eval(callDependency,{keys:[key('dependency-calls',name),key('dependency-state',name)],arguments:[operation,source,String(Date.now()),String(performance.now())]}));
  const reject=(res,result)=>{
    if(result===-2){res.status(422).json({error:'Local exercise storage limit'});return true;}
    if(result===-1){res.status(429).json({error:'Current member allowance exhausted'});return true;}
    return false;
  };

  get('/catalog-page','R0428',async(req,res)=>{
    if(!requireLogin(req,res))return;
    const size=integer(req.query.pageSize??2);
    if(!Number.isSafeInteger(size)||size<1)return res.status(400).json({error:'Invalid page size'});
    if(size>12)return res.status(422).json({error:'Local exercise page limit'});
    if(!vulnerable()&&size>5)return res.status(400).json({error:'Page size exceeds the published allowance'});
    const result=await db.query('SELECT id,title FROM catalog_records ORDER BY id LIMIT $1',[size]);
    res.json({records:result.rows,pageAllowance:5});
  });

  get('/notifications','R0437',async(req,res)=>{
    if(!requireLogin(req,res))return;
    res.json({recipient:req.member.contact,allowance:3,periodSeconds:3600,messages:await stored('outbox',req.member.name)});
  });
  post('/notifications','R0437',async(req,res)=>{
    if(!requireLogin(req,res))return;
    const recipient=req.body.recipient??req.member.contact;
    if(recipient!==req.member.contact||!message(req.body.message))return res.status(400).json({error:'Invalid notification'});
    const record={id:token(),recipient,message:req.body.message,createdAt:new Date().toISOString()};
    const result=await admit('outbox',req.member.name,record);
    if(reject(res,result))return;
    res.json({accepted:true,id:record.id,count:result});
  });

  get('/report-jobs','R0438',async(req,res)=>{
    if(!requireLogin(req,res))return;
    res.json({pendingAllowance:3,jobs:await stored('jobs',req.member.name)});
  });
  post('/report-jobs','R0438',async(req,res)=>{
    if(!requireLogin(req,res))return;
    if(!['monthly','weekly'].includes(req.body.period))return res.status(400).json({error:'Invalid report period'});
    const record={id:token(),period:req.body.period,state:'pending'};
    const result=await admit('jobs',req.member.name,record);
    if(reject(res,result))return;
    res.json({accepted:true,id:record.id,pending:result});
  });
  post('/report-jobs/:id/cancel','R0438',async(req,res)=>{
    if(!requireLogin(req,res))return;
    if(!/^[a-f0-9]{48}$/.test(req.params.id))return res.sendStatus(404);
    const removed=await redis.eval(cancelJob,{keys:[key('jobs',req.member.name)],arguments:[req.params.id]});
    if(!removed)return res.sendStatus(404);
    res.json({cancelled:true});
  });

  get('/sync-reports','R0439',async(req,res)=>{
    if(!requireLogin(req,res))return;
    res.json({sources:['primary','archive'],attemptAllowance:3,calls:await stored('dependency-calls',req.member.name)});
  });
  post('/sync-reports','R0439',async(req,res)=>{
    if(!requireLogin(req,res))return;
    const source=req.body.source;
    if(!['primary','archive'].includes(source))return res.status(400).json({error:'Unknown report source'});
    const operation=token(),attemptLimit=vulnerable()?8:3;
    for(let iteration=0;iteration<attemptLimit;iteration++){
      if(!vulnerable()&&iteration>0)await delay(10*iteration);
      // This callback performs the local fixture's operation and records each
      // invocation independently of the selected arm before returning its result.
      const response=await invokeReportSource(req.member.name,operation,source);
      if(!response)return res.status(422).json({error:'Local exercise dependency-call limit',operation});
      if(response.outcome==='ok')return res.json({synchronized:true,operation,report:'Current service report'});
    }
    res.status(503).json({error:'Report source unavailable within the retry allowance',operation});
  });

  get('/service-log','R0440',async(req,res)=>{
    if(!requireLogin(req,res))return;
    const content=await readFile(file(req.member.name));
    const entries=content.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
    res.json({periodAllowanceBytes:1024,bytes:content.byteLength,entries});
  });
  post('/service-log','R0440',async(req,res)=>{
    if(!requireLogin(req,res))return;
    const copies=integer(req.body.copies??1);
    if(!message(req.body.message)||!Number.isSafeInteger(copies)||copies<1||copies>16)return res.status(400).json({error:'Invalid service log entry'});
    const line=JSON.stringify({message:req.body.message})+'\n',entryBytes=Buffer.byteLength(line)*copies;
    // The same finite guard bounds even JSON escaping expansion in all arms.
    if(entryBytes>8192)return res.status(422).json({error:'Local exercise log-entry limit'});
    const result=await serialLog(async()=>{
      const previous=await readFile(file(req.member.name));
      if(previous.byteLength+entryBytes>8192)return {status:422,error:'Local exercise log-storage limit'};
      if(!vulnerable()&&previous.byteLength+entryBytes>1024)return {status:413,error:'Current service log period allowance exceeded'};
      await appendFile(file(req.member.name),line.repeat(copies),'utf8');
      return {status:200,recorded:true,appendedBytes:entryBytes,totalBytes:(await readFile(file(req.member.name))).byteLength};
    });
    const {status,...body}=result;res.status(status).json(body);
  });
}
