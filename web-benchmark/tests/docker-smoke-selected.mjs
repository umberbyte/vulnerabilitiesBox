// Focused Docker smoke for selected Batch 05 boundaries. This is not the full
// V/F/N acceptance or a scanner measurement.
import {execFile} from 'node:child_process';
import {createHmac} from 'node:crypto';
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
