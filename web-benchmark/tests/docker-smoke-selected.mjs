// Focused Docker smoke for selected Batch 05 boundaries. This is not the full
// V/F/N acceptance or a scanner measurement.
import {execFile} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {gzipSync} from 'node:zlib';
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
  if(!response.ok)throw Error('Control request failed: '+response.status+' '+(await response.text()).slice(0,300));
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
async function publicFileVariant({base,canary},mode,variant,name){
 const guide=await fetch(origin+base+'/v5-files?name=guide.txt');
 assert(guide.status===200&&await guide.text()==='Public file guide','normal public guide unavailable');
 const endpoint=origin+base+'/v5-files?name='+encodeURIComponent(name);
 if(variant==='B0459'){
  const before=await fetch(endpoint);
  assert(before.status===404,'temporary file exists before processing');
  await before.arrayBuffer();
  const operation=await json(base+'/v5-files',{action:'process'});
  assert(operation.status===200,'normal file processing failed');
  await operation.arrayBuffer();
 }
 const response=await fetch(endpoint);
 assert(response.status===(mode==='V'?200:404),'secret file visibility arm mismatch: HTTP '+response.status);
 if(mode==='V')assert((await response.text()).includes(canary),'published file does not contain actual private canary');
 else await response.arrayBuffer();
 const state=(await control('oracle')).caseState?.batch5Files;
 assert(state?.variant===variant&&state.publicSecretFile===(mode==='V'),'filesystem audit disagrees with public response');
 const unrelated=await fetch(origin+base+'/v5-files?name='+encodeURIComponent('other-secret.txt'));
 assert(unrelated.status===404,'unlisted filename was accepted');
 await unrelated.arrayBuffer();
}
async function objectAuthorizationVariant({base,canary},mode,variant){
 const cookie=await login(base);
 const own=await json(base+'/v4-object',variant==='B0274'?{tenant:'A'}:variant==='B0276'?{scope:'mine'}:variant==='B0277'?{q:'Alice'}:variant==='B0278'?{id:101}:variant==='B0286'?{sourceId:101}:{id:101,expand:false},cookie);
 assert(own.status===200,'normal own-document operation failed');
 const ownBody=await own.json();
 if(variant==='B0274')assert(ownBody.documents.some(item=>item.id===101),'own document absent from normal list');
 else if(variant==='B0276')assert(ownBody.summary?.includes('Alice private document'),'own summary absent');
 else if(variant==='B0277')assert(ownBody.results.some(item=>item.id===101),'own search result absent');
 else if(variant==='B0278'){
  assert(ownBody.resultId===101,'own asynchronous result ID absent');
  const result=await fetch(origin+base+'/v4-object/result/101',{headers:{cookie}});
  assert(result.status===200&&(await result.json()).body==='Alice private document','own asynchronous result unreadable');
 }else if(variant==='B0286')assert(ownBody.copied&&ownBody.body==='Alice private document','own copy failed');
 else assert(ownBody.body==='Alice private document'&&!ownBody.related,'normal unexpanded document mismatch');
 const attack=await json(base+'/v4-object',variant==='B0274'?{tenant:'B'}:variant==='B0276'?{scope:'all'}:variant==='B0277'?{q:'tenant'}:variant==='B0278'?{id:102}:variant==='B0286'?{sourceId:102}:{id:101,expand:true},cookie);
 if(variant==='B0276'||variant==='B0286'){
  assert(attack.status===(mode==='V'?200:403),'forbidden aggregate/copy admission arm mismatch');
  if(mode==='V')assert(JSON.stringify(await attack.json()).includes(canary),'aggregate/copy did not expose protected document');
 }else{
  assert(attack.status===200,'ordinary query endpoint failed');
  const body=await attack.json();
  if(variant==='B0278'){
   assert(body.resultId===102,'asynchronous result fixture absent');
   const result=await fetch(origin+base+'/v4-object/result/102',{headers:{cookie}});
   assert(result.status===(mode==='V'?200:403),'asynchronous result ownership arm mismatch');
   if(mode==='V')assert((await result.json()).body===canary,'foreign asynchronous result lacks private canary');
  }else assert(JSON.stringify(body).includes(canary)===(mode==='V'),'foreign document disclosure arm mismatch');
 }
 if(variant==='B0286'){
  const copies=(await control('oracle')).caseState?.batch4Objects?.copies;
  assert(copies?.length===(mode==='V'?2:1),'persisted document copies disagree with arm');
 }
}
async function profileAuthorizationVariant({base,canary},mode,variant){
 const alice=await login(base);
 const page=await fetch(origin+base+'/v4-profile',{headers:{cookie:alice}});
 assert(page.status===200,'normal member profile unavailable');
 await page.arrayBuffer();
 if(['B0288','B0295','B0304'].includes(variant)){
  const request=variant==='B0288'?{objectId:101}:variant==='B0295'?{query:'{ member { name secret } }'}:{format:'csv'};
  const response=await json(base+'/v4-profile',request,alice);
  assert(response.status===200,'normal profile read/export failed');
  if(variant==='B0288'){
   const body=await response.json();
   assert(body.member?.name==='alice'&&(body.member.secret===canary)===(mode==='V'),'attribute-level read arm mismatch');
  }else if(variant==='B0295'){
   const body=await response.json();
   assert(body.data?.member?.name==='alice'&&(body.data.member.secret===canary)===(mode==='V'),'GraphQL field read arm mismatch');
  }else assert((await response.text()).includes(canary)===(mode==='V'),'CSV secret export arm mismatch');
  return;
 }
 if(['B0297','B0298','B0299'].includes(variant)){
  const normal=variant==='B0297'?{profile:{contact:'normal@example.test'}}:variant==='B0298'?{patch:[{op:'replace',path:'/contact',value:'normal@example.test'}]}:{contact:'normal@example.test'};
  const update=await json(base+'/v4-profile',normal,alice);
  assert(update.status===200&&(await update.json()).contact==='normal@example.test','normal contact update failed');
  const escalation=variant==='B0297'?{profile:{role:'admin'}}:variant==='B0298'?{patch:[{op:'replace',path:'/role',value:'admin'}]}:{role:'admin'};
  const attempt=await json(base+'/v4-profile',escalation,alice);
  assert(attempt.status===200,'profile role-field request failed');
  const row=(await control('oracle')).caseState?.batch4Profile;
  assert(row?.aliceRole===(mode==='V'?'admin':'user')&&row.aliceContact==='normal@example.test','persisted role/contact arm mismatch');
  return;
 }
 const admin=await login(base,'admin');
 let endpoint=base+'/v4-profile/management',method='PATCH';
 if(variant==='B0293'){endpoint=base+'/v4-profile/legacy';method='POST';}
 if(variant==='B0294'){endpoint=base+'/v4-profile/rpc';method='POST';}
 if(variant==='B0292'){
  const forbidden=await fetch(origin+endpoint,{headers:{cookie:alice}});
  assert(forbidden.status===403,'normal member sees management operation');
  await forbidden.arrayBuffer();
  const available=await fetch(origin+endpoint,{headers:{cookie:admin}});
  assert(available.status===200,'administrator management view unavailable');
  await available.arrayBuffer();
 }
 const send=cookie=>fetch(origin+endpoint,{method,headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'rebuild'})});
 const normal=await send(admin);
 assert(normal.status===200,'normal administrator operation failed');
 await normal.arrayBuffer();
 const attempt=await send(alice);
 assert(attempt.status===(mode==='V'?200:403),'member management authorization arm mismatch');
 await attempt.arrayBuffer();
 const operations=(await control('oracle')).operations;
 assert(operations.length===(mode==='V'?2:1)&&operations.some(item=>item.username==='admin')&&operations.some(item=>item.username==='alice')===(mode==='V'),'persisted management operation arm mismatch');
}
async function accountStateVariant({base},mode,variant){
 const cookie=await login(base);
 const page=await fetch(origin+base+'/v4-account',{headers:{cookie}});
 assert(page.status===200,'normal account page unavailable');
 await page.arrayBuffer();
 if(['B0214','B0215','B0216'].includes(variant)){
  const contact='updated@example.test';
  if(variant==='B0215'){
   const issued=await json(base+'/v4-account',{operation:'request',contact},cookie);
   assert(issued.status===200,'normal email change request failed');
   const tokens=await issued.json();
   assert(typeof tokens.newEmailToken==='string','new email confirmation token absent');
   const unauthorized=await json(base+'/v4-account',{operation:'confirm',newEmailToken:tokens.newEmailToken},cookie);
   assert(unauthorized.status===(mode==='V'?200:403),'single-sided email confirmation arm mismatch');
   const afterAttack=(await control('oracle')).caseState?.batch4Account;
   assert(afterAttack?.alice.contact===(mode==='V'?contact:'alice@example.test'),'email confirmation changed wrong DB state');
   if(mode!=='V'){
    const authorized=await json(base+'/v4-account',{operation:'confirm',newEmailToken:tokens.newEmailToken,oldEmailToken:tokens.oldEmailToken},cookie);
    assert(authorized.status===200,'dual email confirmation failed');
   }
  }else{
   const unauthorized=await json(base+'/v4-account',{operation:'change',contact},cookie);
   assert(unauthorized.status===(mode==='V'?200:403),'missing reauthentication or old password arm mismatch');
   const afterAttack=(await control('oracle')).caseState?.batch4Account;
   assert(afterAttack?.alice.contact===(mode==='V'?contact:'alice@example.test'),'contact change changed wrong DB state');
   const authorized=await json(base+'/v4-account',{operation:'change',contact,oldPassword:'Fixture-alice-2026!',reauthenticated:true},cookie);
   assert(authorized.status===200,'authenticated contact change failed');
  }
  const final=(await control('oracle')).caseState?.batch4Account;
  assert(final?.alice.contact===contact,'normal contact change did not persist');
  return;
 }
 const issue=await json(base+'/v4-account',{operation:'issue'},cookie);
 assert(issue.status===200,'normal token issuance failed');
 const {token}=await issue.json();assert(typeof token==='string'&&token.length>16,'issued token missing');
 const first=await json(base+'/v4-account',{operation:'consume',token},cookie);
 assert(first.status===200,'first token consumption failed');
 const initialAudit=(await control('oracle')).caseState?.batch4Account;
 assert(initialAudit?.tokens?.length===1&&initialAudit.tokens[0].used===(mode!=='V'),'first consumption persistence mismatch');
 const second=await json(base+'/v4-account',{operation:'consume',token},cookie);
 assert(second.status===(mode==='V'?200:403),'second token consumption arm mismatch');
 const finalAudit=(await control('oracle')).caseState?.batch4Account;
 assert(finalAudit?.tokens?.length===1&&finalAudit.tokens[0].used===(mode!=='V'),'token reuse persistence mismatch');
 if(variant==='B0205'){
  const alice=(await control('oracle')).users.find(user=>user.name==='alice');
  assert(alice?.password==='Changed-alice-2026!','password change did not persist');
 }
}
async function accountSessionVariant({base,canary},mode,variant){
 const alice=await login(base);
 const page=await fetch(origin+base+'/v4-account',{headers:{cookie:alice}});
 assert(page.status===200,'normal account page unavailable');
 await page.arrayBuffer();
 if(variant==='B0229'){
  const normal=await json(base+'/v4-account',{operation:'status'},alice);
  assert(normal.status===200&&(await normal.json()).privateData===canary,'active member status unavailable');
  const admin=await login(base,'admin');
  const disable=await json(base+'/v4-account',{operation:'disable',username:'alice'},admin);
  assert(disable.status===200,'admin account disable failed');
  const after=await json(base+'/v4-account',{operation:'status'},alice);
  assert(after.status===(mode==='V'?200:403),'disabled member session arm mismatch');
  if(mode==='V')assert((await after.json()).privateData===canary,'disabled member private data absent');
  return;
 }
 if(variant==='B0302'){
  const admin=await login(base,'admin');
  const normal=await json(base+'/v4-account',{operation:'staff'},admin);
  assert(normal.status===200&&(await normal.json()).staffReport===canary,'normal admin operation failed');
  const downgrade=await json(base+'/v4-account',{operation:'downgrade'},admin);
  assert(downgrade.status===200,'admin role downgrade failed');
  const stale=await json(base+'/v4-account',{operation:'staff'},admin);
  assert(stale.status===(mode==='V'?200:403),'role cache after downgrade arm mismatch');
  if(mode==='V')assert((await stale.json()).staffReport===canary,'stale role report absent');
  return;
 }
 const issued=await json(base+'/v4-account',{operation:'issue'},alice);
 assert(issued.status===200,'normal account recovery issue failed');
 const body=await issued.json();assert(typeof body.ownToken==='string'&&body.ownToken.length>16,'recovery token absent');
 if(variant==='B0209'){
  const logs=(await control('oracle')).caseState?.batch4Account?.logs;
  assert(logs?.length===1&&logs[0].kind==='diagnostic'&&(logs[0].token===body.ownToken)===(mode==='V'),'recovery diagnostic log arm mismatch');
  if(mode!=='V')assert(logs[0].token==='[redacted]','safe diagnostic log is not redacted');
  return;
 }
 assert(typeof body.resetUrl==='string','normal reset URL absent');
 const landing=await fetch(origin+body.resetUrl,{headers:{cookie:alice}});
 assert(landing.status===200,'normal reset landing unavailable');
 await landing.arrayBuffer();
 const logs=(await control('oracle')).caseState?.batch4Account?.logs;
 assert(logs?.length===1&&logs[0].kind==='access'&&(logs[0].url.includes(body.ownToken))===(mode==='V'),'reset token access log arm mismatch');
}
async function remainingIdentityVariant({base,canary},mode,variant){
 if(variant==='B0192'){
  const page=await fetch(origin+base+'/v4-account/signin');
  assert(page.status===200,'dedicated normal sign-in page unavailable');
  await page.arrayBuffer();
  const normal=await json(base+'/v4-account/signin',{username:'alice',password:'Fixture-alice-2026!'});
  assert(normal.status===200,'genuine account sign-in failed');
  const normalCookie=normal.headers.get('set-cookie')?.split(';')[0];
  const session=await fetch(origin+base+'/session',{headers:{cookie:normalCookie}});
  assert(session.status===200&&(await session.json()).username==='alice','normal sign-in session missing');
  const shortened=await json(base+'/v4-account/signin',{username:'alice',password:'Fixture-WRONG-2026!'});
  assert(shortened.status===(mode==='V'?200:401),'truncated password comparison arm mismatch');
  if(mode==='V'){
   const cookie=shortened.headers.get('set-cookie')?.split(';')[0];
   const forgedSession=await fetch(origin+base+'/session',{headers:{cookie}});
   assert((await forgedSession.json()).username==='alice','truncated password did not create member session');
  }
  return;
 }
 if(['B0231','B0454'].includes(variant)){
  const cookie=await login(base);
  const normal=await fetch(origin+base+'/v4-account',{headers:{cookie}});
  assert(normal.status===200,'normal account page unavailable');await normal.arrayBuffer();
  const response=await json(base+'/v4-account',{operation:'link'},cookie);
  assert(response.status===200,'normal account link generation failed');
  const {link}=await response.json(),secret=variant==='B0231'?cookie.slice(4):canary;
  assert(typeof link==='string'&&link.startsWith(base+'/v4-account/landing'),'account link missing');
  assert(link.includes(secret)===(mode==='V'),'generated link secret arm mismatch');
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
   const context=await browser.newContext({ignoreHTTPSErrors:true});
   const page=await context.newPage();
   await page.goto((process.env.BENCHMARK_VALIDATION_SECURE_ORIGIN||'https://app:8443')+link);
   assert(page.url().includes(secret)===(mode==='V'),'browser address-history secret arm mismatch');
   assert((await page.locator('body').textContent()).length>0,'normal account landing unavailable');
  }finally{await browser.close();}
  return;
 }
 if(variant==='B0296'){
  const cookie=await login(base);
  const page=await fetch(origin+base+'/b3-profile',{headers:{cookie}});
  assert(page.status===200,'normal member profile unavailable');
  const normal=await json(base+'/b3-profile',{contact:'normal@example.test'},cookie);
  assert(normal.status===200,'normal contact save failed');
  const updated=await json(base+'/b3-profile',{contact:'normal@example.test',role:'admin'},cookie);
  assert(updated.status===200,'profile model update failed');
  const management=await fetch(origin+base+'/b3-management',{headers:{cookie}});
  assert(management.status===(mode==='V'?200:403),'mass-assignment management arm mismatch');
  if(mode==='V')assert((await management.json()).report===canary,'admin report absent after mass assignment');
  const events=(await control('oracle')).caseState?.protocolBatch?.events||[];
  assert(events.filter(item=>item.kind==='profile-save').length===2,'profile save events missing');
  assert(events.some(item=>item.kind==='profile-save'&&item.data?.role===(mode==='V'?'admin':'user')),'persisted profile role event absent');
  return;
 }
 const cookie=await login(base);
 const page=await fetch(origin+base+'/b3-codes',{headers:{cookie}});
 assert(page.status===200,'normal recovery code page unavailable');await page.arrayBuffer();
 const issue=await json(base+'/b3-codes',{},cookie);
 assert(issue.status===200,'normal recovery code issuance failed');
 const {code}=await issue.json();assert(typeof code==='string'&&code.length>16,'recovery code absent');
 const settings=await fetch(origin+base+'/b3-settings',{headers:{cookie}});
 assert(settings.status===200,'normal member settings unavailable');
 assert(JSON.stringify(await settings.json()).includes(code)===(mode==='V'),'recoverable code storage arm mismatch');
 const reset=await json(base+'/b3-reset',{token:code,password:'Changed-alice-2026!'},cookie);
 assert(reset.status===200,'genuine recovery code could not reset password');
 const again=await json(base+'/b3-reset',{token:code,password:'Changed-again-2026!'},cookie);
 assert(again.status===400,'recovery code was accepted twice');
 const alice=(await control('oracle')).users.find(user=>user.name==='alice');
 assert(alice?.password==='Changed-alice-2026!','recovery password state mismatch');
}
async function streamAuthorizationVariant({base,canary},mode,variant){
 const alice=await login(base);
 const page=await fetch(origin+base+(variant==='B0350'?'/b3-events':variant==='B0349'?'/v5-transport':'/v5-socket'),{headers:{cookie:alice}});
 assert(page.status===200,'normal stream or socket page unavailable');
 if(variant==='B0349')assert((await page.text()).includes('/v5-transport/events?tenant=A'),'normal SSE selector link absent');
 else await page.arrayBuffer();
 if(variant==='B0343'){
  const own=await frame(base,alice,{action:'read',room:'alice-private'});
  assert(own.owner==='alice'&&own.body==='Alice private document','own WebSocket room read failed');
  const foreign=await frame(base,alice,{action:'read',room:'bob-private'});
  assert(mode==='V'?foreign.owner==='bob'&&foreign.body===canary:foreign.error==='forbidden','foreign WebSocket room arm mismatch');
  return;
 }
 if(variant==='B0344'){
  const admin=await login(base,'admin');
  const normal=await frame(base,admin,{action:'rebuild'});
  assert(normal.completed===true,'normal admin WebSocket operation failed');
  const attack=await frame(base,alice,{action:'rebuild'});
  assert(mode==='V'?attack.completed===true:attack.error==='forbidden','member WebSocket management arm mismatch');
  const operations=(await control('oracle')).operations;
  assert(operations.length===(mode==='V'?2:1)&&operations.some(item=>item.username==='admin')&&operations.some(item=>item.username==='alice')===(mode==='V'),'persisted WebSocket operation count mismatch');
  return;
 }
 if(variant==='B0349'){
  const own=await fetch(origin+base+'/v5-transport/events',{headers:{cookie:alice}});
  assert(own.status===200&&own.headers.get('content-type')?.includes('text/event-stream'),'normal SSE endpoint unavailable');
  const ownBody=await own.text();
  assert(ownBody.includes('event: update')&&ownBody.includes('Alice private document')&&ownBody.includes('"tenant":"A"'),'own SSE document absent');
  const foreign=await fetch(origin+base+'/v5-transport/events?tenant=B',{headers:{cookie:alice}});
  assert(foreign.status===200,'tenant selector SSE endpoint unavailable');
  const body=await foreign.text();
  assert(body.includes(canary+' tenant B')===(mode==='V'),'SSE tenant data arm mismatch');
  assert(body.includes('"tenant":"'+(mode==='V'?'B':'A')+'"'),'SSE tenant identity arm mismatch');
  if(mode!=='V')assert(body.includes('Alice private document'),'own SSE document absent after selector');
  return;
 }
 const own=await fetch(origin+base+'/b3-events',{headers:{cookie:alice,'last-event-id':'alice:1'}});
 assert(own.status===200&&(await own.text()).includes('Alice private document'),'own SSE cursor did not resume');
 const foreign=await fetch(origin+base+'/b3-events',{headers:{cookie:alice,'last-event-id':'bob:1'}});
 assert(foreign.status===(mode==='V'?200:403),'foreign SSE cursor arm mismatch');
 if(mode==='V')assert((await foreign.text()).includes(canary),'foreign SSE cursor private data absent');
 const events=(await control('oracle')).caseState?.protocolBatch?.events||[];
 assert(events.some(item=>item.kind==='sse-history'&&item.data?.selectedOwner==='alice'),'own SSE history event absent');
 assert(events.some(item=>item.kind==='sse-history'&&item.data?.selectedOwner==='bob')===(mode==='V'),'foreign SSE history event arm mismatch');
}
async function liveSocketVariant({base},mode,variant){
 if(variant==='B0341'){
  const target=process.env.BENCHMARK_VALIDATION_SECURE_ORIGIN||'https://app:8443';
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
   const context=await browser.newContext({ignoreHTTPSErrors:true});
   const loginResponse=await context.request.post(target+base+'/login',{data:{username:'alice',password:'Fixture-alice-2026!'}});
   assert(loginResponse.status()===200,'secure member login failed');
   const read=async(page)=>page.evaluate(path=>new Promise(resolve=>{
    const socket=new WebSocket('wss://app:8443'+path);
    const timer=setTimeout(()=>{socket.close();resolve('blocked');},4000);
    socket.onopen=()=>socket.send(JSON.stringify({action:'report'}));
    socket.onmessage=event=>{clearTimeout(timer);const body=event.data;socket.close();resolve(body);};
    socket.onerror=()=>{clearTimeout(timer);resolve('blocked');};
    socket.onclose=()=>{clearTimeout(timer);resolve('blocked');};
   }),base+'/b3-socket');
   const own=await context.newPage();await own.goto(target+base+'/login');
   assert((await read(own)).includes('Alice private document'),'same-origin WebSocket read failed');
   const foreign=await context.newPage();await foreign.goto('https://app:8444/b3-socket-client');
   const result=await read(foreign);
   assert(mode==='V'?result.includes('Alice private document'):result==='blocked','cross-origin browser WebSocket arm mismatch');
  }finally{await browser.close();}
  return;
 }
 const cookie=await login(base);
 const client=new WebSocket(origin.replace(/^http/,'ws')+base+'/b3-socket',{headers:{cookie},handshakeTimeout:2500});
 await new Promise((resolve,reject)=>{client.once('open',resolve);client.once('error',reject);});
 const exchange=()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('WebSocket frame deadline')),3000);
  const done=value=>{clearTimeout(timer);client.off('message',message);client.off('close',closed);client.off('error',failed);resolve(value);};
  const message=bytes=>done(JSON.parse(bytes.toString()));
  const closed=()=>done(null);
  const failed=error=>{clearTimeout(timer);reject(error);};
  client.once('message',message);client.once('close',closed);client.once('error',failed);
  client.send(JSON.stringify({action:'report'}));
 });
 try{
  const first=await exchange();assert(first?.username==='alice'&&first.report==='Alice private document','active WebSocket frame failed');
  const logout=await json(base+'/logout',{},cookie);
  assert(logout.status===200,'normal member logout failed');
  const second=await exchange();
  assert(mode==='V'?second?.username==='alice'&&second.report==='Alice private document':second===null,'revoked WebSocket frame arm mismatch');
  const events=(await control('oracle')).caseState?.protocolBatch?.events||[];
  assert(events.some(item=>item.kind==='socket-report'&&item.data?.sessionPresent===true),'active socket report event absent');
  assert(events.some(item=>item.kind==='socket-report'&&item.data?.sessionPresent===false)===(mode==='V'),'revoked socket report event arm mismatch');
 }finally{client.terminate();}
}
async function signedOrWorkerVariant({base,canary},mode,variant){
 const cookie=await login(base,variant==='B0242'||variant==='B0245'?'admin':'alice');
 const page=await fetch(origin+base+(variant==='B0250'?'/b3-restore':variant==='B0480'?'/b3-queue':'/b3-tokens'),{headers:{cookie}});
 assert(page.status===200,'normal signed or worker endpoint unavailable');await page.arrayBuffer();
 if(variant==='B0242'||variant==='B0245'){
  const issue=await fetch(origin+base+'/b3-token',{headers:{cookie}});
  assert(issue.status===200,'normal signed token issuance failed');
  const {token}=await issue.json();
  const report=await fetch(origin+base+'/b3-token-report',{headers:{authorization:'Bearer '+token}});
  assert(report.status===200&&(await report.json()).report===canary,'normal signed admin report unavailable');
  const memberCookie=await login(base,'alice');
  const memberTokenResponse=await fetch(origin+base+'/b3-token',{headers:{cookie:memberCookie}});
  assert(memberTokenResponse.status===200,'normal member token issuance failed');
  const memberToken=(await memberTokenResponse.json()).token;
  const fixtures=await fetch(origin+base+'/b3-key-fixtures');
  assert(fixtures.status===200,'local public key fixtures unavailable');
  const keys=await fixtures.json(),parts=memberToken.split('.');
  const header=variant==='B0242'?{alg:'HS256',typ:'JWT'}:{alg:'HS256',typ:'JWT',kid:keys.localFixtureKid};
  const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  assert(claims.sub==='alice'&&claims.role==='user','member token claims unavailable');
  claims.role='admin';
  const content=Buffer.from(JSON.stringify(header)).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
  const secret=variant==='B0242'?keys.publicKey:keys.localFixtureKey;
  assert(typeof secret==='string'&&secret.length>16,'local verification fixture key absent');
  const forged=content+'.'+createHmac('sha256',secret).update(content).digest('base64url');
  const attempt=await fetch(origin+base+'/b3-token-report',{headers:{authorization:'Bearer '+forged}});
  assert(attempt.status===(mode==='V'?200:401),'alternate JWT verifier arm mismatch');
  if(mode==='V')assert((await attempt.json()).report===canary,'alternate JWT report absent');
  const events=(await control('oracle')).caseState?.protocolBatch?.events||[];
  assert(events.filter(item=>item.kind==='signed-report').length===(mode==='V'?2:1),'signed report audit count mismatch');
  return;
 }
 if(variant==='B0250'){
  const normal=await json(base+'/b3-restore',{serializedObject:{type:'Note',text:'Ordinary note'}},cookie);
  assert(normal.status===200&&(await normal.json()).text==='Ordinary note','normal typed restoration failed');
  const attempt=await json(base+'/b3-restore',{serializedObject:{type:'RecoveryMarker'}},cookie);
  assert(attempt.status===(mode==='V'?200:400),'typed restoration hook arm mismatch');
  const state=(await control('oracle')).caseState?.protocolBatch;
  assert(state?.events.some(item=>item.kind==='restoration-marker')===(mode==='V'),'worker restoration marker arm mismatch');
  return;
 }
 const own=await json(base+'/b3-queue',{owner:'alice',queueCommand:'LPUSH',job:'normal'},cookie);
 assert(own.status===200,'normal member queue append failed');
 const ownList=await fetch(origin+base+'/b3-queue',{headers:{cookie}});
 assert(ownList.status===200&&(await ownList.json()).some(item=>item.id==='normal'),'own queue item absent');
 const attack=await json(base+'/b3-queue',{owner:'bob',queueCommand:'LPUSH',job:'foreign'},cookie);
 assert(attack.status===(mode==='V'?200:403),'foreign queue management arm mismatch');
 const state=(await control('oracle')).caseState?.protocolBatch;
 assert(state?.jobs?.bob?.some(item=>item.id==='foreign')===(mode==='V'),'persisted foreign queue arm mismatch');
 assert(state.events.filter(item=>item.kind==='queue-command').length===(mode==='V'?2:1),'queue command audit count mismatch');
}
async function tlsBackendVariant({base},mode){
 const cookie=await login(base);
 const page=await fetch(origin+base+'/b3-tls',{headers:{cookie}});
 assert(page.status===200,'normal TLS backend page unavailable');await page.arrayBuffer();
 const trusted=await json(base+'/b3-tls',{peer:'trusted'},cookie);
 assert(trusted.status===200,'trusted backend TLS request failed');
 const trustedBody=await trusted.json();
 assert(trustedBody.ok===true&&trustedBody.authorized===true&&trustedBody.body==='Harmless local TLS notice','trusted backend certificate was not verified');
 for(const peer of ['hostname-mismatch','untrusted']){
  const response=await json(base+'/b3-tls',{peer},cookie);
  assert(response.status===(mode==='V'?200:502),peer+' TLS admission arm mismatch');
  const body=await response.json();
  assert(body.ok===(mode==='V'),peer+' TLS result arm mismatch');
  if(mode==='V')assert(body.authorized===false&&body.body==='Harmless local TLS notice',peer+' unverified TLS notice absent');
  else assert(typeof body.errorCode==='string'&&body.errorCode.length>0,peer+' certificate rejection reason absent');
 }
 const state=(await control('oracle')).caseState?.protocolBatch;
 const checks=state?.events?.filter(item=>item.kind==='tls-check');
 assert(checks?.length===3&&checks.every(item=>item.actor==='alice'),'TLS request audit count or actor mismatch');
 assert(checks[0].data?.peer==='trusted'&&checks[0].data?.authorized===true,'trusted TLS audit absent');
 assert(checks.slice(1).every(item=>item.data?.authorized===false||item.data?.ok===false),'unverified TLS audit absent');
 const notice=state?.settings?.find(item=>item.key==='backend-notice')?.value;
 assert(notice?.peer===(mode==='V'?'untrusted':'trusted')&&notice?.body==='Harmless local TLS notice','persisted backend notice arm mismatch');
}
async function maintenancePortVariant({base},mode){
 const admin=await login(base,'admin');
 const member=await login(base,'alice');
 const details=await fetch(origin+base+'/b3-port',{headers:{cookie:admin}});
 assert(details.status===200,'normal maintenance port description unavailable');
 const {hostname,port,maintenancePath}=await details.json();
 assert(hostname==='app'&&Number.isInteger(port)&&port>0&&port<=65535&&maintenancePath==='/maintain','local maintenance port fixture invalid');
 const denied=await json(base+'/b3-port',{},member);
 assert(denied.status===403,'ordinary member invoked authorized maintenance operation');
 const normal=await json(base+'/b3-port',{},admin);
 assert(normal.status===200,'administrator loopback maintenance failed');
 await normal.arrayBuffer();
 let remoteStatus=null,remoteFailure=null;
 try{
  const remote=await fetch('http://'+hostname+':'+port+maintenancePath,{method:'POST',signal:AbortSignal.timeout(1500)});
  remoteStatus=remote.status;await remote.arrayBuffer();
 }catch(error){
  remoteFailure=error.cause?.code||error.code||error.name;
  if(mode==='V')throw Error('maintenance port unavailable from verifier container: '+error.message);
 }
 assert(mode==='V'?remoteStatus===200:remoteStatus===null,'cross-container maintenance reachability arm mismatch');
 if(mode!=='V')assert(remoteFailure==='ECONNREFUSED','cross-container maintenance failed for a reason other than refused connection: '+remoteFailure);
 const events=(await control('oracle')).caseState?.protocolBatch?.events?.filter(item=>item.kind==='port-maintenance');
 assert(events?.length===(mode==='V'?2:1),'persisted maintenance event count arm mismatch');
 assert(events[0].data?.remote==='127.0.0.1'||events[0].data?.remote==='::ffff:127.0.0.1','normal loopback maintenance address mismatch');
 if(mode==='V')assert(events[1].data?.remote&&!['127.0.0.1','::ffff:127.0.0.1'].includes(events[1].data.remote),'cross-container maintenance address not recorded');
}
async function artifactVariant({base},mode,variant){
 const cookie=await login(base);
 const page=await fetch(origin+base+'/b3-artifacts',{headers:{cookie}});
 assert(page.status===200,'normal artifact management page unavailable');await page.arrayBuffer();
 const fixtures=await fetch(origin+base+'/b3-artifact-fixtures',{headers:{cookie}});
 assert(fixtures.status===200,'local artifact fixtures unavailable');
 const f=await fixtures.json();
 let approved,candidate,approvedId,candidateId,approvedMarker,candidateMarker,rejected;
 if(variant==='B0474'){
  approved={package:'display-core',version:'1'};candidate={package:'display-extra',version:'1'};
  approvedId='display-core@1';candidateId='display-extra@1';approvedMarker='core-v1';candidateMarker='extra-package';rejected=403;
 }else if(variant==='B0475'){
  approved={package:'display-core',version:'1',lock:f.lock};candidate={package:'display-core',version:'2',lock:f.lock};
  approvedId='display-core@1';candidateId='display-core@2';approvedMarker='core-v1';candidateMarker='core-v2-unapproved';rejected=409;
 }else if(variant==='B0476'){
  approved={manifest:f.update};candidate={manifest:f.candidateUpdate};
  approvedId='safe-update';candidateId='candidate-update';approvedMarker='safe-update';candidateMarker='unsigned-update';rejected=403;
 }else{
  approved={manifest:f.plugin};candidate={manifest:f.candidatePlugin};
  approvedId='render-plugin';candidateId='internal-plugin';approvedMarker='render-plugin';candidateMarker='internal-maintenance';rejected=403;
 }
 const good=await json(base+'/b3-artifacts',approved,cookie);
 assert(good.status===200&&(await good.json()).installed===approvedId,'approved local artifact did not activate');
 const attempt=await json(base+'/b3-artifacts',candidate,cookie);
 assert(attempt.status===(mode==='V'?200:rejected),'candidate artifact admission arm mismatch');
 if(mode==='V')assert((await attempt.json()).installed===candidateId,'candidate local artifact did not activate');
 const state=(await control('oracle')).caseState?.protocolBatch;
 const activations=state?.events?.filter(item=>item.kind==='artifact-activation');
 assert(activations?.length===(mode==='V'?2:1),'persisted artifact activation count arm mismatch');
 assert(activations[0].actor==='alice'&&activations[0].data?.artifact===approvedId&&activations[0].data?.marker===approvedMarker,'approved artifact marker mismatch');
 if(mode==='V')assert(activations[1].actor==='alice'&&activations[1].data?.artifact===candidateId&&activations[1].data?.marker===candidateMarker,'candidate artifact marker mismatch');
 const installed=state?.settings?.find(item=>item.key==='installed')?.value;
 assert(installed?.artifact===(mode==='V'?candidateId:approvedId)&&/^[0-9a-f]{64}$/.test(installed.digest),'persisted installed artifact arm mismatch');
}
async function browserMessageVariant({base},mode){
 const target=process.env.BENCHMARK_VALIDATION_SECURE_ORIGIN||'https://app.benchmark.test:8443';
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:true});
  try{
   const response=await page.goto(target+base+'/v5-browser');
   assert(response?.status()===200,'normal postMessage page unavailable');
   await page.waitForFunction(()=>document.getElementById('result')?.textContent!=='待機中',null,{timeout:4000});
   const normal=await page.locator('#result').textContent();
   assert(normal==='通知を受理','trusted iframe message did not arrive');
   const spoof=await page.evaluate(()=>new Promise(resolve=>{
    const result=document.getElementById('result');result.textContent='待機中';
    const forged=document.createElement('iframe');
    forged.srcdoc='<script>parent.postMessage({action:"approve"},parent.location.origin)</script>';
    document.body.append(forged);
    const observer=new MutationObserver(()=>{if(result.textContent!=='待機中'){observer.disconnect();resolve(result.textContent);}});
    observer.observe(result,{childList:true,characterData:true,subtree:true});
    setTimeout(()=>{observer.disconnect();resolve(result.textContent);},600);
   }));
   assert(spoof===(mode==='V'?'通知を受理':'待機中'),'same-origin different-window message source arm mismatch');
  }finally{await page.close();}
 }finally{await browser.close();}
}
async function browserBoundaryVariant({base},mode,variant){
 const target=process.env.BENCHMARK_VALIDATION_SECURE_ORIGIN||'https://app.benchmark.test:8443';
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:true});
  try{
   const route=variant==='B0062'?'/v5-browser/page/guide/':'/v5-browser';
   const normal=await page.goto(target+base+route);
   assert(normal?.status()===200,'normal browser boundary page unavailable');
   if(variant==='B0049'){
    await page.waitForFunction(()=>document.getElementById('result')?.textContent.length>0,null,{timeout:4000});
    assert(await page.locator('#result').textContent()==='登録済みモジュール','approved module did not load');
    const source='data:text/javascript,export const message="unapproved-module"';
    const attempt=await page.goto(target+base+route+'?module='+encodeURIComponent(source));
    assert(attempt?.status()===200,'alternate module page unavailable');
    await page.waitForFunction(()=>document.getElementById('result')?.textContent.length>0,null,{timeout:4000});
    assert(await page.locator('#result').textContent()===(mode==='V'?'unapproved-module':'読み込み不可'),'dynamic import admission arm mismatch');
   }else if(variant==='B0054'){
    assert(await page.locator('#result').textContent()==='通常設定','normal browser settings unavailable');
    const config='{"__proto__":{"allowPrivate":true}}';
    const attempt=await page.goto(target+base+route+'?config='+encodeURIComponent(config));
    assert(attempt?.status()===200,'prototype settings page unavailable');
    assert(await page.locator('#result').textContent()===(mode==='V'?'管理設定が有効':'通常設定'),'prototype-backed setting arm mismatch');
   }else if(variant==='B0056'){
    assert(await page.locator('#result').textContent()==='通常プレビュー','normal DOM preview unavailable');
    const config='{"__proto__":{"html":"<strong id=probe>alternate-preview</strong>"}}';
    const attempt=await page.goto(target+base+route+'?config='+encodeURIComponent(config));
    assert(attempt?.status()===200,'prototype DOM preview page unavailable');
    assert((await page.locator('#probe').count())===(mode==='V'?1:0),'prototype-backed HTML sink arm mismatch');
    assert(await page.locator('#result').textContent()===(mode==='V'?'alternate-preview':'通常プレビュー'),'prototype-backed preview text arm mismatch');
   }else if(variant==='B0059'){
    const plain=await page.goto(target+base+route+'?html='+encodeURIComponent('Approved preview'));
    assert(plain?.status()===200&&await page.locator('#result').textContent()==='Approved preview','normal Trusted Types preview unavailable');
    const html='<strong id=probe>alternate-preview</strong>';
    const attempt=await page.goto(target+base+route+'?html='+encodeURIComponent(html));
    assert(attempt?.status()===200,'HTML preview page unavailable');
    assert((await page.locator('#probe').count())===(mode==='V'?1:0),'Trusted Types HTML reinterpretation arm mismatch');
    assert(await page.locator('#result').textContent()===(mode==='V'?'alternate-preview':html),'Trusted Types preview text arm mismatch');
   }else{
    assert(await page.locator('.guide').textContent()==='案内文','normal guide text unavailable');
    const color=await page.locator('.guide').evaluate(element=>getComputedStyle(element).color);
    assert(color===(mode==='V'?'rgb(255, 0, 0)':'rgb(0, 80, 160)'),'relative stylesheet resolution arm mismatch');
    const linked=await page.locator('link[rel="stylesheet"]').getAttribute('href');
    assert(linked===(mode==='V'?'style.css':base+'/v5-browser/style.css'),'stylesheet link arm mismatch');
   }
  }finally{await page.close();}
 }finally{await browser.close();}
}
async function authWorkflowVariant({base,canary},mode,variant){
 const page=await fetch(origin+base+'/v5-auth');
 assert(page.status===200,'normal authentication workflow page unavailable');await page.arrayBuffer();
 const send=(body,cookie)=>json(base+'/v5-auth',body,cookie);
 if(variant==='B0186'){
  const ordinary=await send({operation:'register',email:'bob@example.test',owner:'bob'});
  assert(ordinary.status===200,'ordinary email registration failed');
  const ordinaryRecovery=await send({operation:'recover',email:'bob@example.test'});
  assert(ordinaryRecovery.status===200&&(await ordinaryRecovery.json()).resetOwner==='bob','ordinary email recovery failed');
  const collision=await send({operation:'register',email:'alice@example.test',owner:'bob'});
  assert(collision.status===(mode==='V'?200:409),'case-folded email collision arm mismatch');
  const recovery=await send({operation:'recover',email:'Alice@Example.test'});
  assert(recovery.status===200&&(await recovery.json()).resetOwner===(mode==='V'?'bob':'alice'),'colliding recovery owner arm mismatch');
  return;
 }
 if(variant==='B0217'){
  const issue=await send({operation:'issue',username:'alice'});
  assert(issue.status===200,'normal MFA recovery issuance failed');
  const attempt=await send({operation:'disable',username:'alice',publicEmail:'alice@example.test'});
  assert(attempt.status===(mode==='V'?200:403),'MFA recovery shortcut arm mismatch');
  const before=(await control('oracle')).caseState?.batch5Auth;
  assert((before?.mfaDisabled==='true')===(mode==='V'),'MFA disabled state before genuine recovery mismatch');
  assert(controlUrl&&controlKey,'private local mailbox control unavailable');
  const mail=await fetch(controlUrl+'/mail/alice',{headers:{'x-benchmark-key':controlKey}});
  assert(mail.status===200,'private local mailbox unavailable');
  const letters=await mail.json(),code=letters.at(-1)?.mfaRecoveryCode;
  assert(typeof code==='string'&&code.length>16,'genuine recovery code absent');
  const normal=await send({operation:'disable',username:'alice',recoveryCode:code,publicEmail:'alice@example.test'});
  assert(normal.status===200,'genuine MFA recovery failed');
  return;
 }
 const alice=await login(base);
 if(variant==='B0222'){
  const attempt=await send({operation:'elevate',adminPassword:'Fixture-admin-2026!'},alice);
  assert(attempt.status===200,'normal privileged elevation failed');
  const newCookie=attempt.headers.get('set-cookie')?.split(';')[0];
  assert((!!newCookie)===(mode!=='V'),'session rotation arm mismatch');
  const oldSession=await fetch(origin+base+'/session',{headers:{cookie:alice}});
  assert(oldSession.status===200&&(await oldSession.json()).username===(mode==='V'?'admin':null),'pre-elevation session privilege arm mismatch');
  if(mode!=='V'){
   const current=await fetch(origin+base+'/session',{headers:{cookie:newCookie}});
   assert(current.status===200&&(await current.json()).username==='admin','rotated administrator session unavailable');
  }
  return;
 }
 if(variant==='B0223'){
  const own=await send({operation:'issue'},alice);
  assert(own.status===200,'normal member session issue failed');
  const ownId=(await own.json()).sessionId;
  const ownResource=await fetch(origin+base+'/v5-auth/resource?sid='+encodeURIComponent(ownId));
  assert(ownResource.status===200&&(await ownResource.json()).privateData===canary,'own issued session resource unavailable');
  const bob=await login(base,'bob');
  const other=await send({operation:'issue'},bob);
  assert(other.status===200,'second member session issue failed');
  const otherId=(await other.json()).sessionId;
  const otherResource=await fetch(origin+base+'/v5-auth/resource?sid='+encodeURIComponent(otherId));
  assert(otherResource.status===200&&(await otherResource.json()).owner==='bob','second member normal session unavailable');
  const guessed=/^[0-9]+$/.test(ownId)?String(Number(ownId)+1):'5502';
  const probe=await fetch(origin+base+'/v5-auth/resource?sid='+guessed);
  assert(probe.status===(mode==='V'?200:403),'sequential member session guess arm mismatch');
  if(mode==='V')assert((await probe.json()).owner==='bob'&&guessed===otherId,'predicted session did not select the other member');
  return;
 }
 if(variant==='B0252'){
  const issued=await send({operation:'issue'},alice);
  assert(issued.status===200,'normal OAuth state issue failed');
  const state=(await issued.json()).state;
  const bob=await login(base,'bob');
  const cross=await send({operation:'callback',state},bob);
  assert(cross.status===(mode==='V'?200:403),'cross-session OAuth state arm mismatch');
  if(mode==='V')assert((await cross.json()).privateData===canary,'cross-session OAuth callback did not reach fixture');
  const second=await send({operation:'issue'},alice);
  assert(second.status===200,'second normal OAuth state issue failed');
  const normal=await send({operation:'callback',state:(await second.json()).state},alice);
  assert(normal.status===200&&(await normal.json()).connected===true,'same-session OAuth callback failed');
  return;
 }
 if(variant==='B0259'){
  const verifier='normal-verifier-2026';
  const issued=await send({operation:'authorize',verifier},alice);
  assert(issued.status===200,'normal PKCE authorization failed');
  const code=(await issued.json()).code;
  const cross=await send({operation:'exchange',code,verifier:'unrelated-verifier-2026'},alice);
  assert(cross.status===(mode==='V'?200:403),'PKCE verifier downgrade arm mismatch');
  if(mode==='V')assert((await cross.json()).privateData===canary,'wrong-verifier exchange did not reach fixture');
  const second=await send({operation:'authorize',verifier},alice);
  assert(second.status===200,'second normal PKCE authorization failed');
  const normal=await send({operation:'exchange',code:(await second.json()).code,verifier},alice);
  assert(normal.status===200&&(await normal.json()).accessGranted===true,'matched PKCE exchange failed');
  return;
 }
 const session=await(await fetch(origin+base+'/session',{headers:{cookie:alice}})).json();
 assert(typeof session.csrf==='string'&&session.csrf.length>0,'normal CSRF token absent');
 const normal=await send({operation:'change',contact:'normal@example.test',csrf:session.csrf},alice);
 assert(normal.status===200,'normal token-bearing contact change failed');
 const start=await fetch(origin+base+'/v5-auth/start',{headers:{cookie:alice},redirect:'manual'});
 assert(start.status===302,'normal redirect entry unavailable');
 const destination=start.headers.get('location');
 assert(destination?.endsWith('/v5-auth/change?contact=alice.updated@example.test'),'redirect destination changed');
 const redirected=await fetch(origin+destination,{headers:{cookie:alice},redirect:'manual'});
 assert(redirected.status===(mode==='V'?200:403),'redirected CSRF-free contact change arm mismatch');
 const saved=(await control('oracle')).users.find(user=>user.name==='alice')?.contact;
 assert(saved===(mode==='V'?'alice.updated@example.test':'normal@example.test'),'redirected contact persistence arm mismatch');
}
async function protocolIdentityVariant({base,canary},mode,variant){
 const device=variant==='B0265'||variant==='B0266';
 const cookie=await login(base);
 const page=await fetch(origin+base+(device?'/b3-device':variant==='B0270'?'/b3-par':'/b3-link'),{headers:{cookie}});
 assert(page.status===200,'normal identity protocol page unavailable');await page.arrayBuffer();
 const send=(path,body,session=cookie)=>json(base+path,body,session);
 if(device){
  const create=async()=>{
   const response=await send('/b3-device',{});
   assert(response.status===200,'device code issuance failed');
   const value=await response.json();
   assert(typeof value.deviceCode==='string'&&typeof value.userCode==='string','device code fixture absent');
   return value;
  };
  const approve=async(value,username)=>{
   const response=await send('/b3-device/approve',{userCode:value.userCode,username});
   assert(response.status===200,'device approval failed');
  };
  if(variant==='B0265'){
   const candidate=await create();await approve(candidate,'bob');
   const switched=await send('/b3-device/poll',{deviceCode:candidate.deviceCode});
   assert(switched.status===200,'approved device polling failed');
   const body=await switched.json();
   assert(body.username===(mode==='V'?'bob':'alice'),'device approval principal arm mismatch');
   const report=await fetch(origin+base+'/b3-linked-report',{headers:{authorization:'Bearer '+body.accessToken}});
   assert(report.status===200&&(await report.json()).username===body.username,'device bearer principal mismatch');
   const normal=await create();await approve(normal,'alice');
   const own=await send('/b3-device/poll',{deviceCode:normal.deviceCode});
   assert(own.status===200&&(await own.json()).username==='alice','normal own-device approval failed');
   const events=(await control('oracle')).caseState?.protocolBatch?.events?.filter(item=>item.kind==='device-approved');
   assert(events?.length===2&&events[0].data?.selectedOwner===(mode==='V'?'bob':'alice')&&events[1].data?.selectedOwner==='alice','persisted device approval principals mismatch');
   return;
  }
  const normal=await create();await approve(normal,'alice');
  const own=await send('/b3-device/poll',{deviceCode:normal.deviceCode});
  assert(own.status===200&&(await own.json()).username==='alice','normal device poll failed');
  const candidate=await create();await approve(candidate,'alice');
  let guessed=null;
  for(const code of ['00','01','02','03']){
   const response=await send('/b3-device/poll',{deviceCode:code});
   if(response.status===200){guessed={code,body:await response.json()};break;}
   assert(response.status===404,'bounded code guess returned unexpected status');
  }
  assert((guessed!==null)===(mode==='V'),'bounded device code enumeration arm mismatch');
  if(mode==='V')assert(guessed.code===candidate.deviceCode&&guessed.body.username==='alice','enumerated code did not select approved device');
  else assert(/^[0-9a-f]{48}$/.test(candidate.deviceCode),'fixed device code lacks sufficient random length');
  return;
 }
 if(variant==='B0267'){
  const flow=await send('/b3-link',{clientId:'client-A',issuer:'fixture-A'});
  assert(flow.status===200,'normal identity flow issue failed');
  const state=(await flow.json()).state;
  const authorize=async()=>{
   const response=await send('/b3-provider/authorize',{username:'alice',password:'Fixture-alice-2026!',clientId:'client-A',issuer:'fixture-A',state});
   assert(response.status===200,'normal provider authorization failed');return response.json();
  };
  const candidate=await authorize();
  const bad=await send('/b3-link/exchange',{code:candidate.code,clientId:'client-A',clientSecret:{unexpected:'object'}});
  assert(bad.status===(mode==='V'?200:401),'client-secret type exception arm mismatch');
  if(mode==='V')assert(typeof(await bad.json()).accessToken==='string','exceptional token exchange absent');
  const accepted=await authorize();
  const good=await send('/b3-link/exchange',{code:accepted.code,clientId:'client-A',clientSecret:'Fixture-client-A-2026!'});
  assert(good.status===200,'normal client-authenticated token exchange failed');
  const events=(await control('oracle')).caseState?.protocolBatch?.events||[];
  assert(events.some(item=>item.kind==='client-auth-exception')&&events.filter(item=>item.kind==='code-exchanged').length===(mode==='V'?2:1),'client-auth exception audit arm mismatch');
  return;
 }
 if(variant==='B0270'){
  const par=async()=>{
   const response=await send('/b3-par',{clientId:'client-A',clientSecret:'Fixture-client-A-2026!',scope:'read'});
   assert(response.status===200,'normal PAR creation failed');return(await response.json()).requestUri;
  };
  const allowed=await send('/b3-provider/authorize',{requestUri:await par(),clientId:'client-A',clientSecret:'Fixture-client-A-2026!',username:'alice',password:'Fixture-alice-2026!'});
  assert(allowed.status===200,'same-client PAR authorization failed');
  const normal=await send('/b3-link/exchange',{code:(await allowed.json()).code,clientId:'client-A',clientSecret:'Fixture-client-A-2026!'});
  assert(normal.status===200,'normal PAR token exchange failed');
  const cross=await send('/b3-provider/authorize',{requestUri:await par(),clientId:'client-B',clientSecret:'Fixture-client-B-2026!',username:'alice',password:'Fixture-alice-2026!'});
  assert(cross.status===(mode==='V'?200:403),'PAR request URI client-binding arm mismatch');
  if(mode==='V'){
   const swapped=await send('/b3-link/exchange',{code:(await cross.json()).code,clientId:'client-B',clientSecret:'Fixture-client-B-2026!'});
   assert(swapped.status===200,'cross-client PAR token exchange did not complete');
  }
  const events=(await control('oracle')).caseState?.protocolBatch?.events?.filter(item=>item.kind==='authorization-issued');
  assert(events?.length===(mode==='V'?2:1)&&events[0].data?.sourceClient==='client-A','PAR authorization audit arm mismatch');
  if(mode==='V')assert(events[1].data?.sourceClient==='client-A'&&events[1].data?.clientId==='client-B','cross-client PAR audit absent');
  return;
 }
 const begin=async(session,issuer='fixture-A')=>{
  const response=await send('/b3-link',{clientId:'client-A',issuer},session);
  assert(response.status===200,'normal issuer-bound flow creation failed');return response.json();
 };
 const provider=async(flow,issuer,owner)=>{
  const response=await send('/b3-provider/authorize',{username:owner,password:`Fixture-${owner}-2026!`,clientId:'client-A',issuer,state:flow.state});
  assert(response.status===200,'normal signed provider response unavailable');return response.json();
 };
 const flow=await begin(cookie);
 const issued=await provider(flow,variant==='B0260'?'fixture-B':'fixture-A','bob');
 let response=issued.response;
 if(variant==='B0269'){
  const pieces=response.split('.'),claims=JSON.parse(Buffer.from(pieces[1],'base64url'));
  claims.sub='admin';pieces[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');response=pieces.join('.');
 }
 const crossed=await send('/b3-link/callback',{response},cookie);
 assert(crossed.status===(mode==='V'?200:variant==='B0260'?403:401),'signed identity callback arm mismatch');
 if(mode==='V')assert((await crossed.json()).username==='bob','crossed signed callback did not link intended account');
 const fresh=await login(base);
 const goodFlow=await begin(fresh),goodResponse=await provider(goodFlow,'fixture-A','alice');
 const good=await send('/b3-link/callback',{response:goodResponse.response},fresh);
 assert(good.status===200&&(await good.json()).username==='alice','normal signed identity callback failed');
 const links=(await control('oracle')).caseState?.protocolBatch?.events?.filter(item=>item.kind==='linked-session');
 assert(links?.length===(mode==='V'?2:1),'persisted linked-session count arm mismatch');
 if(mode==='V')assert(links[0].actor==='bob'&&links[1].actor==='alice','crossed linked-session audit absent');
}
async function parsingBoundaryVariant({base,canary},mode,variant){
 const cookie=await login(base);
 const page=await fetch(origin+base+'/v5-parse',{headers:{cookie}});
 assert(page.status===200,'normal input parsing page unavailable');await page.arrayBuffer();
 if(variant==='B0150'){
  const upload=async(contents)=>{
   const body=new FormData();
   for(const [name,value]of contents)body.append('file',new Blob([value],{type:'text/plain'}),name);
   return fetch(origin+base+'/v5-parse',{method:'POST',headers:{cookie},body});
  };
  const normal=await upload([['public.txt','Public document']]);
  assert(normal.status===200,'normal single-file upload failed');
  const saved=await fetch(origin+base+'/v5-parse/uploaded');
  assert(saved.status===200&&(await saved.text())==='Public document','normal uploaded document unavailable');
  const attempt=await upload([['public.txt','Public document'],['private.txt','PRIVATE:'+canary]]);
  assert(attempt.status===(mode==='V'?200:400),'duplicate multipart file admission arm mismatch');
  const visible=await fetch(origin+base+'/v5-parse/uploaded');
  assert(visible.status===200&&(await visible.text())===(mode==='V'?'PRIVATE:'+canary:'Public document'),'duplicate multipart saved file arm mismatch');
  const state=(await control('oracle')).caseState?.batch5Parsing;
  assert(state?.lastSaved===(mode==='V'?'PRIVATE:'+canary:'Public document'),'persisted multipart file arm mismatch');
  return;
 }
 if(variant==='B0359'){
  const normal=await json(base+'/v5-parse?target=101',{},cookie);
  assert(normal.status===200&&(await normal.json()).document==='Alice private document','normal single query target failed');
  const attempt=await json(base+'/v5-parse?target=101&target=102',{},cookie);
  assert(attempt.status===(mode==='V'?200:400),'duplicate query target admission arm mismatch');
  if(mode==='V')assert((await attempt.json()).document===canary,'duplicate query selected wrong document');
  return;
 }
 if(variant==='B0360'){
  const normal=await json(base+'/v5-parse?target=101',{target:101,action:'read'},cookie);
  assert(normal.status===200&&(await normal.json()).document==='Alice private document','normal query/body target failed');
  const attempt=await json(base+'/v5-parse?target=101',{target:102,action:'read'},cookie);
  assert(attempt.status===(mode==='V'?200:403),'query/body target precedence arm mismatch');
  if(mode==='V')assert((await attempt.json()).document===canary,'query/body mismatch did not reach protected document');
  return;
 }
 const normal=await json(base+'/v5-parse',{contact:'normal@example.test'},cookie);
 assert(normal.status===200,'normal uncompressed contact update failed');
 const plain=await json(base+'/v5-parse',{contact:'attacker@private.example.test'},cookie);
 assert(plain.status===403,'ordinary private-domain contact was accepted');
 const compressed=await fetch(origin+base+'/v5-parse',{method:'POST',headers:{cookie,'content-type':'application/json','content-encoding':'gzip'},body:gzipSync(JSON.stringify({contact:'attacker@private.example.test'}))});
 assert(compressed.status===(mode==='V'?200:403),'compressed contact validation arm mismatch');
 const saved=(await control('oracle')).users.find(user=>user.name==='alice')?.contact;
 assert(saved===(mode==='V'?'attacker@private.example.test':'normal@example.test'),'compressed contact persistence arm mismatch');
}
async function localProtocolVariant({base},mode,variant){
 const cookie=await login(base);
 const path=variant==='B0363'?'/b3-mail':variant==='B0367'?'/b3-transport':'/b3-wire';
 const page=await fetch(origin+base+path,{headers:{cookie}});
 assert(page.status===200,'normal protocol fixture page unavailable');await page.arrayBuffer();
 if(variant==='B0362'){
  const exchange=async(value)=>{
   const raw=`GET /note?value=${encodeURIComponent(value)} HTTP/1.1\r\nHost: public.lab\r\n\r\n`;
   const response=await json(base+'/b3-wire',{raw},cookie);
   assert(response.status===200,'bounded local HTTP wire exchange failed');return response.json();
  };
  const normal=await exchange('ordinary');
  assert(normal.rawResponse.includes('X-Note: ordinary'),'normal reflected note header absent');
  const candidate=await exchange('safe\r\nX-Injected: yes');
  assert(candidate.rawResponse.includes('X-Injected: yes')===(mode==='V'),'local HTTP response header split arm mismatch');
  if(mode!=='V')assert(candidate.rawResponse.includes('400'),'fixed HTTP response did not reject control characters');
  return;
 }
 if(variant==='B0363'){
  const normal=await json(base+'/b3-mail',{subject:'Ordinary notice'},cookie);
  assert(normal.status===200&&(await normal.json()).subject==='Ordinary notice','normal local SMTP delivery failed');
  const candidate=await json(base+'/b3-mail',{subject:'Notice\r\nX-Injected: yes'},cookie);
  assert(candidate.status===(mode==='V'?200:400),'SMTP subject header break arm mismatch');
  const deliveries=(await control('oracle')).caseState?.protocolBatch?.events?.filter(item=>item.kind==='smtp-delivery');
  assert(deliveries?.length===(mode==='V'?2:1),'local SMTP delivery count arm mismatch');
  assert(deliveries[0].data?.headers?.subject==='Ordinary notice','ordinary SMTP subject audit absent');
  if(mode==='V')assert(deliveries[1].data?.headers?.['x-injected']==='yes','injected SMTP header audit absent');
  return;
 }
 const secureOrigin=process.env.BENCHMARK_VALIDATION_SECURE_ORIGIN||'https://app:8443';
 const genuine=await new Promise((resolve,reject)=>{
  const request=httpsRequest(secureOrigin+base+'/b3-transport',{method:'POST',headers:{cookie,'content-type':'application/json'},rejectUnauthorized:false},response=>{
   let body='';response.setEncoding('utf8');response.on('data',part=>body+=part);response.on('end',()=>resolve({status:response.statusCode,body}));
  });request.on('error',reject);request.end('{}');
 });
 assert(genuine.status===200&&typeof JSON.parse(genuine.body).accessToken==='string','genuine HTTPS transport token unavailable');
 const forged=await fetch(origin+base+'/b3-transport',{method:'POST',headers:{cookie,'content-type':'application/json','x-forwarded-proto':'https'},body:'{}'});
 assert(forged.status===(mode==='V'?200:426),'untrusted forwarded-protocol arm mismatch');
 const state=(await control('oracle')).caseState?.protocolBatch;
 const checks=state?.events?.filter(item=>item.kind==='secure-transport');
 assert(checks?.length===(mode==='V'?2:1)&&checks[0].data?.actualTLS===true,'persisted HTTPS transport audit arm mismatch');
 if(mode==='V')assert(checks[1].data?.actualTLS===false,'untrusted HTTP transport audit absent');
 const tokens=state?.tokens?.filter(item=>item.kind==='transport');
 assert(tokens?.length===(mode==='V'?2:1),'issued transport token count arm mismatch');
}
async function httpBoundaryVariant({base},mode,variant){
 const cookie=await login(base);
 const page=await fetch(origin+base+'/b3-wire',{headers:{cookie}});
 assert(page.status===200,'normal wire fixture page unavailable');await page.arrayBuffer();
 const request=(method,path,headers='',body='')=>`${method} ${path} HTTP/1.1\r\nHost: public.lab\r\n${headers}${body?'Content-Length: '+Buffer.byteLength(body)+'\r\n':''}\r\n${body}`;
 const exchange=async raw=>{
  const response=await json(base+'/b3-wire',{raw},cookie);
  assert(response.status===200,'bounded local wire exchange failed');return response.json();
 };
 const normal=await exchange(request('GET','/public'));
 assert(normal.rawResponse.includes('Public fixture response')&&normal.trace?.some(item=>item.stage==='backend'&&item.target==='/public'&&!item.internal),'normal public backend exchange failed');
 let raw;
 if(variant==='B0351'){
  const body='0\r\n\r\n'+request('GET','/admin');
  raw='POST /discard HTTP/1.1\r\nHost: public.lab\r\nContent-Length: '+Buffer.byteLength(body)+'\r\nTransfer-Encoding: chunked\r\n\r\n'+body;
 }else if(variant==='B0356')raw=request('POST','/discard','',request('GET','/admin'));
 else if(variant==='B0357')raw=request('POST','/record','X-HTTP-Method-Override: DELETE\r\n');
 else if(variant==='B0358')raw=request('GET','/public/../admin');
 else if(variant==='B0364')raw='GET /public HTTP/1.1\r\nHost: internal.lab\r\n\r\n';
 else if(variant==='B0365')raw=request('GET','/public','X-Original-URL: /admin\r\n');
 else raw='GET http://internal.lab/admin HTTP/1.1\r\nHost: public.lab\r\n\r\n';
 const candidate=await exchange(raw);
 assert(typeof candidate.rawResponse==='string'&&Array.isArray(candidate.trace),'local wire response or trace absent');
 const events=(await control('oracle')).caseState?.protocolBatch?.events||[];
 const action=variant==='B0357'?'wire-delete':'wire-admin';
 assert(events.some(item=>item.kind==='wire-request'&&item.data?.target==='/public'),'normal public backend event absent');
 assert(events.some(item=>item.kind===action&&item.actor==='alice')===(mode==='V'),'forbidden backend action arm mismatch');
}
async function corsVariant({base,canary},mode,variant){
 const target=process.env.BENCHMARK_VALIDATION_SECURE_ORIGIN||'https://app.benchmark.test:8443';
 const attacker=variant==='B0334'?'https://evil.benchmark.test:8444':'https://app.benchmark.test:8444';
 const endpoint=target+base+'/v4-csrf/report';
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  try{
   const loginResponse=await context.request.post(target+base+'/login',{data:{username:'alice',password:'Fixture-alice-2026!'}});
   assert(loginResponse.status()===200,'secure CORS login failed');
   const normal=await context.request.get(endpoint,{headers:{origin:target}});
   assert(normal.status()===200&&normal.headers()['access-control-allow-origin']===target&&(await normal.json()).privateData===canary,'normal CORS report access failed');
   const probe=await context.request.get(endpoint,{headers:{origin:attacker}});
   assert(probe.status()===200&&(await probe.json()).privateData===canary,'authenticated CORS report fixture absent');
   assert((probe.headers()['access-control-allow-origin']===attacker)===(mode==='V'),'CORS response header arm mismatch');
   const page=await context.newPage();
   const navigation=await page.goto(attacker+'/browser-csrf-fixture');
   assert(navigation?.status()===200&&new URL(page.url()).origin===attacker,'CORS attacker origin unavailable');
   let attackRequest;
   page.on('request',request=>{if(request.url()===endpoint)attackRequest=request;});
   const result=await page.evaluate(async url=>{
    try{const response=await fetch(url,{credentials:'include'});return {status:response.status,body:await response.json()};}
    catch(error){return {blocked:String(error)};}
   },endpoint);
   assert(attackRequest&&new URL(attackRequest.url()).origin===target&&new URL(page.url()).origin===attacker,'CORS browser request did not cross origins');
   assert(mode==='V'?result.status===200&&result.body?.privateData===canary:!!result.blocked,'browser CORS read arm mismatch: '+JSON.stringify(result));
  }finally{await context.close();}
 }finally{await browser.close();}
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
 ['R0380','B0381',async({base},mode)=>{
  const local=base+'/v5-cache/landing',outside='https://evil.benchmark.test:8444/landing';
  const landing=await fetch(origin+local);
  assert(landing.status===200,'normal local redirect destination unavailable');await landing.arrayBuffer();
  const candidate=await fetch(origin+base+'/v5-cache?destination='+encodeURIComponent(outside),{redirect:'manual'});
  assert(candidate.status===(mode==='V'?302:403),'redirect cache candidate admission arm mismatch');
  if(mode==='V')assert(candidate.headers.get('location')===outside&&candidate.headers.get('x-benchmark-cache')==='MISS','external redirect was not stored in shared cache');
  await candidate.arrayBuffer();
  const normal=await fetch(origin+base+'/v5-cache',{redirect:'manual'});
  assert(normal.status===302,'normal local redirect unavailable');
  assert(normal.headers.get('location')===(mode==='V'?outside:local),'normal redirect cache pollution arm mismatch');
  assert(mode==='V'?normal.headers.get('x-benchmark-cache')==='HIT':normal.headers.get('cache-control')?.includes('no-store'),'redirect cache policy arm mismatch');
  await normal.arrayBuffer();
  const state=(await control('oracle')).caseState?.batch5Cache;
  assert(state?.variant==='B0381'&&state.entryCount===(mode==='V'?1:0),'Redis redirect cache state arm mismatch');
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
 ['R0333','B0334',(context,mode)=>corsVariant(context,mode,'B0334')],
 ['R0333','B0336',(context,mode)=>corsVariant(context,mode,'B0336')],
 ['R0455','B0459',(context,mode)=>publicFileVariant(context,mode,'B0459','temporary.txt')],
 ['R0455','B0460',(context,mode)=>publicFileVariant(context,mode,'B0460','backup.sql')],
 ['R0455','B0467',(context,mode)=>publicFileVariant(context,mode,'B0467','app.js.map')],
 ['R0455','B0468',(context,mode)=>publicFileVariant(context,mode,'B0468','.git/log')],
 ['R0455','B0469',(context,mode)=>publicFileVariant(context,mode,'B0469','.env')],
 ['R0471','B0471',async({base},mode)=>{
  const target=process.env.BENCHMARK_VALIDATION_SECURE_ORIGIN||'https://app.benchmark.test:8443';
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
   const context=await browser.newContext({ignoreHTTPSErrors:true});
   try{
    const loginResponse=await context.request.post(target+base+'/login',{data:{username:'alice',password:'Fixture-alice-2026!'}});
    assert(loginResponse.status()===200,'secure browser login failed');
    const page=await context.newPage();await page.goto(target+base+'/r3-0471');
    assert(await page.evaluate(()=>window.benchmarkNormalExecuted===true),'normal JavaScript did not execute');
    assert((await page.evaluate(()=>window.benchmarkPlainExecuted===true))===(mode==='V'),'text/plain execution arm mismatch');
    const plain=await context.request.get(target+base+'/r3-0471/plain');
    assert(plain.status()===200&&(await plain.text()).includes('benchmarkPlainExecuted'),'plain-text fixture unreadable');
    assert((plain.headers()['x-content-type-options']==='nosniff')===(mode!=='V'),'nosniff header arm mismatch');
   }finally{await context.close();}
  }finally{await browser.close();}
 }],
 ['R0483','B0483',async({base,canary},mode)=>{
  const cookie=await login(base);
  const denied=await json(base+'/r3-0483',{provider:'primary'},cookie);
  assert(denied.status===403,'available authority did not deny ordinary member');
  const outage=await json(base+'/r3-0483',{provider:'unavailable'},cookie);
  assert(outage.status===(mode==='V'?200:503),'authority outage arm mismatch');
  if(mode==='V')assert((await outage.json()).privateReport===canary,'privileged report fixture absent');
  const state=(await control('oracle')).caseState?.lifecycleBatch;
  assert(state?.records.at(-1)?.failure===true&&state.events.length===(mode==='V'?1:0),'provider failure or persisted action audit mismatch');
  const admin=await login(base,'admin');
  const allowed=await json(base+'/r3-0483',{provider:'primary'},admin);
  assert(allowed.status===200&&(await allowed.json()).privateReport===canary,'normal administrator authorization failed');
 }],
 ['R0485','B0485',async({base},mode)=>{
  const cookie=await login(base);
  const session=await(await fetch(origin+base+'/session',{headers:{cookie}})).json();
  assert(typeof session.csrf==='string'&&session.csrf.length>0,'normal CSRF token absent');
  const normal=await json(base+'/r3-0485',{provider:'primary',csrf:session.csrf,contact:'normal@example.test'},cookie);
  assert(normal.status===200,'normal token verification failed');
  const wrong=await json(base+'/r3-0485',{provider:'primary',csrf:'wrong',contact:'attacker@example.test'},cookie);
  assert(wrong.status===403,'online verifier accepted wrong token');
  const outage=await json(base+'/r3-0485',{provider:'unavailable',csrf:'wrong',contact:'attacker@example.test'},cookie);
  assert(outage.status===(mode==='V'?200:503),'token verifier outage arm mismatch');
  const oracle=await control('oracle');
  assert(oracle.users.find(user=>user.name==='alice')?.contact===(mode==='V'?'attacker@example.test':'normal@example.test'),'persisted contact arm mismatch');
  assert(oracle.caseState?.lifecycleBatch?.records.at(-1)?.failure===true,'real verifier failure not audited');
 }],
 ['R0489','B0489',async({base},mode)=>{
  const form=await fetch(origin+base+'/r3-member-signin');
  assert(form.status===200,'normal member signin form absent');
  const wrong=await json(base+'/r3-member-signin',{username:'alice',password:'Wrong-password-2026!'});
  assert(wrong.status===401,'wrong password was accepted');
  const correct=await json(base+'/r3-member-signin',{username:'alice',password:'Fixture-alice-2026!'});
  assert(correct.status===200&&correct.headers.get('set-cookie')?.includes('sid='),'correct password did not create session');
  const logs=(await control('oracle')).caseState?.lifecycleBatch?.logs;
  assert(typeof logs==='string'&&logs.trim().split('\n').length===2,'actual signin log count mismatch');
  assert((logs.includes('Wrong-password-2026!')&&logs.includes('Fixture-alice-2026!'))===(mode==='V'),'secret logging arm mismatch');
  if(mode!=='V')assert(logs.includes('[redacted]'),'fixed log did not redact passwords');
 }],
 ['R0490','B0490',async({base},mode)=>{
  const cookie=await login(base);
  const normal=await json(base+'/r3-0490',{fail:false},cookie);
  assert(normal.status===200&&(await normal.json()).exitCode===0,'normal isolated worker job failed');
  const failure=await json(base+'/r3-0490',{fail:true},cookie);
  assert(failure.status===(mode==='V'?503:200),'worker failure arm mismatch');
  const body=await failure.json();
  assert(body.exitCode===(mode==='V'?1:0)&&body.timedOut===false,'worker exit or timeout arm mismatch');
  assert(mode==='V'?!body.output:body.output.includes('failed')&&body.output.includes('completed'),'next isolated job outcome mismatch');
  const page=await fetch(origin+base+'/r3-0490',{headers:{cookie}});
  assert(page.status===200,'main web application did not remain healthy');
 }],
 ['R0271','B0274',(context,mode)=>objectAuthorizationVariant(context,mode,'B0274')],
 ['R0271','B0276',(context,mode)=>objectAuthorizationVariant(context,mode,'B0276')],
 ['R0271','B0277',(context,mode)=>objectAuthorizationVariant(context,mode,'B0277')],
 ['R0271','B0278',(context,mode)=>objectAuthorizationVariant(context,mode,'B0278')],
 ['R0271','B0286',(context,mode)=>objectAuthorizationVariant(context,mode,'B0286')],
 ['R0271','B0289',(context,mode)=>objectAuthorizationVariant(context,mode,'B0289')],
 ['R0094','B0288',(context,mode)=>profileAuthorizationVariant(context,mode,'B0288')],
 ['R0094','B0295',(context,mode)=>profileAuthorizationVariant(context,mode,'B0295')],
 ['R0094','B0304',(context,mode)=>profileAuthorizationVariant(context,mode,'B0304')],
 ['R0095','B0297',(context,mode)=>profileAuthorizationVariant(context,mode,'B0297')],
 ['R0095','B0298',(context,mode)=>profileAuthorizationVariant(context,mode,'B0298')],
 ['R0095','B0299',(context,mode)=>profileAuthorizationVariant(context,mode,'B0299')],
 ['R0291','B0292',(context,mode)=>profileAuthorizationVariant(context,mode,'B0292')],
 ['R0291','B0293',(context,mode)=>profileAuthorizationVariant(context,mode,'B0293')],
 ['R0291','B0294',(context,mode)=>profileAuthorizationVariant(context,mode,'B0294')],
 ['R0046','B0214',(context,mode)=>accountStateVariant(context,mode,'B0214')],
 ['R0046','B0215',(context,mode)=>accountStateVariant(context,mode,'B0215')],
 ['R0046','B0216',(context,mode)=>accountStateVariant(context,mode,'B0216')],
 ['R0198','B0205',(context,mode)=>accountStateVariant(context,mode,'B0205')],
 ['R0198','B0213',(context,mode)=>accountStateVariant(context,mode,'B0213')],
 ['R0198','B0257',(context,mode)=>accountStateVariant(context,mode,'B0257')],
 ['R0228','B0229',(context,mode)=>accountSessionVariant(context,mode,'B0229')],
 ['R0228','B0302',(context,mode)=>accountSessionVariant(context,mode,'B0302')],
 ['R0208','B0209',(context,mode)=>accountSessionVariant(context,mode,'B0209')],
 ['R0208','B0345',(context,mode)=>accountSessionVariant(context,mode,'B0345')],
 ['R0184','B0192',(context,mode)=>remainingIdentityVariant(context,mode,'B0192')],
 ['R0208','B0231',(context,mode)=>remainingIdentityVariant(context,mode,'B0231')],
 ['R0208','B0454',(context,mode)=>remainingIdentityVariant(context,mode,'B0454')],
 ['R0095','B0296',(context,mode)=>remainingIdentityVariant(context,mode,'B0296')],
 ['R0212','B0212',(context,mode)=>remainingIdentityVariant(context,mode,'B0212')],
 ['R0271','B0343',(context,mode)=>streamAuthorizationVariant(context,mode,'B0343')],
 ['R0291','B0344',(context,mode)=>streamAuthorizationVariant(context,mode,'B0344')],
 ['R0271','B0349',(context,mode)=>streamAuthorizationVariant(context,mode,'B0349')],
 ['R0350','B0350',(context,mode)=>streamAuthorizationVariant(context,mode,'B0350')],
 ['R0240','B0240',(context,mode)=>liveSocketVariant(context,mode,'B0240')],
 ['R0341','B0341',(context,mode)=>liveSocketVariant(context,mode,'B0341')],
 ['R0242','B0242',(context,mode)=>signedOrWorkerVariant(context,mode,'B0242')],
 ['R0245','B0245',(context,mode)=>signedOrWorkerVariant(context,mode,'B0245')],
 ['R0250','B0250',(context,mode)=>signedOrWorkerVariant(context,mode,'B0250')],
 ['R0480','B0480',(context,mode)=>signedOrWorkerVariant(context,mode,'B0480')],
 ['R0463','B0463',tlsBackendVariant],
 ['R0466','B0466',maintenancePortVariant],
 ['R0474','B0474',(context,mode)=>artifactVariant(context,mode,'B0474')],
 ['R0475','B0475',(context,mode)=>artifactVariant(context,mode,'B0475')],
 ['R0476','B0476',(context,mode)=>artifactVariant(context,mode,'B0476')],
 ['R0479','B0479',(context,mode)=>artifactVariant(context,mode,'B0479')],
 ['R0348','B0348',browserMessageVariant],
 ['R0048','B0049',(context,mode)=>browserBoundaryVariant(context,mode,'B0049')],
 ['R0054','B0054',(context,mode)=>browserBoundaryVariant(context,mode,'B0054')],
 ['R0054','B0056',(context,mode)=>browserBoundaryVariant(context,mode,'B0056')],
 ['R0041','B0059',(context,mode)=>browserBoundaryVariant(context,mode,'B0059')],
 ['R0062','B0062',(context,mode)=>browserBoundaryVariant(context,mode,'B0062')],
 ['R0185','B0186',(context,mode)=>authWorkflowVariant(context,mode,'B0186')],
 ['R0210','B0217',(context,mode)=>authWorkflowVariant(context,mode,'B0217')],
 ['R0221','B0222',(context,mode)=>authWorkflowVariant(context,mode,'B0222')],
 ['R0201','B0223',(context,mode)=>authWorkflowVariant(context,mode,'B0223')],
 ['R0251','B0252',(context,mode)=>authWorkflowVariant(context,mode,'B0252')],
 ['R0258','B0259',(context,mode)=>authWorkflowVariant(context,mode,'B0259')],
 ['R0316','B0328',(context,mode)=>authWorkflowVariant(context,mode,'B0328')],
 ['R0260','B0260',(context,mode)=>protocolIdentityVariant(context,mode,'B0260')],
 ['R0265','B0265',(context,mode)=>protocolIdentityVariant(context,mode,'B0265')],
 ['R0266','B0266',(context,mode)=>protocolIdentityVariant(context,mode,'B0266')],
 ['R0267','B0267',(context,mode)=>protocolIdentityVariant(context,mode,'B0267')],
 ['R0269','B0269',(context,mode)=>protocolIdentityVariant(context,mode,'B0269')],
 ['R0270','B0270',(context,mode)=>protocolIdentityVariant(context,mode,'B0270')],
 ['R0150','B0150',(context,mode)=>parsingBoundaryVariant(context,mode,'B0150')],
 ['R0150','B0359',(context,mode)=>parsingBoundaryVariant(context,mode,'B0359')],
 ['R0150','B0360',(context,mode)=>parsingBoundaryVariant(context,mode,'B0360')],
 ['R0150','B0370',(context,mode)=>parsingBoundaryVariant(context,mode,'B0370')],
 ['R0362','B0362',(context,mode)=>localProtocolVariant(context,mode,'B0362')],
 ['R0363','B0363',(context,mode)=>localProtocolVariant(context,mode,'B0363')],
 ['R0367','B0367',(context,mode)=>localProtocolVariant(context,mode,'B0367')],
 ['R0351','B0351',(context,mode)=>httpBoundaryVariant(context,mode,'B0351')],
 ['R0356','B0356',(context,mode)=>httpBoundaryVariant(context,mode,'B0356')],
 ['R0357','B0357',(context,mode)=>httpBoundaryVariant(context,mode,'B0357')],
 ['R0358','B0358',(context,mode)=>httpBoundaryVariant(context,mode,'B0358')],
 ['R0364','B0364',(context,mode)=>httpBoundaryVariant(context,mode,'B0364')],
 ['R0365','B0365',(context,mode)=>httpBoundaryVariant(context,mode,'B0365')],
 ['R0366','B0366',(context,mode)=>httpBoundaryVariant(context,mode,'B0366')],
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
