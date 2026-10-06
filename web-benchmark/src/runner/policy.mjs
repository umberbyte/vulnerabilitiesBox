import {isDeepStrictEqual} from 'node:util';

export const TARGET_ORIGIN='https://app:8443';
export const COLLECTOR_ORIGIN='https://app:8444';
export const HTTP_TRANSPORT_ORIGIN='http://benchmark.test:8080';
export const HTTP_FORWARD_ORIGIN='http://app:8080';
export const COOKIE_HTTPS_ORIGIN='https://app.benchmark.test:8443';
export const COOKIE_HTTP_ORIGIN='http://app.benchmark.test:8080';
export const CORS_PARTNER_ORIGIN='https://partner.benchmark.test:8444';
export const CORS_EVIL_ORIGIN='https://evil.benchmark.test:8444';
export const COOKIE_EVIL_ORIGIN='https://evil.benchmark.test:8443';
export const COOKIE_ATTACKER_ORIGIN='https://attacker.test:8444';
export const CORS_ALT_PORT_ORIGIN='https://app.benchmark.test:8444';
export const SCAN_PROFILES=Object.freeze(['baseline','active','active-low']);
export const LOW_SCAN_POLICY='benchmark-active-low-v1';
export const LOW_POLICY_VERSION='benchmark-active-low-0.1';
export const isActiveProfile=profile=>profile==='active'||profile==='active-low';

