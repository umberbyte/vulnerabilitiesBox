// Focused Docker smoke for selected Batch 05 boundaries. This is not the full
// V/F/N acceptance or a scanner measurement.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import WebSocket from 'ws';
import {chromium} from 'playwright-core';

const runFile=promisify(execFile);
const docker=process.env.DOCKER_EXE||'docker';
const container=process.env.BENCHMARK_VALIDATION_CONTAINER||'web-benchmark-validation-app-1';
const origin=process.env.BENCHMARK_VALIDATION_ORIGIN||'http://127.0.0.1:18080';
const controlUrl=process.env.CONTROL_URL;
const controlKey=process.env.BENCHMARK_CONTROL_KEY;
const reportPath=process.env.BENCHMARK_SMOKE_REPORT||'artifacts/docker-smoke-selected.json';
const seed='batch5-docker-smoke';
const arms=(process.env.BENCHMARK_SMOKE_ARMS||'V,F').split(',');
if(!arms.length||new Set(arms).size!==arms.length||arms.some(arm=>!['V','F','N'].includes(arm)))throw Error('Invalid smoke arms');
const report={schema:'benchmark-docker-smoke-selected-0.1',scope:`selected ${arms.join('/')} boundaries; no scanner or full regression`,startedAt:new Date().toISOString(),origin,results:[]};
const assert=(condition,label)=>{if(!condition)throw Error(label);};
async function control(...args){
 if(controlUrl){
  if(!controlKey)throw Error('BENCHMARK_CONTROL_KEY is required with CONTROL_URL');
  const [action,root,mode,seed,variant]=args;
  const response=await fetch(controlUrl+(action==='reset'?'/reset':'/oracle'),{method:action==='reset'?'POST':'GET',headers:{'x-benchmark-key':controlKey,'content-type':'application/json'},...(action==='reset'?{body:JSON.stringify({root,mode,seed,variant})}:{})});
  if(!response.ok)throw Error('Control request failed: '+response.status);
  return response.json();
 }
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
async function csrfVariant({base},mode,attempt,rejected=403){
 const cookie=await login(base);
 const session=await (await fetch(origin+base+'/session',{headers:{cookie}})).json();
 assert(typeof session.csrf==='string'&&session.csrf.length>0,'genuine session CSRF token absent');
 const normal=await json(base+'/v4-csrf',{action:'update',contact:'normal@example.test',csrf:session.csrf},cookie);
 assert(normal.status===200,'normal token-bearing contact update failed');
 const attack=await attempt({base,cookie,csrf:session.csrf});
 assert(attack.status===(mode==='V'?200:rejected),'CSRF admission arm mismatch: HTTP '+attack.status);
 const alice=(await control('oracle')).users.find(user=>user.name==='alice');
 assert(alice?.contact===(mode==='V'?'attacker@example.test':'normal@example.test'),'persisted contact does not match CSRF arm');
 const anonymous=await json(base+'/v4-csrf',{action:'update',contact:'anonymous@example.test'});
 assert(anonymous.status===401,'anonymous update unexpectedly succeeded');
}
async function csrfBrowserVariant({base},mode,variant){
 const target=process.env.BENCHMARK_VALIDATION_SECURE_ORIGIN||'https://app.benchmark.test:8443';
 const attacker=process.env.BENCHMARK_VALIDATION_ATTACKER_ORIGIN||'https://evil.benchmark.test:8444';
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  try{
   const page=await context.newPage();
   const loginResponse=await context.request.post(target+base+'/login',{data:{username:'alice',password:'Fixture-alice-2026!'}});
   assert(loginResponse.status()===200,'secure browser-context login failed');
   const cookies=await context.cookies(target);
   assert(cookies.some(item=>item.name==='sid'&&item.secure&&item.sameSite==='None'),'cross-site-capable Secure SameSite=None session cookie absent');
   const session=await (await context.request.get(target+base+'/session')).json();
   assert(typeof session.csrf==='string'&&session.csrf.length>0,'secure browser-context CSRF token absent');
   if(variant==='B0318')assert(session.csrf.length===48,'fixture CSRF token length changed');
   const normal=await context.request.post(target+base+'/v4-csrf',{data:{action:'update',contact:'normal@example.test',csrf:session.csrf}});
   assert(normal.status()===200,'secure normal token-bearing update failed');
   const attackerPage=attacker+'/browser-csrf-fixture'+(variant==='B0322'?'?next=app.benchmark.test':'');
   const navigation=await page.goto(attackerPage);
   assert(navigation?.status()===200&&new URL(page.url()).origin===attacker,'distinct-origin attacker page unavailable');
   let attackRequest,requestFailure;
   const browserDiagnostics=[];
   page.on('console',message=>{if(message.type()==='error')browserDiagnostics.push(message.text());});
   page.on('request',request=>{if(request.url()===target+base+'/v4-csrf')attackRequest=request;else browserDiagnostics.push('request='+request.url());});
   page.on('requestfailed',request=>{requestFailure=request.failure()?.errorText;browserDiagnostics.push('failed='+request.url()+':'+requestFailure);});
   const attackResponsePromise=page.waitForResponse(response=>response.url()===target+base+'/v4-csrf',{timeout:5000}).then(response=>({response}),error=>({error}));
   if(variant==='B0320'){
    await page.evaluate(url=>{
     const frame=document.createElement('iframe');
     frame.setAttribute('sandbox','allow-scripts allow-forms allow-same-site-none-cookies');
     frame.srcdoc=`<!doctype html><form method="post" action="${url}"><input name="action" value="update"><input name="contact" value="attacker@example.test"></form><script>document.forms[0].submit()</script>`;
     document.body.append(frame);
    },target+base+'/v4-csrf');
   }else{
    const browserResult=await page.evaluate(async({url,variant})=>{
     const fields={action:'update',contact:'attacker@example.test'};
     if(variant==='B0315')fields._method='DELETE';
     if(variant==='B0318')fields.csrf='0'.repeat(48);
     let body,headers={};
     if(variant==='B0317'){body=JSON.stringify(fields);headers={'content-type':'text/plain'};}
     else if(variant==='B0327'){body=new FormData();for(const [key,value] of Object.entries(fields))body.set(key,value);}
     else{body=new URLSearchParams(fields);headers={'content-type':'application/x-www-form-urlencoded'};}
     try{await fetch(url,{method:'POST',mode:'no-cors',credentials:'include',headers,body,
      ...(variant==='B0321'?{referrerPolicy:'no-referrer'}:variant==='B0322'?{referrerPolicy:'unsafe-url'}:{})});return 'sent';}
     catch(error){return String(error);}
    },{url:target+base+'/v4-csrf',variant});
    assert(browserResult==='sent','browser fetch failed: '+browserResult+'; network='+requestFailure+'; '+browserDiagnostics.join(' | '));
   }
   const {response:attackResponse,error:responseError}=await attackResponsePromise;
   assert(attackResponse,'browser response unavailable: '+responseError?.message);
   assert(attackRequest,'browser did not send cross-origin CSRF request');
   assert(new URL(page.url()).origin===attacker&&new URL(attackRequest.url()).origin===target&&attacker!==target,'browser request did not cross distinct origins');
   assert(attackResponse.status()===(mode==='V'?200:variant==='B0317'?415:403),'browser cross-origin request returned HTTP '+attackResponse.status());
   const alice=(await control('oracle')).users.find(user=>user.name==='alice');
   assert(alice?.contact===(mode==='V'?'attacker@example.test':'normal@example.test'),'browser cross-origin request changed wrong arm');
  }finally{await context.close();}
 }finally{await browser.close();}
}
function csrfWithBrowser(root,variant,attempt,rejected=403){
 return [root,variant,async(context,mode)=>{
  await csrfVariant(context,mode,attempt,rejected);
  await csrfBrowserVariant(await reset(root,variant,mode),mode,variant);
 }];
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
 ['R0371','B0372',async({base,canary},mode)=>{
  const privateResponse=await (await fetch(origin+base+'/v4-cache?q=private')).json();
  const publicResponse=await (await fetch(origin+base+'/v4-cache?q=public')).json();
  assert(privateResponse.result===canary,'private query fixture absent');
  assert(publicResponse.result===(mode==='V'?canary:'Public search result'),'query cache key arm mismatch');
 }],
 ['R0371','B0373',async({base,canary},mode)=>{
  const alice=await login(base),bob=await login(base,'bob');
  const aliceCard=await (await fetch(origin+base+'/v4-cache',{headers:{cookie:alice}})).json();
  const bobCard=await (await fetch(origin+base+'/v4-cache',{headers:{cookie:bob}})).json();
  assert(aliceCard.card==='alice:'+canary,'Alice card fixture absent');
  assert(bobCard.card===(mode==='V'?aliceCard.card:'bob:bob@example.test'),'subject cache isolation arm mismatch');
 }],
 ['R0371','B0374',async({base},mode)=>{
  const privateResponse=await (await json(base+'/v4-cache',{draft:'private-draft'})).json();
  const publicResponse=await (await fetch(origin+base+'/v4-cache')).json();
  assert(privateResponse.method==='POST'&&privateResponse.draft==='private-draft','private draft fixture absent');
  assert(publicResponse.draft===(mode==='V'?'private-draft':'Published draft'),'method cache key arm mismatch');
 }],
 ['R0371','B0375',async({base,canary},mode)=>{
  const html=await fetch(origin+base+'/v4-cache',{headers:{accept:'text/html'}});
  const htmlBody=await html.text();
  const jsonResponse=await fetch(origin+base+'/v4-cache',{headers:{accept:'application/json'}});
  assert(html.status===200&&htmlBody.includes(canary),'HTML representation fixture absent');
  assert(jsonResponse.headers.get('content-type')?.includes('text/html')===(mode==='V'),'Accept cache key arm mismatch');
  if(mode!=='V')assert((await jsonResponse.json()).content==='Public JSON record','fixed JSON representation absent');
 }],
 ['R0371','B0376',async({base,canary},mode)=>{
  const alice=await login(base);
  const privateResponse=await (await fetch(origin+base+'/v4-cache',{headers:{cookie:alice}})).json();
  const publicResponse=await (await fetch(origin+base+'/v4-cache')).json();
  assert(privateResponse.authorized&&privateResponse.profile==='alice:'+canary,'authenticated profile fixture absent');
  assert(publicResponse.profile===(mode==='V'?privateResponse.profile:'Public profile'),'authenticated cache isolation arm mismatch');
 }],
 ['R0371','B0385',async({base,canary},mode)=>{
  const alice=await login(base),bob=await login(base,'bob');
  const aliceFragment=await (await fetch(origin+base+'/v4-cache',{headers:{cookie:alice}})).json();
  const bobFragment=await (await fetch(origin+base+'/v4-cache',{headers:{cookie:bob}})).json();
  assert(aliceFragment.fragment.includes(canary),'Alice fragment fixture absent');
  assert(bobFragment.fragment===(mode==='V'?aliceFragment.fragment:'<aside>bob:bob@example.test</aside>'),'fragment subject cache arm mismatch');
 }],
 ['R0371','B0386',async({base,canary},mode)=>{
  const alice=await login(base),carol=await login(base,'carol');
  const aliceRecord=await (await fetch(origin+base+'/v4-cache?id=101',{headers:{cookie:alice}})).json();
  const carolRecord=await (await fetch(origin+base+'/v4-cache?id=101',{headers:{cookie:carol}})).json();
  assert(aliceRecord.document===canary,'tenant A document fixture absent');
  assert(carolRecord.document===(mode==='V'?canary:'Tenant B record'),'tenant cache namespace arm mismatch');
 }],
 ['R0371','B0388',async({base,canary},mode)=>{
  const getWithBody=body=>new Promise((resolve,reject)=>{
   const payload=body?JSON.stringify(body):'';
   const req=httpRequest(origin+base+'/v4-cache',{method:'GET',headers:payload?{'content-type':'application/json','content-length':Buffer.byteLength(payload)}:{}},res=>{
    let text='';res.on('data',part=>text+=part);res.on('end',()=>resolve({status:res.statusCode,text}));
   });req.on('error',reject);req.end(payload);
  });
  const warm=await getWithBody({term:'private'}),clean=await getWithBody();
  assert(warm.status===(mode==='V'?200:400),'GET-body rejection arm mismatch');
  assert(clean.status===200&&JSON.parse(clean.text).result===(mode==='V'?canary:'Public body result'),'GET-body cache key arm mismatch');
 }],
 ['R0371','B0389',async({base,canary},mode)=>{
  const secureOrigin=process.env.BENCHMARK_VALIDATION_SECURE_ORIGIN;
  if(!secureOrigin)throw Error('Local secure origin is required for B0389');
  const alice=await login(base);
  const privateResponse=await new Promise((resolve,reject)=>{
   const req=httpsRequest(secureOrigin+base+'/v5-cache',{headers:{cookie:alice},rejectUnauthorized:false},res=>{
    let text='';res.on('data',part=>text+=part);res.on('end',()=>resolve({status:res.statusCode,text}));
   });req.on('error',reject);req.end();
  });
  const publicResponse=await (await fetch(origin+base+'/v5-cache')).json();
  assert(privateResponse.status===200&&JSON.parse(privateResponse.text).text===canary,'secure private fixture absent');
  assert(publicResponse.text===(mode==='V'?canary:'Public transport page'),'scheme cache isolation arm mismatch');
 }],
 csrfWithBrowser('R0311','B0312',({base,cookie})=>json(base+'/v4-csrf',{action:'update',contact:'attacker@example.test'},cookie)),
 csrfWithBrowser('R0311','B0315',({base,cookie})=>json(base+'/v4-csrf',{action:'update',contact:'attacker@example.test',_method:'DELETE'},cookie)),
 csrfWithBrowser('R0311','B0317',({base,cookie})=>json(base+'/v4-csrf',JSON.stringify({action:'update',contact:'attacker@example.test'}),cookie,{headers:{'content-type':'text/plain'}}),415),
 csrfWithBrowser('R0311','B0318',({base,cookie,csrf})=>json(base+'/v4-csrf',{action:'update',contact:'attacker@example.test',csrf:(csrf[0]==='a'?'b':'a')+csrf.slice(1)},cookie)),
 csrfWithBrowser('R0311','B0327',({base,cookie})=>{
  const form=new FormData();form.set('action','update');form.set('contact','attacker@example.test');
  return fetch(origin+base+'/v4-csrf',{method:'POST',headers:{cookie},body:form});
 }),
 csrfWithBrowser('R0319','B0320',({base,cookie})=>json(base+'/v4-csrf',{action:'update',contact:'attacker@example.test'},cookie,{headers:{origin:'null'}})),
 csrfWithBrowser('R0319','B0321',({base,cookie})=>json(base+'/v4-csrf',{action:'update',contact:'attacker@example.test'},cookie)),
 csrfWithBrowser('R0319','B0322',({base,cookie})=>json(base+'/v4-csrf',{action:'update',contact:'attacker@example.test'},cookie,{headers:{referer:'https://evil.benchmark.test:8444/next?app.benchmark.test'}})),
];
const requested=process.env.BENCHMARK_SMOKE_VARIANTS?.split(',').map(value=>value.trim())||['B0378','B0379','B0361','B0329','B0200','B0127','B0482','B0342','B0339','B0462'];
if(!requested.length||new Set(requested).size!==requested.length||requested.some(variant=>!cases.some(item=>item[1]===variant)))throw Error('Unknown or duplicate smoke variant');
for(const [root,variant,check] of cases.filter(item=>requested.includes(item[1])))for(const mode of arms){
 const start=Date.now();
 try{const context=await reset(root,variant,mode);await check(context,mode);report.results.push({root,variant,mode,status:'passed',elapsedMs:Date.now()-start});}
 catch(error){report.results.push({root,variant,mode,status:'failed',reason:error.message,elapsedMs:Date.now()-start});}
}
report.finishedAt=new Date().toISOString();
report.summary={cells:report.results.length,passed:report.results.filter(x=>x.status==='passed').length,failed:report.results.filter(x=>x.status==='failed').length};
await mkdir('artifacts',{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
if(report.summary.failed)process.exitCode=1;
