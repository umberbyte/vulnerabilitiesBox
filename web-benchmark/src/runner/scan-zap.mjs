import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {options,publicScope,entryPost,seedUrls,anonymousSchema,identityChangingExamples,validateTargetSurface,TargetSurfaceError,TARGET_ORIGIN,COLLECTOR_ORIGIN,COOKIE_HTTPS_ORIGIN,COOKIE_HTTP_ORIGIN,isActiveProfile,createLowScanPolicy,validateLowPolicySnapshot,lowPolicyDescription,activeScanParameters,cleanupLowScanPolicy} from './policy.mjs';
import {pendingState} from './drain.mjs';
import {authenticationPlan,establishAuthentication,AuthenticationError,rawRequest,messageFrom,requestHeader} from './auth.mjs';
import {configurationFingerprint,CONFIGURATION_NORMALIZATION} from './configuration.mjs';
import {correlateErrorCache} from './history-correlator.mjs';
import {captureRemainingMessages} from './history-pages.mjs';
import {hasEnabledBenchmarkScanScript} from './script-inventory.mjs';
import {runtimeSourceProof,compareRuntimeSourceProof} from '../reporting/source.mjs';

const settings=options(process.env);
const control=process.env.CONTROL_URL||'http://app:8099';
const zap=process.env.ZAP_URL||'http://zap:8090';
const controlKey=process.env.BENCHMARK_CONTROL_KEY;
const apiKey=process.env.ZAP_API_KEY;
if(!controlKey||!apiKey||controlKey===apiKey)throw new Error('Separate operator and scanner API keys are required.');
const runId='zap-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(3).toString('hex');
const output='/opt/benchmark/artifacts/'+runId;
await mkdir(output,{recursive:true});
const scanDelayMs=settings.concurrency>2?0:50;
const stopDrainLimitMs=90000;
const metadata={schema:'benchmark-scanner-run-0.2',runId,tool:'ZAP',image:process.env.ZAP_IMAGE,profile:settings.auth+'-'+settings.profile,startedAt:new Date().toISOString(),status:'starting',phase:'startup',targetOrigin:'https://app:8443',budgets:{wallSeconds:settings.seconds,requestedHttpRequests:settings.requests,requestedConcurrency:settings.concurrency,activeScanDelayMs:scanDelayMs,stopDrainLimitSeconds:stopDrainLimitMs/1000,requestCap:'observed every 500ms; stop requested at threshold; overshoot possible; not a hard cap',concurrencyCap:`spider and active-scan worker threads set to ${settings.concurrency} separately; no total server hard cap`},authReachability:{configuredAuthentication:settings.auth==='anonymous'?'none':settings.auth,subject:settings.auth==='anonymous'?null:settings.user,credentialsReplayed:false,identityVerified:false,protectedOperationVerified:false,protectedRoutes:'not assessed'},limitations:['Smoke run only; raw alert count is not TP/FP or vulnerability coverage.','HTTP counts cover all target public traffic during the measurement window; keep browsers and other scans idle.','No browser/AJAX crawler, role switching, multi-step workflow, OAST scoring, or Burp comparison.','No root, variant, V/F/N label, oracle or control key is supplied to ZAP.','Normal login/logout mutations are excluded from scanner replay; authentication is established separately with measured public HTTP.','Target runtime source proof covers src/ and package manifests only; it does not attest database, Redis, Mongo, LDAP, executor native binaries, or container image identity.'],errors:[],steps:[]};
if(settings.auth!=='anonymous')metadata.limitations.push('Experimental missing-header assistance: existing Cookie/Authorization mutations are preserved, but completely omitted authentication headers are supplied again; do not score omission attacks with this profile.','No automatic session or token refresh; identity and normal protected operation are checked at phase boundaries and after scanning.','Final authentication verification is measured after stop requests and may add one or two requests to the soft request budget.','Raw HTTP artifacts can contain fixture login credentials, session identifiers and JWTs; run metadata and stdout omit those secret values.');
if(settings.profile==='active-low') {
  metadata.activeScanPolicy={...lowPolicyDescription(),activeScanInvoked:false,cleanup:{required:false,removed:false}};
  metadata.limitations.push('active-low enables every installed active rule with explicit LOW attack strength and MEDIUM alert threshold, uniformly across cases; LOW can reduce requests and miss issues and is not a safety or complete-coverage guarantee.','A configured/enabled rule is not proof that it ran: dependencies, time/request budgets and discovery can limit execution.','The owned temporary policy is removed after its selected-policy snapshot and API/public-handler drain checks; cleanup failure fails the run and halts sequential execution.');
}
metadata.imageDigest=process.env.ZAP_IMAGE?.split('@')[1]||null;
metadata.controllerRuntime={platform:process.platform,architecture:process.arch};
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let deadline=Infinity,measurementStarted=false,reason=null,scope,scopes=[],observationScopes=[],authentication,manifest,lowPolicy,lowPolicySnapshotSaved=false;
const secrets=new Set([controlKey,apiKey]);
const onSecret=value=>{if(typeof value==='string'&&value)secrets.add(value);};
function safeMessage(value) {let result=String(value);for(const secret of secrets)result=result.replaceAll(secret,'[redacted]');return result;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function jsonRequest(url,{key,method='GET',body,timeout=5000}={}) {
  const response=await fetch(url,{method,headers:{...(key?{'x-benchmark-key':key}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error('HTTP '+response.status+' at '+new URL(url).pathname);
  return response.json();
}
const ctl=(path,body)=>jsonRequest(control+path,{key:controlKey,method:body?'POST':'GET',body});
async function api(component,kind,name,params={},timeout=5000) {
  const url=new URL(`/JSON/${component}/${kind}/${name}/`,zap);
  for(const [k,v]of Object.entries(params))url.searchParams.set(k,String(v));
  const response=await fetch(url,{headers:{'X-ZAP-API-Key':apiKey},signal:AbortSignal.timeout(timeout)});
  let value;try{value=await response.json();}catch{throw new Error(`ZAP ${component}/${name}: invalid API JSON`);}
  if(value.code){const error=new Error(`ZAP ${component}/${name}: ${value.code}`);error.zapCode=value.code;throw error;}
  if(!response.ok)throw new Error(`ZAP ${component}/${name}: HTTP ${response.status}`);
  return value;
}
async function optional(component,kind,name,params={}) {
  try {return await api(component,kind,name,params);}catch(error){metadata.errors.push({phase:metadata.phase,operation:component+'/'+name,message:safeMessage(error.message)});return null;}
}
async function snapshot() {const value=await ctl('/measurement');metadata.measurement=value;return value;}
async function guard() {
  if(reason)return false;
  if(Date.now()>=deadline){reason='wall_budget';return false;}
  const current=await snapshot();
  if(current.count>=settings.requests){reason='request_budget';return false;}
  return true;
}
async function waitScan(component,id) {
  let nextAuthCheck=Date.now()+5000;
  while(await guard()) {
    if(authentication&&settings.auth!=='anonymous'&&Date.now()>=nextAuthCheck){await authentication.verify();nextAuthCheck=Date.now()+5000;}
    const status=await api(component,'view','status',{scanId:id});
    if(Number(status.status)>=100)return true;
    await sleep(500);
  }
  return false;
}
async function excludeAuthOperations() {
  if(settings.auth==='anonymous')return;
  const paths=[manifest.login,manifest.logout,manifest.base+'/login',manifest.base+'/logout',manifest.base+'/signin',manifest.base+'/signout',manifest.base+'/connect',manifest.base+'/callback',manifest.base+'/idp/authorize'];
  metadata.authScopeExclusions=[];
  for(const path of [...new Set(paths.filter(Boolean))]) {
    if(!scope.isAllowed(path))continue;
    const regex='^'+new URL(path,scope.origin).href.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:/.*|\\?.*|$)';
    await api('context','action','excludeFromContext',{contextName:metadata.context,regex});
    await api('ascan','action','excludeFromScan',{regex});
    await api('spider','action','excludeFromScan',{regex});
    metadata.authScopeExclusions.push(path);
  }
}
async function verifyAuthentication() {if(authentication&&settings.auth!=='anonymous')await authentication.verify();}
async function access(url) {
  if(!scopes.some(item=>item.isAllowed(url)))throw new Error('Refused out-of-workspace seed.');
  return api('core','action','accessUrl',{url,followRedirects:false},Math.min(15000,Math.max(1000,deadline-Date.now())));
}
async function browserCookieTransport(plan) {
  const https=scopes.find(item=>item.origin===COOKIE_HTTPS_ORIGIN);
  const http=scopes.find(item=>item.origin===COOKIE_HTTP_ORIGIN);
  const observation=(manifest.requests||[]).find(item=>item.method==='GET'&&item.path.endsWith('/b2-cookie-observation'));
  if(!https||!http||!observation||!http.isAllowed(observation.path)||plan.cookieName!=='memberSession')
    throw new TargetSurfaceError('cookie_transport_contract_missing','The public cookie transport contract is incomplete.');
  if(!await guard())return;
  const {chromium}=await import('playwright-core');
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:{server:zap},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(scopes.some(item=>item.isAllowed(url)))return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    await page.goto(plan.login,{waitUntil:'load',timeout:20000});
    await page.locator('input[name=username]').fill(plan.credentials.username);
    await page.locator('input[name=password]').fill(plan.credentials.password);
    await Promise.all([page.waitForResponse(response=>response.url()===plan.login&&response.request().method()==='POST',{timeout:20000}),page.locator('form button').click()]);
    const login=JSON.parse(await page.locator('body').textContent());
    if(login.loggedIn!==true||login.username!==plan.subject)throw new TargetSurfaceError('cookie_browser_login_failed','Browser login did not establish the selected fixture identity.');
    const cookie=(await context.cookies(https.origin)).find(item=>item.name===plan.cookieName);
    if(!cookie||!/^[a-f0-9]{48}$/.test(cookie.value))throw new TargetSurfaceError('cookie_browser_session_missing','Browser did not store the dedicated fixture session cookie.');
    onSecret(cookie.value);onSecret(plan.cookieName+'='+cookie.value);
    const before=await page.goto(plan.session,{waitUntil:'load',timeout:20000});
    if(before?.status()!==200||JSON.parse(await page.locator('body').textContent()).username!==plan.subject)
      throw new TargetSurfaceError('cookie_browser_identity_failed','Browser did not reach the HTTPS account with its fixture cookie.');
    const observationUrl=new URL(observation.path,http.origin).href;
    const observed=await page.goto(observationUrl,{waitUntil:'load',timeout:20000});
    const after=await page.goto(plan.session,{waitUntil:'load',timeout:20000});
    if(after?.status()!==200||JSON.parse(await page.locator('body').textContent()).username!==plan.subject)
      throw new TargetSurfaceError('cookie_browser_identity_lost','HTTPS browser identity was lost after the HTTP observation.');
    let recorded;
    for(let attempt=0;attempt<10;attempt++) {
      const history=await api('core','view','messages',{baseurl:http.prefix,start:0,count:100});
      recorded=(history.messages||[]).find(message=>message.requestHeader?.startsWith('GET '+observationUrl+' HTTP/'));
      if(recorded)break;
      await sleep(250);
    }
    if(!recorded)throw new TargetSurfaceError('cookie_browser_http_not_recorded','The browser HTTP observation was absent from ZAP history.');
    const sent=requestHeader(recorded,'Cookie')||'';
    const member=sent.split(';').map(value=>value.trim()).find(value=>value.startsWith(plan.cookieName+'='));
    if(Boolean(member)!==!cookie.secure||(member&&member!==plan.cookieName+'='+cookie.value))
      throw new TargetSurfaceError('cookie_browser_http_mismatch','The ZAP HTTP request did not match the real browser cookie attribute.');
    const status=Number(/^HTTP\/\S+\s+(\d+)/.exec(recorded.responseHeader)?.[1]);
    if(status!==observed?.status())throw new TargetSurfaceError('cookie_browser_status_mismatch','The ZAP HTTP response differed from the browser result.');
    metadata.browserCookieTransport={browser:'Chromium via ZAP proxy',loginStatus:200,httpsAccountBefore:before.status(),httpsAccountAfter:after.status(),cookieSecure:cookie.secure,httpCookieSent:Boolean(member),httpObservationStatus:status,httpMessageId:recorded.id||null};
    metadata.steps.push({type:'browser-cookie-http-observation',url:observationUrl,status,messageId:recorded.id||null});
    metadata.targetSurface.verified=true;
  } finally {if(browser)await browser.close();}
}
async function browserEventCollector(plan) {
  const eventRoute=scope.entry.endsWith('/login-analytics')?'analytics':'error';
  const endpoint=COLLECTOR_ORIGIN+'/collect-events';
  const browserCredentials=eventRoute==='analytics'?manifest.credentials:plan.credentials;
  const browserSubject=browserCredentials?.username;
  if(observationScopes.length!==1||observationScopes[0].prefix!==endpoint)
    throw new TargetSurfaceError('collector_contract_missing','The declared local collector endpoint is unavailable.');
  if(!await guard())return;
  const {chromium}=await import('playwright-core');
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:{server:zap},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(scopes.some(item=>item.isAllowed(url))||url===endpoint)return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    if(eventRoute==='analytics') {
      const opened=await page.goto(scope.entry,{waitUntil:'load',timeout:20000});
      if(opened?.status()!==200)throw new TargetSurfaceError('collector_entry_unreachable','The login analytics page was not reachable.');
      await page.locator('#analytics-login input[name=username]').fill(browserCredentials.username);
      await page.locator('#analytics-login input[name=password]').fill(browserCredentials.password);
      const event=page.waitForResponse(response=>response.url()===endpoint&&response.request().method()==='POST',{timeout:20000});
      const login=page.waitForResponse(response=>response.url()===new URL(manifest.login,scope.origin).href&&response.request().method()==='POST',{timeout:20000});
      await page.locator('#analytics-login button').click();
      if((await login).status()!==200||(await event).status()!==202)throw new TargetSurfaceError('collector_normal_operation_failed','The normal login or collector event failed.');
      await page.waitForFunction(()=>window.analyticsComplete===true,null,{timeout:10000});
    } else {
      await page.goto(new URL(manifest.login,scope.origin).href,{waitUntil:'load',timeout:20000});
      await page.locator('input[name=username]').fill(plan.credentials.username);
      await page.locator('input[name=password]').fill(plan.credentials.password);
      const login=page.waitForResponse(response=>response.url()===new URL(manifest.login,scope.origin).href&&response.request().method()==='POST',{timeout:20000});
      await page.locator('form button').click();
      if((await login).status()!==200)throw new TargetSurfaceError('collector_browser_login_failed','The browser fixture login failed.');
      const opened=await page.goto(scope.entry,{waitUntil:'load',timeout:20000});
      if(opened?.status()!==200)throw new TargetSurfaceError('collector_entry_unreachable','The authenticated error reporting page was not reachable.');
      const normal=page.waitForResponse(response=>response.url()===scope.entry&&response.request().method()==='POST',{timeout:20000});
      await page.locator('#load').click();
      if((await normal).status()!==200)throw new TargetSurfaceError('collector_normal_operation_failed','The normal document read failed.');
      await page.locator('#document').fill('{');
      const event=page.waitForResponse(response=>response.url()===endpoint&&response.request().method()==='POST',{timeout:20000});
      const invalid=page.waitForResponse(response=>response.url()===scope.entry&&response.request().method()==='POST'&&response.status()===400,{timeout:20000});
      await page.locator('#load').click();
      await invalid;
      if((await event).status()!==202)throw new TargetSurfaceError('collector_event_failed','The local error collector did not accept the event.');
      await page.waitForFunction(()=>window.errorEventComplete===true,null,{timeout:10000});
    }
    const session=await page.goto(new URL(manifest.base+'/session',scope.origin).href,{waitUntil:'load',timeout:20000});
    if(session?.status()!==200||JSON.parse(await page.locator('body').textContent()).username!==browserSubject)
      throw new TargetSurfaceError('collector_browser_identity_failed','The browser operation did not retain the selected fixture identity.');
    let recorded;
    for(let attempt=0;attempt<10;attempt++) {
      const history=await api('core','view','messages',{baseurl:endpoint,start:0,count:100});
      recorded=(history.messages||[]).find(message=>message.requestHeader?.startsWith('POST '+endpoint+' HTTP/'));
      if(recorded)break;
      await sleep(250);
    }
    let body;
    try{body=JSON.parse(recorded?.requestBody||'');}catch{}
    const status=Number(/^HTTP\/\S+\s+(\d+)/.exec(recorded?.responseHeader)?.[1]);
    if(!recorded?.id||status!==202||body?.kind!==eventRoute||!body.event||typeof body.event!=='object')
      throw new TargetSurfaceError('collector_zap_history_missing','The browser collector POST and response were not preserved in ZAP history.');
    metadata.browserEventCollector={browser:'Chromium via ZAP proxy',origin:COLLECTOR_ORIGIN,path:'/collect-events',eventKind:eventRoute,postStatus:status,messageId:recorded.id,normalOperationVerified:true,identityVerified:true};
    metadata.steps.push({type:'browser-collector-event',url:endpoint,status,messageId:recorded.id});
    metadata.targetSurface.verified=true;
  } finally {if(browser)await browser.close();}
}
async function browserLibraryIntegrity(plan) {
  const endpoint=COLLECTOR_ORIGIN+'/b2-library.js';
  const fixture=new URL(manifest.base+'/b2-library-fixture',scope.origin).href;
  if(observationScopes.length!==1||observationScopes[0].prefix!==endpoint||!scope.isAllowed(fixture))
    throw new TargetSurfaceError('library_contract_missing','The declared local library source or fixture operation is unavailable.');
  if(!await guard())return;
  const {chromium}=await import('playwright-core');
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:{server:zap},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(scopes.some(item=>item.isAllowed(url))||url===endpoint)return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    await page.goto(plan.login,{waitUntil:'load',timeout:20000});
    await page.locator('input[name=username]').fill(plan.credentials.username);
    await page.locator('input[name=password]').fill(plan.credentials.password);
    const login=page.waitForResponse(response=>response.url()===plan.login&&response.request().method()==='POST',{timeout:20000});
    await page.locator('form button').click();
    if((await login).status()!==200)throw new TargetSurfaceError('library_browser_login_failed','The browser fixture login failed.');
    const session=await page.goto(plan.session,{waitUntil:'load',timeout:20000});
    if(session?.status()!==200||JSON.parse(await page.locator('body').textContent()).username!==plan.subject)
      throw new TargetSurfaceError('library_browser_identity_failed','The browser did not retain the selected fixture identity.');
    const originalScript=page.waitForResponse(response=>response.url()===endpoint&&response.request().method()==='GET',{timeout:20000});
    const normal=await page.goto(scope.entry,{waitUntil:'load',timeout:20000});
    if(normal?.status()!==200||(await originalScript).status()!==200||await page.evaluate(()=>document.body.dataset.libraryLoaded)!=='yes')
      throw new TargetSurfaceError('library_normal_operation_failed','The normal cross-origin library did not execute.');
    const source=await page.evaluate(async url=>{const response=await fetch(url);return {status:response.status,body:await response.json()};},fixture);
    if(source.status!==200||typeof source.body?.source!=='string'||!source.body.source)
      throw new TargetSurfaceError('library_fixture_unavailable','The normal library source was not readable by the fixture subject.');
    const replacement=source.body.source+'document.body.dataset.libraryTampered="yes";';
    const updated=await page.evaluate(async ({url,source})=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source})});return {status:response.status,body:await response.json()};},{url:fixture,source:replacement});
    if(updated.status!==200||updated.body?.stored!==true)throw new TargetSurfaceError('library_fixture_update_failed','The normal library distribution update failed.');
    const changedScript=page.waitForResponse(response=>response.url()===endpoint&&response.request().method()==='GET',{timeout:20000});
    const changed=await page.goto(scope.entry,{waitUntil:'load',timeout:20000});
    if(changed?.status()!==200||(await changedScript).status()!==200)
      throw new TargetSurfaceError('library_tampered_response_missing','The modified local library response was not fetched by the browser.');
    const tamperedExecuted=await page.evaluate(()=>document.body.dataset.libraryTampered==='yes');
    let recorded=[];
    for(let attempt=0;attempt<10;attempt++) {
      const history=await api('core','view','messages',{baseurl:endpoint,start:0,count:100});
      recorded=(history.messages||[]).filter(message=>message.requestHeader?.startsWith('GET '+endpoint+' HTTP/'));
      if(recorded.length>=2)break;
      await sleep(250);
    }
    const last=recorded.at(-1);
    const status=Number(/^HTTP\/\S+\s+(\d+)/.exec(last?.responseHeader)?.[1]);
    if(recorded.length<2||!last?.id||status!==200||last.responseBody!==replacement)
      throw new TargetSurfaceError('library_zap_history_missing','The normal and modified library responses were not preserved in ZAP history.');
    metadata.browserLibraryIntegrity={browser:'Chromium via ZAP proxy',origin:COLLECTOR_ORIGIN,path:'/b2-library.js',normalLibraryLoaded:true,modifiedResponseStatus:status,modifiedResponseMessageId:last.id,tamperedScriptExecuted:tamperedExecuted,identityVerified:true};
    metadata.steps.push({type:'browser-library-integrity',url:endpoint,status,messageId:last.id});
    metadata.targetSurface.verified=true;
  } finally {if(browser)await browser.close();}
}
async function browserResourceSwitch() {
  const endpoint=COLLECTOR_ORIGIN+'/b2-resource.js';
  if(observationScopes.length!==1||observationScopes[0].prefix!==endpoint)
    throw new TargetSurfaceError('resource_contract_missing','The declared local script source is unavailable.');
  if(!await guard())return;
  const {chromium}=await import('playwright-core');
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:{server:zap},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(scopes.some(item=>item.isAllowed(url))||url===endpoint)return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    const normal=await page.goto(scope.entry,{waitUntil:'load',timeout:20000});
    if(normal?.status()!==200)throw new TargetSurfaceError('resource_entry_unreachable','The normal resource page was not reachable.');
    await page.waitForFunction(()=>document.body.dataset.standardLoaded==='yes',null,{timeout:10000});
    const diagnostic=new URL(scope.entry);
    if(diagnostic.pathname===manifest.base+'/b2-resource')diagnostic.searchParams.set('scriptUrl',endpoint);
    else diagnostic.searchParams.set('namedElement',`<a id="resourceConfig" href="${endpoint}">Guide</a>`);
    const changed=await page.goto(diagnostic.href,{waitUntil:'load',timeout:20000});
    if(changed?.status()!==200)throw new TargetSurfaceError('resource_diagnostic_unreachable','The public resource selection page was not reachable.');
    await page.waitForFunction(()=>document.body.dataset.standardLoaded==='yes'||document.body.dataset.foreignExecuted==='yes',null,{timeout:10000});
    const observation=await page.evaluate(()=>({standardLoaded:document.body.dataset.standardLoaded==='yes',foreignExecuted:document.body.dataset.foreignExecuted==='yes'}));
    let recorded=[];
    for(let attempt=0;attempt<10;attempt++) {
      const history=await api('core','view','messages',{baseurl:endpoint,start:0,count:100});
      recorded=(history.messages||[]).filter(message=>message.requestHeader?.startsWith('GET '+endpoint+' HTTP/'));
      if(recorded.length||!observation.foreignExecuted)break;
      await sleep(250);
    }
    const foreign=recorded.at(-1);
    const status=Number(/^HTTP\/\S+\s+(\d+)/.exec(foreign?.responseHeader)?.[1]);
    if(observation.foreignExecuted?(!foreign?.id||status!==200):recorded.length>0)
      throw new TargetSurfaceError('resource_zap_history_mismatch','The browser script result did not match the saved auxiliary ZAP history.');
    metadata.browserResourceSwitch={browser:'Chromium via ZAP proxy',origin:COLLECTOR_ORIGIN,path:'/b2-resource.js',normalSameOriginScriptLoaded:true,standardScriptLoadedAfterSelection:observation.standardLoaded,foreignScriptExecuted:observation.foreignExecuted,foreignResponseMessageId:foreign?.id||null,foreignResponseStatus:foreign?status:null};
    metadata.steps.push({type:'browser-resource-switch',url:diagnostic.href,foreignResponseMessageId:foreign?.id||null});
    metadata.targetSurface.verified=true;
  } finally {if(browser)await browser.close();}
}
async function browserJsonpCsp() {
  const endpoint=COLLECTOR_ORIGIN+'/b2-jsonp';
  if(observationScopes.length!==1||observationScopes[0].prefix!==endpoint)
    throw new TargetSurfaceError('jsonp_contract_missing','The declared local JSONP source is unavailable.');
  if(!await guard())return;
  const {chromium}=await import('playwright-core');
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:{server:zap},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(scopes.some(item=>item.isAllowed(url))||new URL(url).origin===COLLECTOR_ORIGIN&&new URL(url).pathname==='/b2-jsonp')return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    const normal=await page.goto(scope.entry,{waitUntil:'load',timeout:20000});
    if(normal?.status()!==200)throw new TargetSurfaceError('jsonp_entry_unreachable','The normal JSONP page was not reachable.');
    await page.waitForFunction(()=>document.querySelector('#notice')?.textContent==='Welcome partner',null,{timeout:10000});
    const normalNotice=await page.locator('#notice').textContent();
    const callback='(()=>{document.body.dataset.executed="yes"})';
    const diagnostic=new URL(scope.entry);
    diagnostic.searchParams.set('jsonp',callback);
    const changed=await page.goto(diagnostic.href,{waitUntil:'load',timeout:20000});
    if(changed?.status()!==200)throw new TargetSurfaceError('jsonp_diagnostic_unreachable','The public JSONP diagnostic page was not reachable.');
    await page.waitForFunction(()=>document.querySelector('#notice')?.textContent==='Welcome partner'||document.body.dataset.executed==='yes',null,{timeout:10000});
    const observation=await page.evaluate(()=>({notice:document.querySelector('#notice')?.textContent,callbackExecuted:document.body.dataset.executed==='yes'}));
    const expectedUrl=endpoint+'?callback='+encodeURIComponent(callback);
    let recorded=[];
    for(let attempt=0;attempt<10;attempt++) {
      const history=await api('core','view','messages',{baseurl:endpoint,start:0,count:100});
      recorded=(history.messages||[]).filter(message=>message.requestHeader?.startsWith('GET '+endpoint+'?callback='));
      if(recorded.some(message=>message.requestHeader?.startsWith('GET '+expectedUrl+' HTTP/'))||!observation.callbackExecuted)break;
      await sleep(250);
    }
    const diagnosticResponse=recorded.find(message=>message.requestHeader?.startsWith('GET '+expectedUrl+' HTTP/'));
    const status=Number(/^HTTP\/\S+\s+(\d+)/.exec(diagnosticResponse?.responseHeader)?.[1]);
    if(observation.callbackExecuted?(!diagnosticResponse?.id||status!==200):recorded.length>0)
      throw new TargetSurfaceError('jsonp_zap_history_mismatch','The browser JSONP result did not match the saved auxiliary ZAP history.');
    metadata.browserJsonpCsp={browser:'Chromium via ZAP proxy',origin:COLLECTOR_ORIGIN,path:'/b2-jsonp',normalNoticeRendered:normalNotice==='Welcome partner',diagnosticNoticeRendered:observation.notice==='Welcome partner',callbackExecuted:observation.callbackExecuted,diagnosticResponseMessageId:diagnosticResponse?.id||null,diagnosticResponseStatus:diagnosticResponse?status:null};
    metadata.steps.push({type:'browser-jsonp-csp',url:diagnostic.href,diagnosticResponseMessageId:diagnosticResponse?.id||null});
    metadata.targetSurface.verified=true;
  } finally {if(browser)await browser.close();}
}
async function browserExternalWindow() {
  const endpoint=COLLECTOR_ORIGIN+'/b2-linked-screen';
  if(observationScopes.length!==1||observationScopes[0].prefix!==endpoint)
    throw new TargetSurfaceError('external_window_contract_missing','The declared local linked screen is unavailable.');
  if(!await guard())return;
  const {chromium}=await import('playwright-core');
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:{server:zap},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    await context.route('**/*',route=>{
      const url=route.request().url(),parsed=new URL(url);
      if(scopes.some(item=>item.isAllowed(url))||parsed.origin===COLLECTOR_ORIGIN&&parsed.pathname==='/b2-linked-screen')return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    const source=await page.goto(scope.entry,{waitUntil:'load',timeout:20000});
    if(source?.status()!==200)throw new TargetSurfaceError('external_window_entry_unreachable','The normal external link page was not reachable.');
    const original=page.url();
    const opened=page.waitForEvent('popup',{timeout:20000});
    await page.locator('#external').click();
    const popup=await opened;
    await popup.waitForLoadState('load',{timeout:20000});
    const popupUrl=new URL(popup.url());
    if(popupUrl.origin!==COLLECTOR_ORIGIN||popupUrl.pathname!=='/b2-linked-screen'||await popup.locator('#related').count()!==1)
      throw new TargetSurfaceError('external_window_popup_missing','The normal local auxiliary screen did not open.');
    const openerPresent=await popup.evaluate(()=>opener!==null);
    await popup.locator('#replace-parent').click();
    if(openerPresent)await page.waitForURL(url=>url.pathname===manifest.base+'/b2-link-home',{timeout:10000});
    else await page.waitForTimeout(250);
    const parentNavigated=await page.locator('#linked-login').count()===1;
    if(parentNavigated!==openerPresent||!openerPresent&&page.url()!==original)
      throw new TargetSurfaceError('external_window_navigation_mismatch','The opener and source page navigation did not match.');
    let recorded;
    for(let attempt=0;attempt<10;attempt++) {
      const history=await api('core','view','messages',{baseurl:endpoint,start:0,count:100});
      recorded=(history.messages||[]).find(message=>message.requestHeader?.startsWith('GET '+popupUrl.href+' HTTP/'));
      if(recorded)break;
      await sleep(250);
    }
    const status=Number(/^HTTP\/\S+\s+(\d+)/.exec(recorded?.responseHeader)?.[1]);
    if(!recorded?.id||status!==200)throw new TargetSurfaceError('external_window_zap_history_missing','The auxiliary popup response was not preserved in ZAP history.');
    metadata.browserExternalWindow={browser:'Chromium via ZAP proxy',origin:COLLECTOR_ORIGIN,path:'/b2-linked-screen',popupResponseMessageId:recorded.id,popupResponseStatus:status,openerPresent,parentNavigated};
    metadata.steps.push({type:'browser-external-window',url:popupUrl.href,popupResponseMessageId:recorded.id});
    metadata.targetSurface.verified=true;
  } finally {if(browser)await browser.close();}
}
function measuredMessage(value,name,method,url) {
  const message=messageFrom(value,name);
  const request=new RegExp('^'+method+' (\\S+) HTTP/\\S+','i').exec(message.requestHeader);
  if(request?.[1]!==url)throw new TargetSurfaceError('target_origin_not_reached','ZAP did not send the expected local public request.');
  return {url,status:message.status,messageId:message.id||null};
}
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
async function configure() {
  const context='benchmark-'+runId;
  metadata.context=context;
  const result=await api('context','action','newContext',{contextName:context});metadata.contextId=result.contextId;
  for(const item of scopes)await api('context','action','includeInContext',{contextName:context,regex:item.regex});
  for(const item of observationScopes)await api('context','action','includeInContext',{contextName:context,regex:item.regex});
  await api('context','action','setContextInScope',{contextName:context,booleanInScope:true});
  await api('core','action','setMode',{mode:'protect'});
  const proxyAllowed=[...scopes.map(item=>escapeRegex(item.origin)+'(?:/|$)'),...observationScopes.map(item=>escapeRegex(item.prefix)+'(?:\\?.*|$)')];
  await api('core','action','excludeFromProxy',{regex:'^(?!(?:'+proxyAllowed.join('|')+')).*'});
  await api('pscan','action','setScanOnlyInScope',{onlyInScope:true});
  await api('spider','action','setOptionThreadCount',{Integer:settings.concurrency});
  await api('spider','action','setOptionMaxDuration',{Integer:1});
  await api('spider','action','setOptionMaxDepth',{Integer:4});
  await api('spider','action','setOptionMaxChildren',{Integer:15});
  await api('spider','action','setOptionProcessForm',{Boolean:false});
  await api('spider','action','setOptionPostForm',{Boolean:false});
  await api('ascan','action','setOptionThreadPerHost',{Integer:settings.concurrency});
  await api('ascan','action','setOptionHostPerScan',{Integer:1});
  await api('ascan','action','setOptionDelayInMs',{Integer:scanDelayMs});
  await api('ascan','action','setOptionMaxScanDurationInMins',{Integer:Math.max(1,Math.ceil(settings.seconds/60))});
  await api('ascan','action','setOptionMaxRuleDurationInMins',{Integer:1});
  await api('network','action','setConnectionTimeout',{timeout:5});
  await api('network','action','setUseGlobalHttpState',{use:false});
  // Hardening the scanner's discovery scope is independent of the vulnerable arm.
  await api('spider','action','excludeFromScan',{regex:'^(?!(?:'+scopes.map(item=>escapeRegex(item.prefix)+'(?:/|\\?|$)').join('|')+')).*'});
  for(const item of observationScopes) {
    await api('spider','action','excludeFromScan',{regex:item.regex});
    await api('ascan','action','excludeFromScan',{regex:item.regex});
  }
  metadata.scope={includeRegex:scope.regex,includeRegexes:scopes.map(item=>item.regex),observationOnlyRegexes:observationScopes.map(item=>item.regex),entry:scope.entry,openapi:scope.openapi,excludedOrigins:['http://app:8099','http://app:8080',...(observationScopes.length?[]:['https://app:8444'])],protectionMode:'protect'};
}
async function stop() {
  await optional('spider','action','stopAllScans');
  await optional('ascan','action','stopAllScans');
  // Let already dispatched requests finish; this time is recorded separately.
  const began=Date.now();let previous=-1,stable=0,settled=false;
  while(Date.now()-began<stopDrainLimitMs) {
    const m=await snapshot();
    stable=m.count===previous?stable+1:0;previous=m.count;
    metadata.drainPendingState=pendingState(m);
    if(stable>=2&&metadata.drainPendingState.settled){settled=true;break;}
    await sleep(500);
  }
  metadata.stopDrainSeconds=(Date.now()-began)/1000;
  metadata.drainTimedOut=!settled;
  metadata.trafficSettled=settled;
}
function recordMeasurementStop(value) {
  metadata.measurement=value;
  metadata.pendingAtMeasurementStop=pendingState(value);
  metadata.pendingRequestsAtMeasurementStop=metadata.pendingAtMeasurementStop.activeRequests;
  metadata.trafficSettled=metadata.trafficSettled&&metadata.pendingAtMeasurementStop.settled;
  if(!metadata.trafficSettled)metadata.limitations.push('Public responses or asynchronous handlers were not confirmed settled at measurement stop; response timing and state effects remain incomplete.');
}
async function collectSettings() {
  let activeScanners;
  if(settings.profile==='active-low') {
    activeScanners=lowPolicy?.owned?await api('ascan','view','scanners',{scanPolicyName:lowPolicy.name}):null;
    if(lowPolicy?.verified)validateLowPolicySnapshot(activeScanners,lowPolicy.installedIds);
  } else activeScanners=await optional('ascan','view','scanners');
  const scripts=(await optional('script','view','listScripts'))?.listScripts;
  if(!Array.isArray(scripts))throw new Error('ZAP script inventory unavailable.');
  const customMode=process.env.SCAN_CUSTOM_MODE||'none';
  if(!['none','custom','custom-only'].includes(customMode))throw new Error('Invalid custom rule mode.');
  let customRules=[];
  if(customMode!=='none') {
    const manifest=JSON.parse(await readFile('/scan-input/custom-rules-manifest.json','utf8'));
    if(manifest.schema!=='benchmark-custom-zap-rules-0.1'||!Array.isArray(manifest.rules)||manifest.rules.length===0)throw new Error('Invalid custom rule manifest.');
    for(const rule of manifest.rules) {
      if(!/^benchmark-[a-z-]+$/.test(rule.name)||!/^\d+$/.test(rule.id)||!/^[a-f0-9]{64}$/.test(rule.sha256))throw new Error('Invalid custom rule identity.');
      if(!scripts.some(script=>script.name===rule.name&&String(script.enabled)==='true'&&String(script.error)!=='true'))throw new Error('Custom rule script is disabled or has an error.');
      if(!activeScanners?.scanners?.some(scanner=>scanner.id===rule.id&&String(scanner.enabled)==='true'))throw new Error('Custom rule scanner is not enabled.');
      const actual=createHash('sha256').update(await readFile('/scan-input/'+rule.name+'.js')).digest('hex');
      if(actual!==rule.sha256)throw new Error('Custom rule source changed after installation.');
    }
    customRules=manifest.rules;
    if(customMode==='custom-only'&&activeScanners.scanners.some(scanner=>scanner.id!=='50000'&&String(scanner.enabled)==='true'))throw new Error('Non-custom active scanner is enabled in custom-only mode.');
  } else if(hasEnabledBenchmarkScanScript(scripts))throw new Error('Custom script is enabled in default mode.');
  const settingsSnapshot={installedAddons:await optional('autoupdate','view','installedAddons'),activeScanners,customMode,customRules,passiveScanners:await optional('pscan','view','scanners'),spiderThreads:await optional('spider','view','optionThreadCount'),activeThreads:await optional('ascan','view','optionThreadPerHost'),authPolicy:{configuredAuthentication:settings.auth==='anonymous'?'none':settings.auth,subject:settings.auth==='anonymous'?null:settings.user,headerPolicy:settings.auth==='anonymous'?'none':metadata.authReachability.headerPolicy,engine:settings.auth==='anonymous'?null:'Graal.js',templateVersion:'benchmark-auth-missing-headers-0.1',excludedOperations:metadata.authScopeExclusions||[]}};
  if(settings.profile==='active-low') {
    settingsSnapshot.activeScanPolicy=lowPolicyDescription(lowPolicy);
    metadata.activeScanPolicy={...metadata.activeScanPolicy,...lowPolicyDescription(lowPolicy),selectedSnapshotSha256:activeScanners?fingerprint(activeScanners):null};
    metadata.activeScanPolicy.unavailableDependencyRuleIds=(activeScanners?.scanners||[]).filter(rule=>['false',false].includes(rule.allDependenciesAvailable)).map(rule=>rule.id);
  }
  metadata.scannerSettingsSha256=fingerprint(settingsSnapshot);
  metadata.scannerConfigurationSha256=configurationFingerprint(settingsSnapshot,metadata.workspace);
  metadata.normalizationVersion=CONFIGURATION_NORMALIZATION;
  await writeFile(output+'/scanner-settings.json',JSON.stringify(settingsSnapshot,null,2)+'\n');
  if(settings.profile==='active-low'&&activeScanners)lowPolicySnapshotSaved=true;
}
async function collect() {
  // Preserve the actual named-policy state even if a later raw-report API fails.
  await collectSettings();
  const history=await api('core','view','messages',{baseurl:scope.prefix,start:0,count:500});
  const firstHistoryBody=JSON.stringify(history,null,2)+'\n';
  await writeFile(output+'/messages-first-500.json',firstHistoryBody);
  metadata.historyArtifactLimit=500;
  const archived=await captureRemainingMessages(history,(start,count)=>api('core','view','messages',{baseurl:scope.prefix,start,count}));
  const historyFiles=[{path:'messages-first-500.json',messages:history.messages.length,sha256:createHash('sha256').update(firstHistoryBody).digest('hex')}];
  if(archived.remaining.length){
    const remainingBody=JSON.stringify({start:500,messages:archived.remaining},null,2)+'\n';
    await writeFile(output+'/messages-after-500.json',remainingBody);
    historyFiles.push({path:'messages-after-500.json',messages:archived.remaining.length,sha256:createHash('sha256').update(remainingBody).digest('hex')});
  }
  metadata.historyArchive={savedCount:archived.savedCount,maxMessages:archived.maxMessages,complete:archived.complete,files:historyFiles,...(archived.error?{error:safeMessage(archived.error)}:{})};
  if(!archived.complete)metadata.limitations.push('The saved ZAP HTTP history is incomplete; absence of a request in the saved pages is not evidence that the scanner did not send it.');
  metadata.secondaryHistoryArchives=[];
  const reportScopes=[...scopes,...observationScopes];
  for(const [index,item] of reportScopes.entries()) {
    if(item.origin===scope.origin)continue;
    const first=await api('core','view','messages',{baseurl:item.prefix,start:0,count:500});
    const prefix='messages-origin-'+index;
    const firstBody=JSON.stringify(first,null,2)+'\n';
    await writeFile(output+'/'+prefix+'-first-500.json',firstBody);
    const rest=await captureRemainingMessages(first,(start,count)=>api('core','view','messages',{baseurl:item.prefix,start,count}));
    const files=[{path:prefix+'-first-500.json',messages:first.messages.length,sha256:createHash('sha256').update(firstBody).digest('hex')}];
    if(rest.remaining.length) {
      const body=JSON.stringify({start:500,messages:rest.remaining},null,2)+'\n';
      await writeFile(output+'/'+prefix+'-after-500.json',body);
      files.push({path:prefix+'-after-500.json',messages:rest.remaining.length,sha256:createHash('sha256').update(body).digest('hex')});
    }
    metadata.secondaryHistoryArchives.push({origin:item.origin,savedCount:rest.savedCount,maxMessages:rest.maxMessages,complete:rest.complete,files,...(rest.error?{error:safeMessage(rest.error)}:{})});
    if(!rest.complete)metadata.limitations.push('The saved ZAP HTTP history is incomplete for '+item.origin+'.');
  }
  if(process.env.SCAN_CUSTOM_MODE==='custom'||process.env.SCAN_CUSTOM_MODE==='custom-only') {
    const findings=correlateErrorCache(history.messages||[]);
    await writeFile(output+'/history-findings.json',JSON.stringify({source:'benchmark controller correlation of ZAP HTTP history',findings},null,2)+'\n');
    metadata.postscanCorrelation={source:'benchmark controller',name:'shared-error-cache',count:findings.length,historyMessageLimit:500};
    for(const finding of findings) {
      await api('alert','action','addAlert',{
        messageId:finding.followupMessageId,
        name:'Shared error response cache contamination (history correlation)',
        riskId:2,
        confidenceId:2,
        description:`A normal GET (message ${finding.baselineMessageId}) returned 200. A request with ${finding.headerName} (message ${finding.triggerMessageId}) returned ${finding.status} and reflected its header value. A later GET without that header (message ${finding.followupMessageId}) returned the same error body. This alert was added by the benchmark controller after correlating ZAP history.`,
        param:finding.headerName
      });
    }
  }
  const alerts=[];metadata.alertsByOrigin=[];
  for(const [index,item] of reportScopes.entries()) {
    const group=[];
    for(let start=0;start<100000;start+=500) {
      const value=await api('core','view','alerts',{baseurl:item.prefix,start,count:500});
      const items=value.alerts||[];group.push(...items);if(items.length<500)break;
    }
    alerts.push(...group);metadata.alertsByOrigin.push({origin:item.origin,count:group.length});
    if(item.origin!==scope.origin)await writeFile(output+'/alerts-origin-'+index+'.json',JSON.stringify({alerts:group},null,2)+'\n');
  }
  await writeFile(output+'/alerts.json',JSON.stringify({alerts},null,2)+'\n');
  metadata.rawAlertInstances=alerts.length;
  const inventory=await api('core','view','urls',{baseurl:scope.prefix});
  await writeFile(output+'/urls.json',JSON.stringify(inventory,null,2)+'\n');
  for(const [index,item] of reportScopes.entries())if(item.origin!==scope.origin) {
    const secondary=await api('core','view','urls',{baseurl:item.prefix});
    await writeFile(output+'/urls-origin-'+index+'.json',JSON.stringify(secondary,null,2)+'\n');
  }
  // This HTML is generated by ZAP itself. The panel starts a fresh ZAP session
  // for every cell, so the report describes only that cell's scanner history.
  const reportResponse=await fetch(new URL('/OTHER/core/other/htmlreport/',zap),{
    headers:{'X-ZAP-API-Key':apiKey},signal:AbortSignal.timeout(30000)
  });
  if(!reportResponse.ok)throw new Error('ZAP HTML report: HTTP '+reportResponse.status);
  const html=await reportResponse.text();
  if(!/^\s*(?:<!doctype html|<html)\b/i.test(html))throw new Error('ZAP HTML report: invalid HTML response');
  await writeFile(output+'/zap-report.html',html);
  metadata.htmlReport={path:'zap-report.html',source:'ZAP core htmlreport',bytes:Buffer.byteLength(html)};
}
try {
  const startup=Date.now();
  while(true) {
    try {metadata.toolVersion=(await api('core','view','version',{},2000)).version;break;}
    catch(error){if(Date.now()-startup>90000)throw new Error('ZAP daemon did not become ready within 90 seconds.');await sleep(1000);}
  }
  metadata.startupSeconds=(Date.now()-startup)/1000;
  metadata.phase='configuration';
  manifest=await ctl('/manifest');metadata.workspace=manifest.base;
  metadata.targetRuntimeSource={controller:await runtimeSourceProof('/opt/benchmark'),targetBefore:await ctl('/source-proof')};
  metadata.targetRuntimeSource.controllerMatch=compareRuntimeSourceProof(metadata.targetRuntimeSource.controller,metadata.targetRuntimeSource.targetBefore);
  if(metadata.targetRuntimeSource.controllerMatch.status!=='matched')throw new Error('Target application runtime source differs from scan controller or proof is invalid.');
  for(const value of [manifest.credentials,...(manifest.roleProfiles||[])])onSecret(value?.password);
  metadata.inputFingerprints={publicManifestSha256:fingerprint(manifest)};
  await writeFile(output+'/public-inputs.json',JSON.stringify(manifest,null,2)+'\n');
  metadata.targetSurface={requiredOrigins:manifest.requiredTargetOrigins??[TARGET_ORIGIN],requiredObservationCapabilities:manifest.requiredObservationCapabilities===undefined?[]:manifest.requiredObservationCapabilities,supportedOrigins:[TARGET_ORIGIN],verified:false};
  metadata.targetSurface=validateTargetSurface(manifest,settings);
  scope=publicScope(manifest,{origin:metadata.targetSurface.supportedOrigins.includes(TARGET_ORIGIN)?TARGET_ORIGIN:COOKIE_HTTPS_ORIGIN});
  metadata.targetOrigin=scope.origin;
  scopes=(metadata.targetSurface.scanOrigins||metadata.targetSurface.supportedOrigins).map(origin=>publicScope(manifest,{origin}));
  observationScopes=metadata.targetSurface.observationOrigins?.map(origin=>({origin,prefix:origin+(metadata.targetSurface.observationPath||'/collect-events'),regex:'^'+escapeRegex(origin+(metadata.targetSurface.observationPath||'/collect-events'))+'(?:\\?.*|$)'}))||[];
  const authPlan=authenticationPlan(manifest,settings,scope);
  await configure();
  if(settings.profile==='active-low') {
    lowPolicy=await createLowScanPolicy(api,{onOwned:value=>{lowPolicy=value;metadata.activeScanPolicy.cleanup.required=true;}});
    metadata.activeScanPolicy={...metadata.activeScanPolicy,...lowPolicyDescription(lowPolicy)};
  }
  metadata.measurement=await ctl('/measurement/start',{});measurementStarted=true;
  metadata.scanStartedAt=new Date().toISOString();deadline=Date.now()+settings.seconds*1000;
  if(metadata.targetSurface.adapter==='browser-cookie-transport') {
    metadata.phase='browser-cookie-transport';
    await browserCookieTransport(authPlan);
  }
  if(metadata.targetSurface.adapter==='browser-event-collector') {
    metadata.phase='browser-event-collector';
    await browserEventCollector(authPlan);
    metadata.limitations.push('A declared browser action reached the local event collector through ZAP; the collector is observation-only and is excluded from spider and active scan. Its saved HTTP messages require human review for any sensitive-field conclusion.');
  }
  if(metadata.targetSurface.adapter==='browser-library-integrity') {
    metadata.phase='browser-library-integrity';
    await browserLibraryIntegrity(authPlan);
    metadata.limitations.push('The declared library was fetched through the local ZAP proxy before and after a fixture distribution update. This is a browser observation, not a ZAP alert or vulnerability score. The auxiliary URL is excluded from spider and active scan.');
  }
  if(metadata.targetSurface.adapter==='browser-resource-switch') {
    metadata.phase='browser-resource-switch';
    await browserResourceSwitch();
    metadata.limitations.push('The browser loaded a normal same-origin script and exercised the declared alternative local script source through ZAP. Auxiliary response presence and browser execution are recorded separately from ZAP alert detection.');
  }
  if(metadata.targetSurface.adapter==='browser-jsonp-csp') {
    metadata.phase='browser-jsonp-csp';
    await browserJsonpCsp();
    metadata.limitations.push('The declared JSONP source and callback execution were observed through the local ZAP proxy. This browser result is separate from ZAP alert detection; the auxiliary URL is excluded from spider and active scan.');
  }
  if(metadata.targetSurface.adapter==='browser-external-window') {
    metadata.phase='browser-external-window';
    await browserExternalWindow();
    metadata.limitations.push('The declared auxiliary popup and its opener-driven navigation were observed through the local ZAP proxy. Browser behavior is separate from ZAP alert detection; the auxiliary URL is excluded from spider and active scan.');
  }
  metadata.phase='authentication';metadata.status='running';
  authentication=await establishAuthentication({plan:authPlan,scope,api,onSecret,onProgress:value=>{metadata.authReachability=value;},ensureBudget:async()=>{if(metadata.phase==='authentication-final')return;if(!await guard())throw new AuthenticationError('auth_budget_exhausted','The measurement budget ended before authentication could be verified.');}});
  metadata.authReachability=authentication.summary;
  await excludeAuthOperations();
  metadata.phase='seed';
  const schemaMessages=await access(scope.openapi);
  const response=schemaMessages.accessUrl?.[0]||schemaMessages.messages?.[0];
  if(!response?.responseBody)throw new Error('OpenAPI response body is unavailable from ZAP accessUrl.');
  const originalSchema=JSON.parse(response.responseBody);
  const importedSchema=anonymousSchema(originalSchema,scope,{auth:settings.auth,manifest});
  const identityExclusions=settings.auth==='anonymous'?[]:identityChangingExamples(manifest);
  metadata.inputFingerprints.originalOpenapiSha256=fingerprint(originalSchema);
  metadata.inputFingerprints.importedOpenapiSha256=fingerprint(importedSchema);
  await writeFile(output+'/openapi-original.json',JSON.stringify(originalSchema,null,2)+'\n');
  await writeFile(output+'/openapi-anonymous.json',JSON.stringify(importedSchema,null,2)+'\n');
  if(settings.auth!=='anonymous')await writeFile(output+'/openapi-authenticated.json',JSON.stringify(importedSchema,null,2)+'\n');
  await writeFile('/scan-input/openapi.json',JSON.stringify(importedSchema));
  metadata.openapi={originalPathCount:Object.keys(originalSchema.paths||{}).length,importedPathCount:Object.keys(importedSchema.paths).length,identityChangingExampleExclusions:identityExclusions,filter:settings.auth==='anonymous'?'login/logout/IdP credential POST excluded; unchanged normal examples for other operations':'login/logout routes and credentialed session-elevation POST examples excluded; unchanged normal examples for other operations'};
  if(identityExclusions.length)metadata.limitations.push('Credentialed session-elevation POST examples are omitted from authenticated OpenAPI import to keep the selected subject stable; this scan does not exercise or score that workflow.');
  metadata.originReachability=[];
  for(const item of scopes) {
    for(const url of seedUrls(manifest,item,settings)) {
      if(!await guard())break;
      const response=await access(url);
      if(url===item.entry)metadata.originReachability.push({origin:item.origin,...measuredMessage(response,'accessUrl','GET',url)});
      metadata.steps.push({type:'normal-get',url});
    }
    if(reason)break;
  }
  if(!reason&&metadata.targetSurface.adapter==='dual-http-transport') {
    const http=scopes.find(item=>item.origin.startsWith('http:'));
    const credentialPost=(manifest.requests||[]).find(request=>request.method==='POST'&&
      typeof request.values?.username==='string'&&typeof request.values?.password==='string'&&http.isAllowed(request.path));
    if(!credentialPost)throw new TargetSurfaceError('transport_example_missing','The public contract has no normal credential form POST for the HTTP transport.');
    if(await guard()) {
      const url=new URL(credentialPost.path,http.origin).href;
      const response=await api('core','action','sendRequest',{request:rawRequest(url,{method:'POST',body:credentialPost.values}),followRedirects:false},Math.min(15000,Math.max(1000,deadline-Date.now())));
      metadata.normalTransportPost=measuredMessage(response,'sendRequest','POST',url);
      metadata.steps.push({type:'normal-http-transport-post',url,status:metadata.normalTransportPost.status});
    }
    metadata.targetSurface.verified=!reason&&metadata.originReachability.length===scopes.length&&Boolean(metadata.normalTransportPost);
    if(!reason&&!metadata.targetSurface.verified)throw new TargetSurfaceError('target_origin_not_reached','The declared HTTP and HTTPS target surfaces were not both reached.');
    metadata.limitations.push('The normal HTTP credential POST is sent through ZAP and preserved in raw HTTP history; browser form navigation and secure-context behavior are not reproduced by this adapter.');
  }
  if(!reason&&metadata.targetSurface.adapter==='dual-forwarded-transport') {
    const http=scopes.find(item=>item.origin==='http://app:8080');
    const normalPost=entryPost(manifest,http);
    const cookie=authentication.fixtureCookie?.();
    if(!normalPost||!cookie)throw new TargetSurfaceError('forwarded_transport_contract_missing','The public contract lacks a scoped normal POST or verified fixture session.');
    if(await guard()) {
      const url=new URL(normalPost.path,http.origin).href;
      const response=await api('core','action','sendRequest',{request:rawRequest(url,{method:'POST',headers:{Cookie:cookie,'X-Forwarded-Proto':'https'},body:normalPost.values}),followRedirects:false},Math.min(15000,Math.max(1000,deadline-Date.now())));
      const message=messageFrom(response,'sendRequest');
      if(requestHeader(message,'Cookie')!==cookie||requestHeader(message,'X-Forwarded-Proto')!=='https')throw new TargetSurfaceError('forwarded_transport_request_changed','ZAP did not retain the selected fixture session and declared protocol in the HTTP request.');
      metadata.forwardedTransportPost=measuredMessage(response,'sendRequest','POST',url);
      metadata.steps.push({type:'session-http-forwarded-post',url,status:metadata.forwardedTransportPost.status});
    }
    metadata.targetSurface.verified=!reason&&metadata.originReachability.length===scopes.length&&Boolean(metadata.forwardedTransportPost);
    if(!reason&&!metadata.targetSurface.verified)throw new TargetSurfaceError('target_origin_not_reached','The declared HTTP and HTTPS target surfaces were not both reached.');
    metadata.limitations.push('The authenticated HTTP forwarded-protocol POST is an explicit local diagnostic request. Generic spider and active scan do not reproduce its session header combination; the saved raw HTTP request and response must be reviewed separately.');
  }
  if(!reason)await guard();
  if(!reason&&isActiveProfile(settings.profile)) {
    await verifyAuthentication();
    metadata.phase='openapi-import';
    metadata.openapi.imports=[];
    for(const [index,item] of scopes.entries()) {
      if(!await guard())break;
      const primary=item.origin===scope.origin;
      const filename=primary?'/scan-input/openapi.json':'/scan-input/openapi-origin-'+index+'.json';
      if(!primary) {
        const schema=anonymousSchema(originalSchema,item,{auth:settings.auth,manifest});
        await writeFile(filename,JSON.stringify(schema));
        await writeFile(output+'/openapi-origin-'+index+'.json',JSON.stringify(schema,null,2)+'\n');
      }
      await api('openapi','action','importFile',{file:filename,target:item.origin,contextId:metadata.contextId,maxMessages:50},Math.min(30000,Math.max(1000,deadline-Date.now())));
      metadata.openapi.imports.push({origin:item.origin,file:filename,completed:true});
    }
  }
  if(!reason) {
    await verifyAuthentication();
    metadata.phase='spider';
    metadata.spiderScans=[];
    for(const item of scopes) {
      if(!await guard())break;
      const scan=await api('spider','action','scan',{url:item.entry,maxChildren:15,recurse:true,contextName:metadata.context,subtreeOnly:true});
      const completed=await waitScan('spider',scan.scan);
      metadata.spiderScans.push({origin:item.origin,id:scan.scan,completed});
      if(item.origin===scope.origin)metadata.spiderId=scan.scan;
    }
    metadata.spiderCompleted=metadata.spiderScans.length===scopes.length&&metadata.spiderScans.every(scan=>scan.completed);
  }
  if(!reason)await guard();
  if(!reason&&isActiveProfile(settings.profile)) {
    await verifyAuthentication();
    metadata.phase='active';
    metadata.activeScans=[];
    for(const item of scopes) {
      if(!await guard())break;
      const scan=await api('ascan','action','scan',activeScanParameters(settings.profile,{url:item.prefix,recurse:true,inScopeOnly:true,contextId:metadata.contextId},lowPolicy));
      if(settings.profile==='active-low')metadata.activeScanPolicy.activeScanInvoked=true;
      const completed=await waitScan('ascan',scan.scan);
      metadata.activeScans.push({origin:item.origin,id:scan.scan,completed});
      if(item.origin===scope.origin)metadata.activeScanId=scan.scan;
    }
    metadata.activeScanCompleted=metadata.activeScans.length===scopes.length&&metadata.activeScans.every(scan=>scan.completed);
  }
  if(!reason) {
    metadata.phase='passive';
    while(await guard()) {
      if(Number((await api('pscan','view','recordsToScan')).recordsToScan)===0)break;
      await sleep(500);
    }
  }
  metadata.stopReason=reason||'scan_complete';metadata.scanStopRequestedAt=new Date().toISOString();
  metadata.phase='stopping';await stop();
  if(metadata.trafficSettled){metadata.phase='authentication-final';await verifyAuthentication();}
  // Final probes themselves are measured and must also finish before stop.
  if(settings.auth!=='anonymous'&&metadata.trafficSettled){metadata.phase='stopping';await stop();metadata.authReachability.postScanVerified=true;}
  else if(settings.auth!=='anonymous')metadata.authReachability.postScanVerified=false;
  recordMeasurementStop(await ctl('/measurement/stop',{}));measurementStarted=false;
  metadata.scanFinishedAt=new Date().toISOString();
  metadata.targetRuntimeSource.targetAfter=await ctl('/source-proof');
  metadata.targetRuntimeSource.scanMatch=compareRuntimeSourceProof(metadata.targetRuntimeSource.targetBefore,metadata.targetRuntimeSource.targetAfter);
  if(metadata.targetRuntimeSource.scanMatch.status!=='matched')throw new Error('Target application runtime source changed during scan or proof is invalid.');
  metadata.budgets.observedRequestBudgetExceeded=metadata.measurement.count>settings.requests;
  metadata.budgets.observedConcurrencyExceeded=metadata.measurement.peakActive>2;
  metadata.phase='report';await collect();
  metadata.status=!metadata.trafficSettled?'incomplete_drain':reason?'budget_stopped':'completed';
} catch(error) {
  metadata.status=(error instanceof AuthenticationError||error instanceof TargetSurfaceError)&&error.unsupported?'unsupported':'failed';metadata.errors.push({phase:metadata.phase,...(error.code?{code:error.code}:{}),message:safeMessage(error.message)});process.exitCode=1;
  if(measurementStarted) {
    try {await stop();recordMeasurementStop(await ctl('/measurement/stop',{}));measurementStarted=false;}catch(stopError){metadata.errors.push({phase:'cleanup',message:safeMessage(stopError.message)});}
  }
  if(scope)try {await collect();}catch(reportError){metadata.errors.push({phase:'report',message:safeMessage(reportError.message)});}
} finally {
  if(authentication)try{await authentication.cleanup();}catch(error){metadata.errors.push({phase:'auth-cleanup',message:safeMessage(error.message)});metadata.status='failed';process.exitCode=1;}
  if(lowPolicy?.owned) {
    metadata.phase='policy-cleanup';
    try {
      metadata.activeScanPolicy.cleanup={required:true,snapshotSaved:lowPolicySnapshotSaved,...await cleanupLowScanPolicy(api,lowPolicy,{snapshotSaved:lowPolicySnapshotSaved,isTrafficSettled:async()=>{const value=await ctl('/measurement');return value.active===false&&pendingState(value).settled;}})};
    }catch(error) {
      metadata.activeScanPolicy.cleanup={required:true,snapshotSaved:lowPolicySnapshotSaved,removed:false,verified:false,errorCode:error.code||'low_policy_cleanup_failed'};
      metadata.errors.push({phase:'policy-cleanup',code:error.code||'low_policy_cleanup_failed',message:safeMessage(error.message)});metadata.status='failed';process.exitCode=1;
    }
  }
  metadata.finishedAt=new Date().toISOString();metadata.durationSeconds=(Date.parse(metadata.finishedAt)-Date.parse(metadata.startedAt))/1000;
  metadata.phase='finished';await writeFile(output+'/run.json',safeMessage(JSON.stringify(metadata,null,2))+'\n');
  console.log(JSON.stringify({runId,status:metadata.status,toolVersion:metadata.toolVersion,requests:metadata.measurement?.count,peakConcurrency:metadata.measurement?.peakActive,rawAlerts:metadata.rawAlertInstances,output},null,2));
}
