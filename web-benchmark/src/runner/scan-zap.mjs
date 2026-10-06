import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {options,publicScope,seedUrls,anonymousSchema,validateTargetSurface,TargetSurfaceError,TARGET_ORIGIN,isActiveProfile,createLowScanPolicy,validateLowPolicySnapshot,lowPolicyDescription,activeScanParameters,cleanupLowScanPolicy} from './policy.mjs';
import {pendingState} from './drain.mjs';
import {authenticationPlan,establishAuthentication,AuthenticationError} from './auth.mjs';
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
let deadline=Infinity,measurementStarted=false,reason=null,scope,authentication,manifest,lowPolicy,lowPolicySnapshotSaved=false;
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
  if(!scope.isAllowed(url))throw new Error('Refused out-of-workspace seed.');
  return api('core','action','accessUrl',{url,followRedirects:false},Math.min(15000,Math.max(1000,deadline-Date.now())));
}
async function configure() {
  const context='benchmark-'+runId;
  metadata.context=context;
  const result=await api('context','action','newContext',{contextName:context});metadata.contextId=result.contextId;
  await api('context','action','includeInContext',{contextName:context,regex:scope.regex});
  await api('context','action','setContextInScope',{contextName:context,booleanInScope:true});
  await api('core','action','setMode',{mode:'protect'});
  await api('core','action','excludeFromProxy',{regex:'^(?!https://app:8443(?:/|$)).*'});
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
  await api('spider','action','excludeFromScan',{regex:'^(?!'+scope.prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:/|\\?|$)).*'});
  metadata.scope={includeRegex:scope.regex,entry:scope.entry,openapi:scope.openapi,excludedOrigins:['http://app:8099','https://app:8444','http://app:8080'],protectionMode:'protect'};
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
  const alerts=[];
  for(let start=0;start<100000;start+=500) {
    const value=await api('core','view','alerts',{baseurl:scope.prefix,start,count:500});
    const items=value.alerts||[];alerts.push(...items);if(items.length<500)break;
  }
  await writeFile(output+'/alerts.json',JSON.stringify({alerts},null,2)+'\n');
  metadata.rawAlertInstances=alerts.length;
  const inventory=await api('core','view','urls',{baseurl:scope.prefix});
  await writeFile(output+'/urls.json',JSON.stringify(inventory,null,2)+'\n');
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
  manifest=await ctl('/manifest');metadata.workspace=manifest.base;scope=publicScope(manifest);
  metadata.targetRuntimeSource={controller:await runtimeSourceProof('/opt/benchmark'),targetBefore:await ctl('/source-proof')};
  metadata.targetRuntimeSource.controllerMatch=compareRuntimeSourceProof(metadata.targetRuntimeSource.controller,metadata.targetRuntimeSource.targetBefore);
  if(metadata.targetRuntimeSource.controllerMatch.status!=='matched')throw new Error('Target application runtime source differs from scan controller or proof is invalid.');
  for(const value of [manifest.credentials,...(manifest.roleProfiles||[])])onSecret(value?.password);
  metadata.inputFingerprints={publicManifestSha256:fingerprint(manifest)};
  await writeFile(output+'/public-inputs.json',JSON.stringify(manifest,null,2)+'\n');
  metadata.targetSurface={requiredOrigins:manifest.requiredTargetOrigins??[TARGET_ORIGIN],requiredObservationCapabilities:manifest.requiredObservationCapabilities===undefined?[]:manifest.requiredObservationCapabilities,supportedOrigins:[TARGET_ORIGIN],verified:false};
  metadata.targetSurface=validateTargetSurface(manifest);
  const authPlan=authenticationPlan(manifest,settings,scope);
  await configure();
  if(settings.profile==='active-low') {
    lowPolicy=await createLowScanPolicy(api,{onOwned:value=>{lowPolicy=value;metadata.activeScanPolicy.cleanup.required=true;}});
    metadata.activeScanPolicy={...metadata.activeScanPolicy,...lowPolicyDescription(lowPolicy)};
  }
  metadata.measurement=await ctl('/measurement/start',{});measurementStarted=true;
  metadata.scanStartedAt=new Date().toISOString();deadline=Date.now()+settings.seconds*1000;
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
  metadata.inputFingerprints.originalOpenapiSha256=fingerprint(originalSchema);
  metadata.inputFingerprints.importedOpenapiSha256=fingerprint(importedSchema);
  await writeFile(output+'/openapi-original.json',JSON.stringify(originalSchema,null,2)+'\n');
  await writeFile(output+'/openapi-anonymous.json',JSON.stringify(importedSchema,null,2)+'\n');
  if(settings.auth!=='anonymous')await writeFile(output+'/openapi-authenticated.json',JSON.stringify(importedSchema,null,2)+'\n');
  await writeFile('/scan-input/openapi.json',JSON.stringify(importedSchema));
  metadata.openapi={originalPathCount:Object.keys(originalSchema.paths||{}).length,importedPathCount:Object.keys(importedSchema.paths).length,filter:settings.auth==='anonymous'?'login/logout/IdP credential POST excluded; unchanged normal examples for other operations':'login/logout/identity-changing routes excluded for all methods; unchanged normal examples for other operations'};
  for(const url of seedUrls(manifest,scope,settings)) {
    if(!await guard())break;
    await access(url);metadata.steps.push({type:'normal-get',url});
  }
  if(!reason)await guard();
  if(!reason&&isActiveProfile(settings.profile)) {
    await verifyAuthentication();
    metadata.phase='openapi-import';
    await api('openapi','action','importFile',{file:'/scan-input/openapi.json',target:scope.origin,contextId:metadata.contextId,maxMessages:50},Math.min(30000,Math.max(1000,deadline-Date.now())));
    await guard();
  }
  if(!reason) {
    await verifyAuthentication();
    metadata.phase='spider';
    const scan=await api('spider','action','scan',{url:scope.entry,maxChildren:15,recurse:true,contextName:metadata.context,subtreeOnly:true});
    metadata.spiderId=scan.scan;metadata.spiderCompleted=await waitScan('spider',scan.scan);
  }
  if(!reason)await guard();
  if(!reason&&isActiveProfile(settings.profile)) {
    await verifyAuthentication();
    metadata.phase='active';
    const scan=await api('ascan','action','scan',activeScanParameters(settings.profile,{url:scope.prefix,recurse:true,inScopeOnly:true,contextId:metadata.contextId},lowPolicy));
    if(settings.profile==='active-low')metadata.activeScanPolicy.activeScanInvoked=true;
    metadata.activeScanId=scan.scan;metadata.activeScanCompleted=await waitScan('ascan',scan.scan);
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
