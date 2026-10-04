// Server-side CORS predicate diagnostic only. This does not establish browser readability.
import {mkdir,writeFile} from 'node:fs/promises';
import {sourceSnapshot,compareSources,runtimeSourceProof,compareRuntimeSourceProof} from '../src/reporting/source.mjs';

const controlUrl=process.env.CONTROL_URL;
const key=process.env.BENCHMARK_CONTROL_KEY;
const origin=process.env.BENCHMARK_VALIDATION_ORIGIN||'http://app:8080';
if(!controlUrl||!key)throw Error('Private local Docker control is required');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function control(path,data){
 const response=await fetch(controlUrl+path,{method:data?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 assert(response.status===200,'private control failed: '+path+' HTTP '+response.status);
 return response.json();
}
const source=await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'});
const targetRuntimeSource={verifier:await runtimeSourceProof('.'),targetBefore:await control('/source-proof')};
targetRuntimeSource.verifierMatch=compareRuntimeSourceProof(targetRuntimeSource.verifier,targetRuntimeSource.targetBefore);
assert(targetRuntimeSource.verifierMatch.status==='matched','target and verifier source differ');
const report={schema:'benchmark-cors-scheme-diagnostic-0.1',startedAt:new Date().toISOString(),scope:'B0335 server-side CORS header predicate only; browser readability is unverified',source,targetRuntimeSource,results:[]};
for(const mode of ['V','F','N']){
 const result={root:'R0333',variant:'B0335',mode,status:'failed'};
 try{
  const manifest=await control('/reset',{root:'R0333',variant:'B0335',mode,seed:'cors-scheme-diagnostic'});
  const oracle=await control('/oracle');
  assert(oracle.root==='R0333'&&oracle.variant==='B0335'&&oracle.mode===mode,'control identity mismatch');
  const login=await fetch(origin+manifest.base+'/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'alice',password:'Fixture-alice-2026!'})});
  assert(login.status===200,'fixture login failed');
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  assert(cookie?.startsWith('sid='),'session cookie absent');
  const request=originValue=>fetch(origin+manifest.base+'/v4-csrf/report',{headers:{cookie,origin:originValue}});
  const normal=await request('https://app.benchmark.test:8443');
  assert(normal.status===200&&normal.headers.get('access-control-allow-origin')==='https://app.benchmark.test:8443'&&(await normal.json()).privateData===oracle.canary,'normal report failed');
  const attackOrigin='http://app.benchmark.test:8443';
  const probe=await request(attackOrigin);
  assert(probe.status===200&&(await probe.json()).privateData===oracle.canary,'report fixture absent');
  assert((probe.headers.get('access-control-allow-origin')===attackOrigin)===(mode==='V'),'scheme-confusion header arm mismatch');
  result.status='passed';result.headerAllowed=mode==='V';
 }catch(error){result.reason=error.message;}
 report.results.push(result);
}
report.finishedAt=new Date().toISOString();
report.sourceAfter=compareSources(source,await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'}));
targetRuntimeSource.targetAfter=await control('/source-proof');
targetRuntimeSource.targetMatch=compareRuntimeSourceProof(targetRuntimeSource.targetBefore,targetRuntimeSource.targetAfter);
report.summary={passed:report.results.filter(item=>item.status==='passed').length,failed:report.results.filter(item=>item.status==='failed').length,claim:'server_header_only'};
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/cors-b0335-server-predicate-20261005.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
if(report.summary.failed||report.sourceAfter.status!=='matched'||targetRuntimeSource.targetMatch.status!=='matched')process.exitCode=1;