function policyError(code,message){const error=new Error(message);error.code=code;return error;}
function requirePolicyOK(value,operation) {
  if(value?.Result!=='OK')throw policyError('low_policy_api_unconfirmed','Temporary policy operation was not acknowledged: '+operation+'.');
}
function policyNames(value) {
  const names=value?.scanPolicyNames;
  if(!Array.isArray(names)||names.length===0||names.some(name=>typeof name!=='string'||!name)||new Set(names).size!==names.length)throw policyError('invalid_policy_inventory','The scanner policy inventory is missing or invalid.');
  return [...names].sort();
}
function scannerIds(value) {
  const scanners=value?.scanners;
  if(!Array.isArray(scanners)||scanners.length===0||scanners.some(scanner=>typeof scanner?.id!=='string'||!/^\d+$/.test(scanner.id))||new Set(scanners.map(scanner=>scanner.id)).size!==scanners.length)throw policyError('invalid_scanner_inventory','The installed active scanner inventory is missing or invalid.');
  return scanners.map(scanner=>scanner.id);
}
export function validateLowPolicySnapshot(value,expectedIds) {
  const ids=scannerIds(value);
  if(!isDeepStrictEqual([...ids].sort(),[...expectedIds].sort()))throw policyError('low_policy_rule_inventory_changed','The named policy does not contain exactly the installed active rules.');
  if(value.scanners.some(scanner=>!['true',true].includes(scanner.enabled)||scanner.attackStrength!=='LOW'||scanner.alertThreshold!=='MEDIUM'))throw policyError('low_policy_settings_mismatch','Every installed active rule must be enabled with explicit LOW strength and MEDIUM threshold.');
  return value;
}
export function lowPolicyDescription(policy) {
  return {name:LOW_SCAN_POLICY,version:LOW_POLICY_VERSION,attackStrength:'LOW',alertThreshold:'MEDIUM',enabledRules:'all installed active rules; no case-specific selection',configurationVerified:policy?.verified===true};
}
// addScanPolicy creates a new template rather than copying the default policy.
// Set every installed rule explicitly: DEFAULT in scanners means inheritance.
// Ownership is reported immediately after add succeeds, so partial setup can be
// cleaned without ever deleting a policy that existed before this invocation.
export async function createLowScanPolicy(api,{onOwned=()=>{}}={}) {
  const defaultScanners=await api('ascan','view','scanners');
  const installedIds=scannerIds(defaultScanners);
  const previousPolicyNames=policyNames(await api('ascan','view','scanPolicyNames'));
  if(previousPolicyNames.includes(LOW_SCAN_POLICY))throw policyError('low_policy_already_exists','The temporary low-strength policy already exists; it will not be reused or changed.');
  const added=await api('ascan','action','addScanPolicy',{scanPolicyName:LOW_SCAN_POLICY,alertThreshold:'MEDIUM',attackStrength:'LOW'});
  if(added?.Result!=='OK')throw policyError('low_policy_creation_unconfirmed','Temporary policy creation was not acknowledged.');
  const policy={name:LOW_SCAN_POLICY,owned:true,verified:false,installedIds,defaultScanners:structuredClone(defaultScanners),previousPolicyNames};
  onOwned(policy);
  const named={scanPolicyName:LOW_SCAN_POLICY};
  requirePolicyOK(await api('ascan','action','enableAllScanners',named),'enableAllScanners');
  const initial=await api('ascan','view','scanners',named);
  if(!isDeepStrictEqual([...scannerIds(initial)].sort(),[...installedIds].sort()))throw policyError('low_policy_rule_inventory_changed','The named policy does not contain exactly the installed active rules.');
  for(const id of installedIds) {
    requirePolicyOK(await api('ascan','action','setScannerAttackStrength',{...named,id,attackStrength:'LOW'}),'setScannerAttackStrength');
    requirePolicyOK(await api('ascan','action','setScannerAlertThreshold',{...named,id,alertThreshold:'MEDIUM'}),'setScannerAlertThreshold');
  }
  policy.configuredScanners=validateLowPolicySnapshot(await api('ascan','view','scanners',named),installedIds);
  policy.verified=true;
  return policy;
}
export function activeScanParameters(profile,parameters,policy) {
  if(!isActiveProfile(profile))throw policyError('invalid_active_profile','An active scan requires active or active-low.');
  if(profile==='active')return {...parameters};
  if(!policy?.owned||!policy.verified||policy.name!==LOW_SCAN_POLICY)throw policyError('low_policy_not_verified','The low-strength policy must be freshly owned and verified before scanning.');
  return {...parameters,scanPolicyName:LOW_SCAN_POLICY};
}
// FINISHED is only the API state. Also require the application's independent
// inactive/public request/async handler drain check before deleting our policy.
export async function cleanupLowScanPolicy(api,policy,{snapshotSaved=false,isTrafficSettled,timeoutMs=10000,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}={}) {
  if(!policy?.owned||policy.name!==LOW_SCAN_POLICY||typeof isTrafficSettled!=='function')throw policyError('low_policy_cleanup_not_owned','Only this invocation\'s owned policy can be removed after a traffic check.');
  if(snapshotSaved!==true)throw policyError('low_policy_snapshot_not_saved','The actual selected-policy snapshot must be saved before removing the temporary policy.');
  const began=now();let idle=false;
  do {
    const scans=await api('ascan','view','scans');
    if(!Array.isArray(scans?.scans))throw policyError('invalid_active_scan_state','The active scan state is unavailable.');
    idle=scans.scans.every(scan=>scan?.state==='FINISHED')&&await isTrafficSettled();
    if(idle)break;
    if(now()-began>=timeoutMs)throw policyError('low_policy_cleanup_not_idle','Active scans or public requests/handlers did not settle; the temporary policy was not removed.');
    await pause(250);
  }while(true);
  const removed=await api('ascan','action','removeScanPolicy',{scanPolicyName:policy.name});
  if(removed?.Result!=='OK')throw policyError('low_policy_removal_unconfirmed','Temporary policy removal was not acknowledged.');
  const names=policyNames(await api('ascan','view','scanPolicyNames'));
  if(!isDeepStrictEqual(names,policy.previousPolicyNames))throw policyError('low_policy_inventory_not_restored','The original policy inventory was not restored after cleanup.');
  let missing=false;
  try{await api('ascan','view','scanners',{scanPolicyName:policy.name});}
  catch(error){if(String(error.zapCode||'').toUpperCase()==='DOES_NOT_EXIST')missing=true;else throw error;}
  if(!missing)throw policyError('low_policy_removal_not_verified','The removed policy remains readable.');
  const currentDefault=await api('ascan','view','scanners');
  if(!isDeepStrictEqual(currentDefault,policy.defaultScanners))throw policyError('default_policy_changed','The default active scanner settings changed during the temporary-policy lifecycle.');
  policy.owned=false;
  return {name:policy.name,removed:true,absenceVerified:true,originalPolicyInventoryVerified:true,defaultScannersUnchanged:true,activeScansFinished:true,publicTrafficSettled:true};
}
export class TargetSurfaceError extends Error {
  constructor(code,message,{unsupported=false}={}){super(message);this.code=code;this.unsupported=unsupported;}
}
// Target surfaces are declared by the same public normal-operation contract in
// every arm. Never select them by private root, variant, or oracle information.
export function validateTargetSurface(manifest,{auth='anonymous'}={}) {
  const required=manifest.requiredTargetOrigins===undefined?[TARGET_ORIGIN]:manifest.requiredTargetOrigins;
  if(!Array.isArray(required)||required.length===0||required.some(value=>{
    if(typeof value!=='string')return true;
    try{const url=new URL(value);return !['http:','https:'].includes(url.protocol)||url.origin!==value;}catch{return true;}
  })||new Set(required).size!==required.length)throw new TargetSurfaceError('invalid_target_surface','The public contract must declare distinct canonical HTTP(S) origins.');
  const capabilities=manifest.requiredObservationCapabilities===undefined?[]:manifest.requiredObservationCapabilities;
  if(!Array.isArray(capabilities)||capabilities.some(value=>typeof value!=='string'||!/^[a-z][a-z0-9_]*$/.test(value))||new Set(capabilities).size!==capabilities.length)throw new TargetSurfaceError('invalid_observation_capability','The public contract must declare distinct capability identifiers.');
  if(capabilities.length)throw new TargetSurfaceError('unsupported_observation_capability','The public contract requires an observation that this HTTP-only adapter cannot verify.',{unsupported:true});
  if(required.length===2&&required.includes(TARGET_ORIGIN)&&required.includes(HTTP_TRANSPORT_ORIGIN)) {
    if(auth!=='anonymous')throw new TargetSurfaceError('unsupported_authenticated_transport','The dual-transport adapter cannot verify authenticated HTTP behavior.',{unsupported:true});
    return {requiredOrigins:[...required],supportedOrigins:[...required],verified:false,adapter:'dual-http-transport'};
  }
  if(required.length===2&&required.includes(TARGET_ORIGIN)&&required.includes(HTTP_FORWARD_ORIGIN)) {
    if(auth!=='session')throw new TargetSurfaceError('unsupported_forwarded_transport_auth','The forwarded-transport adapter requires a verified fixture session.',{unsupported:true});
    return {requiredOrigins:[...required],supportedOrigins:[...required],verified:false,adapter:'dual-forwarded-transport'};
  }
  if(required.length===2&&required.includes(COOKIE_HTTPS_ORIGIN)&&required.includes(COOKIE_HTTP_ORIGIN)) {
    if(auth!=='session')throw new TargetSurfaceError('unsupported_cookie_transport_auth','The browser cookie-transport adapter requires a verified fixture session.',{unsupported:true});
    return {requiredOrigins:[...required],supportedOrigins:[...required],verified:false,adapter:'browser-cookie-transport'};
  }
  if(required.length===2&&required.includes(COOKIE_HTTPS_ORIGIN)&&required.includes(CORS_EVIL_ORIGIN)&&
     new URL(manifest.entry,COOKIE_HTTPS_ORIGIN).pathname===manifest.base+'/b3-account') {
    if(auth!=='session')throw new TargetSurfaceError('unsupported_cookie_domain_auth','The cookie-domain observation requires a verified fixture session.',{unsupported:true});
    if(!['GET '+manifest.base+'/b3-account','POST '+manifest.base+'/b3-account'].every(operation=>(manifest.requests||[]).some(request=>request.method+' '+request.path===operation)))
      throw new TargetSurfaceError('unsupported_cookie_domain_contract','The public contract lacks the normal account operations.',{unsupported:true});
    return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[COOKIE_HTTPS_ORIGIN],observationOrigins:[CORS_EVIL_ORIGIN],observationPath:'/b3-cookie-collector',verified:false,adapter:'browser-cookie-domain'};
  }
  if(required.length===2&&required.includes(COOKIE_HTTPS_ORIGIN)&&required.includes(COOKIE_EVIL_ORIGIN)&&
     new URL(manifest.entry,COOKIE_HTTPS_ORIGIN).pathname===manifest.base+'/b2-cookie-account') {
    if(auth!=='session')throw new TargetSurfaceError('unsupported_cookie_shadow_auth','The cookie-shadow observation requires a verified fixture session.',{unsupported:true});
    if(!['GET '+manifest.base+'/b2-cookie-account','GET '+manifest.base+'/b2-cookie-shadow'].every(operation=>(manifest.requests||[]).some(request=>request.method+' '+request.path===operation)))
      throw new TargetSurfaceError('unsupported_cookie_shadow_contract','The public contract lacks the normal account and sibling-host operations.',{unsupported:true});
    return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[COOKIE_HTTPS_ORIGIN],observationOrigins:[COOKIE_EVIL_ORIGIN],observationPaths:[manifest.base+'/login',manifest.base+'/b2-cookie-shadow'],verified:false,adapter:'browser-cookie-shadow'};
  }
  if(required.length===2&&required.includes(COOKIE_HTTPS_ORIGIN)&&required.includes(COOKIE_ATTACKER_ORIGIN)&&
     new URL(manifest.entry,COOKIE_HTTPS_ORIGIN).pathname===manifest.base+'/b2-profile') {
    if(auth!=='session')throw new TargetSurfaceError('unsupported_fresh_cookie_auth','The fresh-cookie browser observation requires a verified fixture session.',{unsupported:true});
    if(!['GET '+manifest.base+'/b2-profile','POST '+manifest.base+'/b2-profile','GET '+manifest.base+'/b2-cookie-account'].every(operation=>(manifest.requests||[]).some(request=>request.method+' '+request.path===operation)))
      throw new TargetSurfaceError('unsupported_fresh_cookie_contract','The public contract lacks the profile or account operations.',{unsupported:true});
    return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[COOKIE_HTTPS_ORIGIN],observationOrigins:[COOKIE_ATTACKER_ORIGIN],observationPath:'/b2-form',verified:false,adapter:'browser-fresh-cookie'};
  }
  const corsAuxiliaries=[CORS_PARTNER_ORIGIN,CORS_EVIL_ORIGIN,CORS_ALT_PORT_ORIGIN];
  const corsEntry=new URL(manifest.entry,COOKIE_HTTPS_ORIGIN).pathname;
  if(required.length>=2&&required.length<=3&&required.includes(COOKIE_HTTPS_ORIGIN)&&required.filter(value=>value!==COOKIE_HTTPS_ORIGIN).every(value=>corsAuxiliaries.includes(value))&&
     [manifest.base+'/v4-csrf',manifest.base+'/b2-report'].includes(corsEntry)) {
    if(auth!=='session')throw new TargetSurfaceError('unsupported_cors_allowlist_auth','The declared CORS report requires a verified fixture session.',{unsupported:true});
    const reportPath=corsEntry===manifest.base+'/b2-report'?corsEntry:corsEntry+'/report';
    if(!['GET '+corsEntry,'GET '+reportPath].every(operation=>(manifest.requests||[]).some(request=>request.method+' '+request.path===operation)))
      throw new TargetSurfaceError('unsupported_cors_allowlist_contract','The public contract lacks the normal report operations.',{unsupported:true});
    return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[COOKIE_HTTPS_ORIGIN],observationOrigins:required.filter(value=>value!==COOKIE_HTTPS_ORIGIN),observationPath:'/browser-csrf-fixture',verified:false,adapter:'browser-cors-allowlist'};
  }
  if(required.length===2&&required.includes(TARGET_ORIGIN)&&required.includes(COLLECTOR_ORIGIN)) {
    const entry=new URL(manifest.entry,TARGET_ORIGIN).pathname;
    if(entry===manifest.base+'/b2-css') {
      if(auth!=='session')throw new TargetSurfaceError('unsupported_css_collector_auth','The CSS preview requires a verified fixture session.',{unsupported:true});
      if(!(manifest.requests||[]).some(request=>request.method==='GET'&&request.path===entry))
        throw new TargetSurfaceError('unsupported_css_collector_contract','The public contract lacks the normal CSS preview operation.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-collect',verified:false,adapter:'browser-css-collector'};
    }
    if(entry===manifest.base+'/b2-report') {
      if(auth!=='session')throw new TargetSurfaceError('unsupported_cors_report_auth','The cross-origin report requires a verified fixture session.',{unsupported:true});
      if(!(manifest.requests||[]).some(request=>request.method==='GET'&&request.path===entry))
        throw new TargetSurfaceError('unsupported_cors_report_contract','The public contract lacks the normal report read.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-origin-page',verified:false,adapter:'browser-cors-report'};
    }
    if(entry===manifest.base+'/b2-cors-policy') {
      if(auth!=='session')throw new TargetSurfaceError('unsupported_cors_policy_auth','The CORS policy operation requires a verified fixture session.',{unsupported:true});
      if(!['GET '+entry,'POST '+entry,'GET '+manifest.base+'/b2-report'].every(operation=>(manifest.requests||[]).some(request=>request.method+' '+request.path===operation)))
        throw new TargetSurfaceError('unsupported_cors_policy_contract','The public contract lacks the normal policy and report operations.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-origin-page',verified:false,adapter:'browser-cors-policy'};
    }
    if(entry===manifest.base+'/b3-recover') {
      if(auth!=='anonymous')throw new TargetSurfaceError('unsupported_recovery_referer_auth','The recovery page requires an anonymous scanner profile.',{unsupported:true});
      if(!['POST '+entry,'GET '+manifest.base+'/b3-reset','POST '+manifest.base+'/b3-reset'].every(operation=>(manifest.requests||[]).some(request=>request.method+' '+request.path===operation)))
        throw new TargetSurfaceError('unsupported_recovery_referer_contract','The public contract lacks the normal recovery operations.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b3-pixel',verified:false,adapter:'browser-recovery-referer'};
    }
    if(entry===manifest.base+'/b2-signin') {
      if(auth!=='anonymous')throw new TargetSurfaceError('unsupported_login_origin_auth','The login operation requires an anonymous scanner profile.',{unsupported:true});
      if(manifest.login!==entry||!(manifest.requests||[]).some(request=>request.method==='GET'&&request.path===entry))
        throw new TargetSurfaceError('unsupported_login_origin_contract','The public contract lacks the normal login initiation.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-form',verified:false,adapter:'browser-login-origin'};
    }
    if(entry===manifest.base+'/b2-profile') {
      if(auth!=='session')throw new TargetSurfaceError('unsupported_profile_origin_auth','The cross-origin profile operation requires a verified fixture session.',{unsupported:true});
      if(!['GET','POST'].every(method=>(manifest.requests||[]).some(request=>request.method===method&&request.path===entry)))
        throw new TargetSurfaceError('unsupported_profile_origin_contract','The public contract lacks the normal profile operations.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPaths:['/b2-origin-page','/b2-form'],verified:false,adapter:'browser-profile-origin'};
    }
    if(entry===manifest.base+'/b2-transfer') {
      if(auth!=='session')throw new TargetSurfaceError('unsupported_form_destination_auth','The form destination operation requires a verified fixture session.',{unsupported:true});
      if(!(manifest.requests||[]).some(request=>request.method==='POST'&&request.path===manifest.base+'/b2-transfer-complete'))
        throw new TargetSurfaceError('unsupported_form_destination_contract','The public contract lacks the normal transfer operation.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-collect',verified:false,adapter:'browser-form-destination'};
    }
    if(entry===manifest.base+'/b2-message-hub') {
      if(auth!=='session')throw new TargetSurfaceError('unsupported_message_auth','The message boundary operation requires a verified fixture session.',{unsupported:true});
      if(!(manifest.requests||[]).some(request=>request.method==='GET'&&request.path===manifest.base+'/b2-message-client'))
        throw new TargetSurfaceError('unsupported_message_contract','The public contract lacks the normal same-origin message client.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-origin-page',verified:false,adapter:'browser-message-boundary'};
    }
    if(entry===manifest.base+'/b2-approval') {
      if(auth!=='session')throw new TargetSurfaceError('unsupported_frame_approval_auth','The framed approval operation requires a verified fixture session.',{unsupported:true});
      if(!['GET','POST'].every(method=>(manifest.requests||[]).some(request=>request.method===method&&request.path===entry)))
        throw new TargetSurfaceError('unsupported_frame_approval_contract','The public contract lacks the normal approval operations.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-frame',verified:false,adapter:'browser-frame-approval'};
    }
    if(entry===manifest.base+'/b2-external') {
      if(auth!=='anonymous')throw new TargetSurfaceError('unsupported_external_window_auth','The external window operation requires an anonymous scanner profile.',{unsupported:true});
      if(!(manifest.requests||[]).some(request=>request.method==='GET'&&request.path===manifest.base+'/b2-link-home'))
        throw new TargetSurfaceError('unsupported_external_window_contract','The public contract lacks the normal linked page.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-linked-screen',verified:false,adapter:'browser-external-window'};
    }
    if(entry===manifest.base+'/b2-jsonp-panel') {
      if(auth!=='anonymous')throw new TargetSurfaceError('unsupported_jsonp_auth','The JSONP browser operation requires an anonymous scanner profile.',{unsupported:true});
      if(!(manifest.requests||[]).some(request=>request.method==='GET'&&request.path===manifest.base+'/b2-notice-data'))
        throw new TargetSurfaceError('unsupported_jsonp_contract','The public contract lacks the normal same-origin notice data.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-jsonp',verified:false,adapter:'browser-jsonp-csp'};
    }
    if([manifest.base+'/b2-resource',manifest.base+'/b2-named'].includes(entry)) {
      if(auth!=='anonymous')throw new TargetSurfaceError('unsupported_resource_auth','The resource switch browser operation requires an anonymous scanner profile.',{unsupported:true});
      if(!(manifest.requests||[]).some(request=>request.method==='GET'&&request.path===manifest.base+'/b2-standard.js'))
        throw new TargetSurfaceError('unsupported_resource_contract','The public contract lacks the normal same-origin resource.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-resource.js',verified:false,adapter:'browser-resource-switch'};
    }
    if(entry===manifest.base+'/b2-library') {
      if(auth!=='session')throw new TargetSurfaceError('unsupported_library_auth','The library integrity browser operation requires a verified fixture session.',{unsupported:true});
      const fixture=manifest.base+'/b2-library-fixture';
      if(!['GET','POST'].every(method=>(manifest.requests||[]).some(request=>request.method===method&&request.path===fixture)))
        throw new TargetSurfaceError('unsupported_library_contract','The public contract lacks the normal library fixture operations.',{unsupported:true});
      return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-library.js',verified:false,adapter:'browser-library-integrity'};
    }
    const endpoint=manifest.auxiliaryRequests;
    if(!Array.isArray(endpoint)||endpoint.length!==1||endpoint[0]?.method!=='POST'||endpoint[0]?.origin!==COLLECTOR_ORIGIN||endpoint[0]?.path!=='/collect-events'||Object.keys(endpoint[0]).length!==3)
      throw new TargetSurfaceError('unsupported_collector_contract','The auxiliary origin is not the fixed public event collector contract.',{unsupported:true});
    if(![manifest.base+'/login-analytics',manifest.base+'/error-reporting'].includes(entry))
      throw new TargetSurfaceError('unsupported_collector_entry','The public entry has no verified browser operation for this collector.',{unsupported:true});
    const expectedAuth=entry.endsWith('/login-analytics')?'anonymous':'session';
    if(auth!==expectedAuth)throw new TargetSurfaceError('unsupported_collector_auth','The collector browser operation requires '+expectedAuth+' authentication.',{unsupported:true});
    return {requiredOrigins:[...required],supportedOrigins:[...required],scanOrigins:[TARGET_ORIGIN],observationOrigins:[COLLECTOR_ORIGIN],verified:false,adapter:'browser-event-collector'};
  }
  if(required.some(value=>value!==TARGET_ORIGIN))throw new TargetSurfaceError('unsupported_target_surface','The public contract requires a target origin that this HTTPS-only adapter cannot exercise.',{unsupported:true});
  return {requiredOrigins:[...required],supportedOrigins:[TARGET_ORIGIN],verified:true};
}
export function options(env) {
  const profile=env.SCAN_PROFILE||'baseline';
  if(!SCAN_PROFILES.includes(profile))throw new Error('Profile must be baseline, active or active-low.');
  const auth=env.SCAN_AUTH||'anonymous';
  if(!['anonymous','session','bearer'].includes(auth))throw new Error('SCAN_AUTH must be anonymous, session or bearer.');
  const user=env.SCAN_USER||'alice';
  if(!['alice','bob','carol','approver','admin'].includes(user))throw new Error('SCAN_USER must name a declared fixture subject.');
  function integer(name,fallback,min,max) {
    const raw=env[name]||String(fallback);
    if(!/^\d+$/.test(raw)||Number(raw)<min||Number(raw)>max)throw new Error(`${name} must be ${min}..${max}.`);
    return Number(raw);
  }
  const concurrency=integer('SCAN_CONCURRENCY',2,2,8);
  if(![2,4,6,8].includes(concurrency))throw new Error('SCAN_CONCURRENCY must be 2, 4, 6, or 8.');
  return {profile,auth,user,seconds:integer('SCAN_SECONDS',120,10,1200),requests:integer('SCAN_REQUEST_BUDGET',300,10,10000),concurrency};
}
export function publicScope(manifest,{origin=TARGET_ORIGIN}={}) {
  if(!/^\/w\/[a-f0-9]{12}$/.test(manifest.base))throw new Error('Unsupported public workspace path.');
  if(![TARGET_ORIGIN,HTTP_TRANSPORT_ORIGIN,HTTP_FORWARD_ORIGIN,COOKIE_HTTPS_ORIGIN,COOKIE_HTTP_ORIGIN,CORS_PARTNER_ORIGIN,CORS_EVIL_ORIGIN,COOKIE_EVIL_ORIGIN,CORS_ALT_PORT_ORIGIN].includes(origin))throw new Error('Unsupported local target origin.');
  const prefix=origin+manifest.base;
  const isAllowed=value=>{
    try {const url=new URL(value,origin);return url.origin===origin&&!url.username&&!url.password&&(url.pathname===manifest.base||url.pathname.startsWith(manifest.base+'/'));}catch{return false;}
  };
  if(!isAllowed(manifest.entry)||!isAllowed(manifest.openapi))throw new Error('Manifest entry/schema is outside the public workspace.');
  const regex='^'+prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:/.*|\\?.*|$)';
  return {origin,prefix,regex,isAllowed,entry:new URL(manifest.entry,origin).href,openapi:new URL(manifest.openapi,origin).href};
}
export function entryPost(manifest,scope) {
  const entryPath=new URL(scope.entry).pathname;
  return (manifest.requests||[]).find(request=>request.method==='POST'&&scope.isAllowed(request.path)&&new URL(request.path,scope.origin).pathname===entryPath);
}
export function seedUrls(manifest,scope,{auth='anonymous'}={}) {
  const seeds=[scope.entry,scope.openapi];
  for(const r of manifest.requests||[]) {
    if(r.method!=='GET'||!scope.isAllowed(r.path)||auth!=='anonymous'&&authStatePath(r.path,manifest))continue;
    const value=r.path.replace(/\{([^}]+)\}/g,(_,name)=>encodeURIComponent(r.pathValues?.[name]??''));
    if(/\{/.test(value))continue;
    const url=new URL(value,scope.origin);
    for(const [k,v] of Object.entries(r.values||{})) {
      if(['from-connect','from-idp','from-session','supplied-by-own-inbox'].includes(String(v)))continue;
      url.searchParams.set(k,String(v));
    }
    if(scope.isAllowed(url.href))seeds.push(url.href);
  }
  return [...new Set(seeds)].filter(url=>auth==='anonymous'||!authStatePath(new URL(url).pathname,manifest));
}
export function authStatePath(path,manifest={}) {
  return [manifest.login,manifest.logout].filter(Boolean).includes(path)||/\/(?:login|logout|signin|signout|connect|callback|idp\/authorize)$/.test(path);
}
// A successful fixture example that promotes the current session would change
// the scanner's authenticated subject merely by importing the OpenAPI file.
// Use the public normal-operation contract, never the private arm or oracle.
export function identityChangingExamples(manifest) {
  return (manifest.requests||[]).filter(request=>
    request.method==='POST'&&request.values?.operation==='elevate'&&
    typeof request.values?.adminPassword==='string'&&request.values.adminPassword.length>0
  ).map(request=>({method:'post',path:request.path}));
}
// No configured login in the anonymous smoke profile. Imported POSTs cannot use
// the supplied successful fixture credentials to silently authenticate ZAP.
export function anonymousSchema(input,scope,{auth='anonymous',manifest={}}={}) {
  const result=structuredClone(input);result.servers=[{url:scope.origin}];result.paths={};
  const unsafe=auth==='anonymous'?[]:identityChangingExamples(manifest);
  for(const [path,methods]of Object.entries(input.paths||{})) {
    if(!scope.isAllowed(path))continue;
    if(auth!=='anonymous'&&authStatePath(path,manifest))continue;
    const filtered={};
    for(const [method,operation]of Object.entries(methods)) {
      if(!['get','post','put','patch','delete','head','options'].includes(method))continue;
      if(method!=='get'&&/\/(?:login|logout|signin|signout|idp\/authorize)$/.test(path))continue;
      if(unsafe.some(request=>request.method===method&&request.path===path))continue;
      filtered[method]=structuredClone(operation);
    }
    if(Object.keys(filtered).length)result.paths[path]=filtered;
  }
  return result;
}
