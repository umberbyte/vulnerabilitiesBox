const cases={
  B0491:{title:'固定長buffer書込',normal:{amount:4,secondary:0}},
  B0492:{title:'整数積overflow',normal:{amount:2,secondary:2}},
  B0493:{title:'符号変換overflow',normal:{amount:4,secondary:0}},
  B0494:{title:'範囲外buffer読取',normal:{amount:0,secondary:6}},
  B0495:{title:'use-after-free',normal:{amount:0,secondary:0}},
  B0496:{title:'二重解放',normal:{amount:0,secondary:0}}
};
let records=[];
export const definitions=Object.entries(cases).map(([variant,item])=>({root:'R'+variant.slice(1),variant,title:item.title,feature:'b6-native-'+variant.slice(1),family:'N-API native memory',entry:'/native-workbook',allowedPaths:['native-workbook'],requests:[['GET','/native-workbook',{}],['POST','/native-workbook',item.normal]],sessionProtectedPath:'/native-workbook',negativeDescription:'正常入力は処理され、境界外入力は拒否され、隣接秘密やASan違反が生じない。',implementationNote:'実N-API C addonをASan付きで隔離executorの子プロセスに読み込む。Vのメモリ境界違反はASanで、範囲外読取は隣接秘密の実返却で確認する。'}));
export async function reset(){records=[];}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>Object.hasOwn(cases,getRun().variant)?next():next('route');
  router.get('/native-workbook',selected,(req,res)=>{if(!requireLogin(req,res))return;res.type('html').send(page('ネイティブ処理','<p>ファイルの寸法と範囲を入力します。</p>'));});
  router.post('/native-workbook',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    const amount=req.body?.amount,secondary=req.body?.secondary;
    if(!Number.isInteger(amount)||!Number.isInteger(secondary)||Math.abs(amount)>65536||Math.abs(secondary)>65536)return res.sendStatus(400);
    const variant=getRun().variant;
    try{
      const response=await fetch((process.env.EXECUTOR_URL||'http://executor:8090')+'/native-engine',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({variant:Number(variant.slice(1)),amount,secondary,canary:getRun().canary,vulnerable:vulnerable()}),signal:AbortSignal.timeout(2500)});
      const result=await response.json();
      const exposed=result.ok===true&&String(result.output).includes(getRun().canary);
      const asanViolation=result.asanViolation===true;
      records.push({variant,amount,secondary,exposed,asanViolation,crashed:result.crashed===true});
      if(result.crashed)return res.status(asanViolation?503:502).json({error:'native processing failed'});
      if(!result.ok)return res.sendStatus(400);
      res.json({output:result.output});
    }catch{res.sendStatus(502);}
  });
}
export async function audit({getRun}){return Object.hasOwn(cases,getRun().variant)?{batch6Native:{records:[...records]}}:{};}
