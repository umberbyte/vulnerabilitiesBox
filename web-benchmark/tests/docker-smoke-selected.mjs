// Focused Docker smoke for selected Batch 05 boundaries. This is not the full
// V/F/N acceptance or a scanner measurement.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
import WebSocket from 'ws';

const runFile=promisify(execFile);
const docker=process.env.DOCKER_EXE||'docker';
const container=process.env.BENCHMARK_VALIDATION_CONTAINER||'web-benchmark-validation-app-1';
const origin=process.env.BENCHMARK_VALIDATION_ORIGIN||'http://127.0.0.1:18080';
const seed='batch5-docker-smoke';
const report={schema:'benchmark-docker-smoke-selected-0.1',scope:'selected V/F boundaries only; no N, no scanner, no full regression',startedAt:new Date().toISOString(),origin,results:[]};
const assert=(condition,label)=>{if(!condition)throw Error(label);};
async function control(...args){
 const {stdout}=await runFile(docker,['exec',container,'node','src/control.mjs',...args],{timeout:15000,maxBuffer:1024*1024});
 return JSON.parse(stdout);
}
async function reset(root,variant,mode){
 const manifest=await control('reset',root,mode,seed,variant),oracle=await control('oracle');
 assert(oracle.root===root&&oracle.variant===variant&&oracle.mode===mode,'control identity mismatch');
 return {base:manifest.base,canary:oracle.canary};
}
async function json(path,body,cookie,options={}){
 return fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...options.headers},body:typeof body==='string'?body:JSON.stringify(body),redirect:'manual'});
}
async function login(base,user='alice'){
 const response=await json(base+'/login',{username:user,password:`Fixture-${user}-2026!`});
 assert(response.status===200,'fixture login failed');
 const cookie=response.headers.get('set-cookie')?.split(';')[0];assert(cookie?.startsWith('sid='),'session cookie absent');return cookie;
}
async function frame(base,cookie,value){
 return new Promise((resolve,reject)=>{
  const client=new WebSocket(origin.replace(/^http/,'ws')+base+'/v5-socket',{headers:{cookie},handshakeTimeout:2500});
  const timer=setTimeout(()=>{client.terminate();reject(Error('WebSocket deadline'));},3000);
  client.once('open',()=>client.send(JSON.stringify(value)));
  client.once('message',bytes=>{clearTimeout(timer);resolve(JSON.parse(bytes.toString()));client.close();});
  client.once('error',error=>{clearTimeout(timer);reject(error);});
 });
}
const cases=[
 ['R0377','B0378',async({base,canary},mode)=>{
  const first=await (await fetch(origin+base+'/v5-cache/public;private')).json();
  const second=await (await fetch(origin+base+'/v5-cache/public')).json();
  assert(first.text===canary,'private path fixture absent');
  assert(second.text===(mode==='V'?canary:'Public page'),'path cache arm mismatch');
 }],
 ['R0377','B0379',async({base,canary},mode)=>{
  const first=await (await fetch(origin+base+'/v5-cache/public%2Fprivate')).json();
  const second=await (await fetch(origin+base+'/v5-cache/public%252Fprivate')).json();
  assert(first.text===canary,'decoded private fixture absent');
  assert(second.text===(mode==='V'?canary:'Public page'),'decode cache arm mismatch');
 }],
 ['R0150','B0361',async({base,canary},mode)=>{
  const cookie=await login(base);
  const response=await json(base+'/v5-parse','{"target":101,"target":102,"action":"read"}',cookie);
  assert(response.status===(mode==='V'?200:400),'duplicate JSON status mismatch');
  if(mode==='V')assert((await response.json()).document===canary,'duplicate JSON did not reach protected document');
 }],
 ['R0329','B0329',async({base},mode)=>{
  const cookie=await login(base);
  const normal=await json(base+'/v5-auth',{operation:'change',contact:'alice.updated@example.test',csrf:(await(await fetch(origin+base+'/session',{headers:{cookie}})).json()).csrf},cookie);
  assert(normal.status===200,'normal CSRF operation failed');
  const bypass=await json(base+'/v5-auth',{operation:'change',contact:'attacker@example.test'},cookie);
  assert(bypass.status===(mode==='V'?200:403),'missing Fetch Metadata arm mismatch');
 }],
 ['R0200','B0200',async({base,canary},mode)=>{
  const cookie=await login(base);
  const first=await(await json(base+'/v5-auth',{operation:'issue'},cookie)).json();
  await json(base+'/v5-auth',{operation:'issue'},cookie);
  const replay=await json(base+'/v5-auth',{operation:'verify',challenge:first.challenge,signature:first.signature},cookie);
  assert(replay.status===(mode==='V'?200:403),'WebAuthn challenge replay arm mismatch');
  if(mode==='V')assert((await replay.json()).privateData===canary,'challenge replay did not reach protected data');
 }],
 ['R0126','B0127',async({base,canary},mode)=>{
  const linked=await json(base+'/v5-files',{action:'link'});
  const file=await fetch(origin+base+'/v5-files?name=linked.txt');
  assert(linked.status===(mode==='V'?200:403),'hardlink creation arm mismatch');
  assert(file.status===(mode==='V'?200:404),'hardlink exposure arm mismatch');
  if(mode==='V')assert(await file.text()===canary,'hardlink inode did not expose fixture');
 }],
 ['R0481','B0482',async({base,canary},mode)=>{
  const response=await json(base+'/v5-errors',{value:'report'}),body=await response.json();
  assert(response.status===400,'SQL error did not occur');
  assert(JSON.stringify(body).includes(canary)===(mode==='V'),'SQL error secrecy arm mismatch');
 }],
 ['R0271','B0342',async({base,canary},mode)=>{
  const cookie=await login(base),answer=await frame(base,cookie,{action:'read',user:'bob'});
  assert(mode==='V'?answer.body===canary:answer.error==='forbidden','WebSocket subject arm mismatch');
 }],
 ['R0331','B0339',async({base,canary},mode)=>{
  const response=await fetch(origin+base+'/v5-transport/local',{headers:{origin:'https://evil.benchmark.test:8444'}});
  assert((await response.json()).localOnlySecret===canary,'local API fixture absent');
  assert((response.headers.get('access-control-allow-origin')==='*')===(mode==='V'),'local API CORS arm mismatch');
 }],
 ['R0461','B0462',async({base},mode)=>{
  const response=await json(base+'/v5-transport/login',{username:'alice',password:'Fixture-alice-2026!'});
  assert(mode==='V'?response.status===200:[308,426].includes(response.status),'HTTP credential arm mismatch');
 }],
];
for(const [root,variant,check] of cases)for(const mode of ['V','F']){
 const start=Date.now();
 try{const context=await reset(root,variant,mode);await check(context,mode);report.results.push({root,variant,mode,status:'passed',elapsedMs:Date.now()-start});}
 catch(error){report.results.push({root,variant,mode,status:'failed',reason:error.message,elapsedMs:Date.now()-start});}
}
report.finishedAt=new Date().toISOString();
report.summary={cells:report.results.length,passed:report.results.filter(x=>x.status==='passed').length,failed:report.results.filter(x=>x.status==='failed').length};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/docker-smoke-selected.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
if(report.summary.failed)process.exitCode=1;
