import {writeFile,unlink,chmod} from 'node:fs/promises';
import {authStatePath} from './policy.mjs';

export class AuthenticationError extends Error {
  constructor(code,message,{unsupported=false}={}) {super(message);this.code=code;this.unsupported=unsupported;}
}
const fail=(code,message,unsupported=false)=>{throw new AuthenticationError(code,message,{unsupported});};
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function authenticationPlan(manifest,settings,scope) {
  if(settings.auth==='anonymous')return {mode:'anonymous'};
  if(authStatePath(new URL(scope.entry).pathname,manifest))fail('unsupported_auth_entry','The feature entry is a login or identity-changing flow excluded from this authenticated profile.',true);
  const profile=(manifest.roleProfiles||[]).find(value=>value.username===settings.user)||
    (manifest.credentials?.username===settings.user?manifest.credentials:null);
  if(!profile||typeof profile.password!=='string'||!profile.password||/[\r\n]/.test(profile.username))fail('unsupported_fixture_subject','No normal credentials exist for the selected fixture subject.',true);
  const session=(manifest.requests||[]).find(value=>value.method==='GET'&&value.path===manifest.base+'/session');
  if(!scope.isAllowed(manifest.login)||!session)fail('unsupported_auth_contract','The manifest lacks a scoped normal login/session contract.',true);
  const plan={mode:settings.auth,subject:profile.username,role:profile.role||'unspecified',credentials:{username:profile.username,password:profile.password},login:new URL(manifest.login,scope.origin).href,session:new URL(session.path,scope.origin).href};
  if(settings.auth==='session') {
    const declared=manifest.authentication?.sessionProtectedOperation;
    if(declared!==undefined&&(!declared||declared.method!=='GET'||typeof declared.path!=='string'||!scope.isAllowed(declared.path)||(manifest.requests||[]).every(value=>value.method!=='GET'||value.path!==declared.path)))fail('unsupported_protected_contract','The declared protected operation is not a scoped normal GET.',true);
    const protectedRequest=declared||(manifest.requests||[]).find(value=>value.method==='GET'&&/\/(?:documents\/[^/]+|profile|integration-data|access-pass|token)$/.test(value.path)&&scope.isAllowed(value.path));
    if(protectedRequest) {
      const path=protectedRequest.path.replace(/\{([^}]+)\}/g,(_,name)=>encodeURIComponent(protectedRequest.pathValues?.[name]??''));
      if(scope.isAllowed(path))plan.protectedUrl=new URL(path,scope.origin).href;
    }
  }
  if(settings.auth==='bearer') {
    const extraction=/^GET ([a-zA-Z0-9_/-]+) -> token$/.exec(manifest.extractions?.bearer||'');
    if(!extraction)fail('unsupported_token_contract','The public manifest has no supported bearer extraction contract.',true);
    const path=extraction[1].startsWith('/')?extraction[1]:manifest.base+'/'+extraction[1];
    const tokenRequest=(manifest.requests||[]).find(value=>value.method==='GET'&&value.path===path);
    const protectedRequest=(manifest.requests||[]).find(value=>value.method==='GET'&&/\/(?:member-api|account-report)$/.test(value.path)&&scope.isAllowed(value.path));
    if(!tokenRequest||!protectedRequest||!scope.isAllowed(path))fail('unsupported_bearer_operation','No declared token issuer and supported normal bearer operation are available.',true);
    plan.tokenUrl=new URL(path,scope.origin).href;
    plan.protectedUrl=new URL(protectedRequest.path,scope.origin).href;
  }
  return plan;
}
export function messageFrom(value,name) {
  const message=value[name]?.[0]||value.messages?.[0];
  if(!message||typeof message.responseHeader!=='string'||typeof message.requestHeader!=='string')fail('auth_http_unavailable','ZAP did not return an authentication HTTP message.');
  const match=/^HTTP\/\S+\s+(\d+)/.exec(message.responseHeader);
  if(!match)fail('auth_http_invalid','ZAP returned an invalid authentication HTTP status.');
  return {...message,status:Number(match[1])};
}
export function jsonBody(message) {
  let value;try{value=JSON.parse(message.responseBody);}catch{fail('auth_json_invalid','An authentication endpoint did not return valid JSON.');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail('auth_json_invalid','An authentication endpoint did not return a JSON object.');
  return value;
}
export function sessionCookie(message) {
  const found=[...message.responseHeader.matchAll(/^set-cookie:[ \t]*sid=([^;\r\n]*)(?:;|\r?$)/gim)];
  if(found.length!==1||!/^[a-f0-9]{48}$/.test(found[0][1]))fail('auth_cookie_missing','Normal login did not issue exactly one supported fixture session cookie.');
  return 'sid='+found[0][1];
}
export function requestHeader(message,name) {
  const match=new RegExp('^'+escapeRegex(name)+':[ \\t]*([^\\r\\n]*)','im').exec(message.requestHeader);
  return match?.[1]??null;
}
export function authenticationScript(scopeRegex,{cookie,bearer}) {
  // Values remain inside the temporary ZAP input volume and in memory only.
  return `var selectedWorkspace = Java.type('java.util.regex.Pattern').compile(${JSON.stringify(scopeRegex)});\nvar fixtureCookie = ${JSON.stringify(cookie||null)};\nvar fixtureBearer = ${JSON.stringify(bearer||null)};\nfunction sendingRequest(msg, initiator, helper) {\n  var headers = msg.getRequestHeader();\n  if (!selectedWorkspace.matcher(String(headers.getURI().toString())).matches()) return;\n  if (fixtureCookie && headers.getHeader('Cookie') === null) headers.setHeader('Cookie', fixtureCookie);\n  if (fixtureBearer && headers.getHeader('Authorization') === null) headers.setHeader('Authorization', fixtureBearer);\n}\nfunction responseReceived(msg, initiator, helper) {}\n`;
}
export function rawRequest(url,{method='GET',headers={},body}={}) {
  const parsed=new URL(url);
  if(!['GET','POST'].includes(method)||Object.entries(headers).some(([k,v])=>! /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k)||/[\r\n]/.test(String(v))))fail('auth_request_invalid','Invalid authentication request shape.');
  const content=body===undefined?'':JSON.stringify(body);
  return method+' '+parsed.href+' HTTP/1.1\r\nHost: '+parsed.host+'\r\n'+
    Object.entries(headers).map(([k,v])=>k+': '+v+'\r\n').join('')+
    (body===undefined?'':'Content-Type: application/json\r\nContent-Length: '+Buffer.byteLength(content)+'\r\n')+'\r\n'+content;
}
export async function establishAuthentication({plan,scope,api,ensureBudget,onSecret=()=>{},onProgress=()=>{},inputDirectory='/scan-input'}) {
  const scriptName='benchmark-auth-missing-headers';
  const fileName=inputDirectory+'/auth-headers.js';
  let cookie,bearer,loaded=false;
  const summary={configuredAuthentication:plan.mode,subject:null,credentialsReplayed:false,identityVerified:false,protectedOperationVerified:false,protectedRoutes:'not assessed',headerPolicy:'add only when absent; preserve present diagnostic header values',selfChecks:{}};
  if(plan.mode==='anonymous')return {summary:{...summary,configuredAuthentication:'none',headerPolicy:'none'},verify:async()=>{},cleanup:async()=>{}};
  summary.subject=plan.subject;summary.fixtureRole=plan.role;
  onProgress(summary);
  async function get(url) {
    if(!scope.isAllowed(url))fail('auth_scope_violation','An authentication request is outside the selected public workspace.');
    await ensureBudget();return messageFrom(await api('core','action','accessUrl',{url,followRedirects:false}),'accessUrl');
  }
  async function send(url,options={}) {
    if(!scope.isAllowed(url))fail('auth_scope_violation','An authentication request is outside the selected public workspace.');
    await ensureBudget();return messageFrom(await api('core','action','sendRequest',{request:rawRequest(url,options),followRedirects:false}),'sendRequest');
  }
  async function load() {
    if(loaded){await api('script','action','disable',{scriptName});await api('script','action','remove',{scriptName});loaded=false;}
    await writeFile(fileName,authenticationScript(scope.regex,{cookie,bearer}),{mode:0o600});
    // ZAP's non-root user reads the shared input volume. The directory is not
    // published and contains no operator/control key.
    await chmod(fileName,0o644);
    await api('script','action','load',{scriptName,scriptType:'httpsender',scriptEngine:'Graal.js',fileName,scriptDescription:'Supply missing fixture headers in the selected workspace',charset:'UTF-8'});
    loaded=true;await api('script','action','enable',{scriptName});
  }
  async function identity() {
    const response=await get(plan.session);
    if(response.status!==200||jsonBody(response).username!==plan.subject||requestHeader(response,'Cookie')!==cookie)fail('auth_identity_mismatch','ZAP did not retain the selected authenticated fixture identity.');
    summary.identityVerified=true;
    summary.lastVerifiedAt=new Date().toISOString();
  }
  async function protectedAccess() {
    const response=await get(plan.protectedUrl);
    if(response.status===403)fail(plan.mode==='bearer'?'unsupported_bearer_role':'unsupported_session_role','The selected valid fixture role cannot reach the normal protected operation.',true);
    if(response.status!==200||plan.mode==='bearer'&&requestHeader(response,'Authorization')!==bearer||plan.mode==='session'&&requestHeader(response,'Cookie')!==cookie)fail('auth_protected_unreachable','ZAP did not reach the normal protected operation.');
    if(plan.mode==='bearer') {
      const body=jsonBody(response);
      if(Object.hasOwn(body,'username')&&body.username!==plan.subject)fail('auth_identity_mismatch','The protected bearer operation returned a different fixture identity.');
    }
    summary.protectedRoutes={path:new URL(plan.protectedUrl).pathname,status:response.status,verified:true};
    summary.protectedOperationVerified=true;
  }
  async function cleanup() {
    try {if(loaded){await api('script','action','disable',{scriptName});await api('script','action','remove',{scriptName});loaded=false;}}
    finally {try{await unlink(fileName);}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  try {
    const login=await send(plan.login,{method:'POST',body:plan.credentials});
    if(login.status!==200)fail('auth_login_failed','Normal fixture login did not succeed.');
    cookie=sessionCookie(login);onSecret(cookie);onSecret(cookie.slice(4));summary.credentialsReplayed=true;
    await load();await identity();
    const invalidCookie='sid=fixture-invalid';
    const cookieProbe=await send(plan.session,{headers:{Cookie:invalidCookie}});
    if(requestHeader(cookieProbe,'Cookie')!==invalidCookie||cookieProbe.status!==200||jsonBody(cookieProbe).username)fail('auth_cookie_overwrite','The diagnostic Cookie self-check was overwritten or unexpectedly authenticated.');
    summary.selfChecks.presentCookiePreserved=true;
    await identity();
    if(plan.mode==='session'&&plan.protectedUrl)await protectedAccess();
    if(plan.mode==='bearer') {
      const issued=await get(plan.tokenUrl);
      if(issued.status!==200)fail('auth_token_failed','The declared public token issuer was not reachable with the selected session.');
      const token=jsonBody(issued).token;
      if(typeof token!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))fail('unsupported_token_shape','The public issuer did not return a supported signed fixture JWT.',true);
      onSecret(token);
      const claims=jsonBody({responseBody:Buffer.from(token.split('.')[1],'base64url').toString('utf8')});
      if(claims.sub!==plan.subject)fail('auth_identity_mismatch','The public issuer returned a bearer token for a different fixture identity.');
      bearer='Bearer '+token;onSecret(token);onSecret(bearer);await load();
      await protectedAccess();
      const invalidBearer='Bearer fixture-invalid';
      const bearerProbe=await send(plan.protectedUrl,{headers:{Authorization:invalidBearer}});
      if(requestHeader(bearerProbe,'Authorization')!==invalidBearer||bearerProbe.status!==401)fail('auth_bearer_overwrite','The diagnostic bearer self-check was overwritten or unexpectedly authorized.');
      summary.selfChecks.presentAuthorizationPreserved=true;
      await protectedAccess();
    }
    return {summary,verify:async()=>{await identity();if(plan.protectedUrl)await protectedAccess();},fixtureCookie:()=>cookie,cleanup};
  } catch(error) {
    try{await cleanup();}catch{ /* The outer container cleanup remains authoritative. */ }
    throw error;
  }
}
