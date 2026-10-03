const cases={
  B0072:{root:'R0072',title:'awk式実行',normal:'2+3',expected:'5',family:'CLI式評価'},
  B0073:{root:'R0072',title:'sed式実行',normal:'s/Guide/Welcome/p',expected:'Welcome',family:'CLI置換式'},
  B0078:{root:'R0072',title:'検索プログラム式',normal:'-name public.txt',expected:'public.txt',family:'CLI検索式'},
  B0079:{root:'R0076',title:'圧縮コマンドhook',normal:'public.txt',expected:'',family:'CLI圧縮hook',kind:'boundary'},
  B0081:{root:'R0071',title:'出力先リダイレクト',normal:'public/report.txt',expected:'',family:'shell出力先',kind:'boundary'},
  B0083:{root:'R0071',title:'スクリプト標準入力',normal:'Public guide',expected:'Public guide',family:'shell標準入力',kind:'boundary'},
  B0085:{root:'R0084',title:'PATH探索',normal:'trusted',expected:'Trusted tool',family:'CLI実行ファイル探索',kind:'boundary'},
  B0087:{root:'R0071',title:'スクリプト引数再解釈',normal:'Guide',expected:'Guide',family:'shell子処理',kind:'boundary'},
  B0088:{root:'R0071',title:'改行バッチファイル',normal:'Guide',expected:'Guide',family:'shell生成script',kind:'boundary'},
  B0090:{root:'R0076',title:'レスポンスファイル',normal:'public.txt',expected:'',family:'CLI引数ファイル',kind:'boundary'}
};
const active=new Set(Object.keys(cases));
let records=[];
const all=Object.entries(cases).map(([variant,item])=>({
  root:item.root,variant,...(variant==='B0072'?{}:{additionalVariant:true}),title:item.title,feature:'b6-cli-'+variant.slice(1),family:item.family,
  entry:'/cli-workbook',allowedPaths:variant==='B0081'?['cli-workbook','cli-report']:['cli-workbook'],
  requests:[['GET','/cli-workbook',{}],['POST','/cli-workbook',item.kind==='boundary'?{value:item.normal}:{expression:item.normal}],...(variant==='B0081'?[['GET','/cli-report',{name:'report.txt'}]]:[])],
  sessionProtectedPath:'/cli-workbook',negativeDescription:variant==='B0081'?'公開領域への正常な保存は成功し、shellリダイレクトで保護領域へ書き込まない。':'固定fixtureの正常操作は成功し、CLI・shell・PATH入力から隔離workerの秘密ファイルを出力しない。',
  implementationNote:item.kind==='boundary'?'既存の隔離executorで実GNU tarまたは/bin/shを起動。Vは入力がoption、shell、PATHまたは生成scriptを変更し、F/Nは固定引数・固定実行path・データとして処理する。':'既存の隔離executorで実awk/sed/findを起動。Vは入力をプログラム式に渡し、F/Nは演算・置換・名前検索を検証して固定引数へ変換する。shell起動はCLI内部の実行アクションに限定する。'
}));
export const definitions=all.filter(item=>!item.additionalVariant);
export const variantDefinitions=all.filter(item=>item.additionalVariant);
export async function reset(){records=[];}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
  router.get('/cli-workbook',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    res.type('html').send(page('作業式','<p>作業式を送信すると、隔離された処理環境で結果を表示します。</p>'));
  });
  router.get('/cli-report',selected,async(req,res)=>{
    if(getRun().variant!=='B0081')return res.sendStatus(404);
    if(!requireLogin(req,res))return;
    if(req.query.name!=='report.txt')return res.sendStatus(400);
    const response=await fetch((process.env.EXECUTOR_URL||'http://executor:8090')+'/cli-public-file/report.txt',{signal:AbortSignal.timeout(1500)});
    res.status(response.status).type('text/plain').send(await response.text());
  });
  router.post('/cli-workbook',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    const item=cases[getRun().variant],input=item.kind==='boundary'?req.body?.value:req.body?.expression;
    if(typeof input!=='string'||input.length>160)return res.sendStatus(400);
    const response=await fetch((process.env.EXECUTOR_URL||'http://executor:8090')+(item.kind==='boundary'?'/cli-boundary':'/cli-evaluate'),{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({variant:getRun().variant,[item.kind==='boundary'?'value':'expression']:input,vulnerable:vulnerable()}),signal:AbortSignal.timeout(1500)
    });
    if(response.status===400)return res.sendStatus(400);
    const result=await response.json();
    records.push({variant:getRun().variant,input,status:response.status,code:result.code,exposed:result.output.includes(getRun().canary),protectedWrite:result.protectedWrite===true});
    if(records.length>8)records.shift();
    res.status(response.status).json({output:result.output,error:result.error,code:result.code,protectedWrite:result.protectedWrite===true});
  });
}
export async function audit({getRun}){return active.has(getRun().variant)?{batch6Cli:{records:[...records]}}:{};}
