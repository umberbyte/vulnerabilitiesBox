import {randomBytes} from 'node:crypto';
import {writeFile,rename} from 'node:fs/promises';
import {runtimeSourceProof,compareRuntimeSourceProof} from '../src/reporting/source.mjs';

// Prerequisite reachability only. This does not spider, actively scan, log in,
// or establish whether the browser sends a cookie or credentials over HTTP.
const fixtures=[
  {root:'R0233',variant:'B0233',origins:['https://app.benchmark.test:8443','http://app.benchmark.test:8080'],paths:['/b2-cookie-account','/b2-cookie-observation']},
  {root:'R0461',variant:'B0461',origins:['http://benchmark.test:8080','https://app:8443'],paths:['/transport-access','/transport-access']}
];
const output=process.argv[2]||'artifacts/dual-transport-probe-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
if(!/^artifacts\/dual-transport-probe-[A-Za-z0-9-]+\.json$/.test(output))throw Error('Output must be a new dual-transport-probe artifact');
const controlKey=process.env.BENCHMARK_CONTROL_KEY,apiKey=process.env.ZAP_API_KEY;
if(!controlKey||!apiKey||controlKey===apiKey)throw Error('Separate private control and ZAP API keys are required');
const startedAt=new Date().toISOString();
const report={schema:'benchmark-dual-transport-reachability-0.1',scope:'Local Docker fixture; normal GET transport prerequisite only; not a DAST scan or finding',startedAt,fixtures:fixtures.map(({root,variant,origins})=>({root,variant,requiredOrigins:origins})),cells:[],limitations:['No login, cookie-transfer, form POST, browser execution, spider, active scan, or alert evaluation.','HTTP and HTTPS origins are fixed to local Docker network aliases.','Source proof covers application/controller source bytes but not dependency service state.']};
let initial=true;
async function save(){
  const body=JSON.stringify(report,null,2)+'\n';
  if(initial){await writeFile(output,body,{flag:'wx',mode:0o600});initial=false;return;}
  const temporary=output+'.tmp-'+randomBytes(5).toString('hex');
  await writeFile(temporary,body,{flag:'wx',mode:0o600});await rename(temporary,output);
}
async function control(path,body){
  const response=await fetch('http://app:8099'+path,{method:body===undefined?'GET':'POST',headers:{'x-benchmark-key':controlKey,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('private_control_'+response.status);
  return response.json();
}
async function zap(component,kind,name,params={}){
  const url=new URL(`/JSON/${component}/${kind}/${name}/`,'http://zap:8090');
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  const response=await fetch(url,{headers:{'X-ZAP-API-Key':apiKey},signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok||data.code)throw Error('zap_api_'+(data.code||response.status));
  return data;
}
function message(data,url){
  const value=data.accessUrl?.[0]||data.messages?.[0];
  const request=/^GET (\S+) HTTP\/\S+/i.exec(value?.requestHeader||'');
  const response=/^HTTP\/\S+\s+(\d+)/i.exec(value?.responseHeader||'');
  if(request?.[1]!==url||!response||Number(response[1])<100)throw Error('zap_target_not_reached');
  return {url,status:Number(response[1]),messageId:value.id||null};
}
const codeFrom=error=>String(error?.message||error?.name||'unknown_error').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80);
await save();
try {
  report.source={verifier:await runtimeSourceProof('.'),targetBefore:await control('/source-proof')};
  report.source.beforeMatch=compareRuntimeSourceProof(report.source.verifier,report.source.targetBefore);
  if(report.source.beforeMatch.status!=='matched')throw Error('source_mismatch_before_probe');
  const readinessDeadline=Date.now()+90000;
  while(true){
    try{report.zapVersion=(await zap('core','view','version')).version;break;}
    catch{if(Date.now()>=readinessDeadline)throw Error('zap_not_ready');await new Promise(resolve=>setTimeout(resolve,1000));}
  }
  for(const fixture of fixtures)for(const arm of ['V','F','N']){
    const cell={root:fixture.root,variant:fixture.variant,arm,status:'running',startedAt:new Date().toISOString(),requests:[]};
    report.cells.push(cell);await save();
    let metering=false;
    try {
      const manifest=await control('/reset',{root:fixture.root,variant:fixture.variant,mode:arm,seed:'dual-transport-probe-20261005'});
      if(!/^\/w\/[a-f0-9]{12}$/.test(manifest.base)||JSON.stringify(manifest.requiredTargetOrigins)!==JSON.stringify(fixture.origins))throw Error('public_contract_mismatch');
      cell.workspace=manifest.base;
      await zap('core','action','newSession',{name:'dual-transport-'+fixture.variant+'-'+arm,overwrite:true});
      await control('/measurement/start',{});metering=true;
      for(let i=0;i<fixture.origins.length;i++){
        const url=fixture.origins[i]+manifest.base+fixture.paths[i];
        cell.requests.push(message(await zap('core','action','accessUrl',{url,followRedirects:false}),url));
      }
      cell.status='reached';
    }catch(error){cell.status='failed';cell.errorCode=codeFrom(error);}
    finally {
      if(metering){try{
        const meter=await control('/measurement/stop',{});
        cell.measurement={count:meter.count,peakActive:meter.peakActive,pendingHandlers:meter.pendingHandlers,openRequests:meter.openRequests,activeRequests:meter.activeRequests};
        if(meter.count!==cell.requests.length||meter.pendingHandlers!==0||meter.openRequests!==0||meter.activeRequests!==0){cell.status='failed';cell.errorCode='measurement_incomplete';}
      }catch{cell.stopError='measurement_stop_failed';cell.status='failed';}}
      cell.finishedAt=new Date().toISOString();await save();
    }
  }
  report.source.targetAfter=await control('/source-proof');
  report.source.afterMatch=compareRuntimeSourceProof(report.source.targetBefore,report.source.targetAfter);
  if(report.source.afterMatch.status!=='matched')throw Error('source_mismatch_after_probe');
}catch(error){report.errorCode=codeFrom(error);}
report.finishedAt=new Date().toISOString();
report.summary={cells:report.cells.length,reached:report.cells.filter(cell=>cell.status==='reached').length,failed:report.cells.filter(cell=>cell.status==='failed').length};
await save();
console.log(JSON.stringify({output,summary:report.summary,errorCode:report.errorCode||null}));
if(report.errorCode||report.summary.reached!==6)process.exitCode=1;
