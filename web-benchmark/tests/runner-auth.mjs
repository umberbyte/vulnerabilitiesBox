import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {
  AuthenticationError,authenticationPlan,authenticationScript,establishAuthentication,
  jsonBody,messageFrom,rawRequest,requestHeader,sessionCookie
} from '../src/runner/auth.mjs';
import {publicScope} from '../src/runner/policy.mjs';

const base='/w/123456abcdef';
const fixturePassword='test-password-private';
const manifest={
  base,entry:base+'/profile',openapi:base+'/openapi.json',login:base+'/login',
  credentials:{username:'alice',password:fixturePassword},
  roleProfiles:[{username:'alice',password:fixturePassword,role:'user'},{username:'admin',password:'admin-fixture-password',role:'admin'}],
  requests:[{method:'GET',path:base+'/session'},{method:'GET',path:base+'/token'},{method:'GET',path:base+'/member-api'}],
  extractions:{bearer:'GET '+base+'/token -> token'}
};
const scope=publicScope(manifest);
const makePlan=(auth='session',user='alice',input=manifest)=>authenticationPlan(input,{auth,user},publicScope(input));
const errorIs=(code,unsupported=false)=>error=>error instanceof AuthenticationError&&error.code===code&&error.unsupported===unsupported;
const validSid='a'.repeat(48);
const fixtureToken='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.c2lnbmF0dXJl';

test('Declared sibling-host cookie account uses its dedicated cookie for scanner authentication',()=>{
  const entry=base+'/b3-account';
  const input={...manifest,entry,login:base+'/b3-signin',requests:[{method:'GET',path:entry},{method:'POST',path:entry}],requiredTargetOrigins:['https://app.benchmark.test:8443','https://evil.benchmark.test:8444']};
  const plan=authenticationPlan(input,{auth:'session',user:'alice'},publicScope(input,{origin:'https://app.benchmark.test:8443'}));
  assert.equal(plan.cookieName,'pb_auth');
  assert.equal(plan.session,'https://app.benchmark.test:8443'+entry);
  assert.equal(plan.protectedUrl,plan.session);
  assert.equal(plan.invalidCookieStatus,401);
});

function scriptContext(source) {
  const context=vm.createContext({Java:{type(name){
    assert.equal(name,'java.util.regex.Pattern');
    return {compile(pattern){
      const expression=new RegExp('^(?:'+pattern+')$');
      return {matcher(value){return {matches:()=>expression.test(String(value))};}};
    }};
  }}});
  vm.runInContext(source,context,{timeout:1000});
  return context;
}
function requestMessage(url,initial={}) {
  const values=new Map(Object.entries(initial).map(([name,value])=>[name.toLowerCase(),{name,value}]));
  const headers={
    getURI:()=>({toString:()=>url}),
    getHeader:name=>values.get(name.toLowerCase())?.value??null,
    setHeader(name,value){values.set(name.toLowerCase(),{name,value});}
  };
  return {
    getRequestHeader:()=>headers,
    text:()=> 'GET '+url+' HTTP/1.1\r\n'+[...values.values()].map(({name,value})=>name+': '+value+'\r\n').join('')+'\r\n',
    value:name=>headers.getHeader(name)
  };
}
function response(body={},request='GET https://app:8443'+base+'/session HTTP/1.1\r\n\r\n',status=200,additional='') {
  return {requestHeader:request,responseHeader:'HTTP/1.1 '+status+' Test\r\n'+additional+'\r\n',responseBody:JSON.stringify(body)};
}

test('Anonymous auth does not require, read or return fixture credentials',()=>{
  const plan=authenticationPlan({}, {auth:'anonymous',user:'alice'},scope);
  assert.deepEqual(plan,{mode:'anonymous'});
});

test('Normal subject selection uses declared roles and preserves the supplied manifest',()=>{
  const original=structuredClone(manifest);
  const plan=makePlan('session','admin');
  assert.equal(plan.subject,'admin');assert.equal(plan.role,'admin');
  assert.equal(plan.credentials.password,'admin-fixture-password');
  assert.equal(plan.login,scope.origin+base+'/login');
  assert.equal(plan.session,scope.origin+base+'/session');
  assert.deepEqual(manifest,original);
  const fallback=makePlan('session','alice',{...manifest,roleProfiles:[]});
  assert.equal(fallback.role,'unspecified');assert.equal(fallback.credentials.password,fixturePassword);
});

test('Undeclared or unusable subjects fail with a nonsecret unsupported reason',()=>{
  assert.throws(()=>makePlan('session','carol'),errorIs('unsupported_fixture_subject',true));
  assert.throws(()=>makePlan('session','alice',{...manifest,roleProfiles:[{username:'alice',password:''}]}),errorIs('unsupported_fixture_subject',true));
});

test('Login/session contract requires the selected public workspace',()=>{
  for(const login of ['http://app:8099/manifest','https://app:8444/login','https://evil.test/login',scope.origin+'/w/ffffffffffff/login',scope.origin+base+'/../login']) {
    assert.throws(()=>makePlan('session','alice',{...manifest,login}),errorIs('unsupported_auth_contract',true));
  }
  assert.throws(()=>makePlan('session','alice',{...manifest,requests:manifest.requests.filter(r=>!r.path.endsWith('/session'))}),errorIs('unsupported_auth_contract',true));
});

test('Session reachability accepts only declared normal GETs in the selected workspace',()=>{
  const path=base+'/member-card';
  const declared={...manifest,requests:[...manifest.requests,{method:'GET',path}],authentication:{sessionProtectedOperation:{method:'GET',path}}};
  assert.equal(makePlan('session','alice',declared).protectedUrl,scope.origin+path);
  for(const operation of [{method:'POST',path},{method:'GET',path:base+'/undeclared'},{method:'GET',path:'http://app:8099/oracle'},{method:'GET',path:'/w/ffffffffffff/member-card'}])assert.throws(()=>makePlan('session','alice',{...declared,authentication:{sessionProtectedOperation:operation}}),errorIs('unsupported_protected_contract',true));
});

test('Bearer extraction uses declared, scoped token and normal protected operations',()=>{
  const plan=makePlan('bearer');
  assert.equal(plan.tokenUrl,scope.origin+base+'/token');
  assert.equal(plan.protectedUrl,scope.origin+base+'/member-api');
  const relative=makePlan('bearer','alice',{...manifest,extractions:{bearer:'GET token -> token'}});
  assert.equal(relative.tokenUrl,plan.tokenUrl);
  for(const bearer of ['', 'POST '+base+'/token -> token','GET '+base+'/token -> access_token','GET https://evil.test/token -> token']) {
    assert.throws(()=>makePlan('bearer','alice',{...manifest,extractions:{bearer}}),errorIs('unsupported_token_contract',true));
  }
  assert.throws(()=>makePlan('bearer','alice',{...manifest,extractions:{bearer:'GET /oracle -> token'}}),errorIs('unsupported_bearer_operation',true));
  assert.throws(()=>makePlan('bearer','alice',{...manifest,requests:manifest.requests.filter(r=>!r.path.endsWith('/member-api'))}),errorIs('unsupported_bearer_operation',true));
});

test('Authentication HTTP envelopes require a real response and accept the alternate message envelope',()=>{
  const message=response({username:'alice'});
  assert.equal(messageFrom({accessUrl:[message]},'accessUrl').status,200);
  assert.equal(messageFrom({messages:[message]},'sendRequest').status,200);
  assert.throws(()=>messageFrom({},'accessUrl'),errorIs('auth_http_unavailable'));
  assert.throws(()=>messageFrom({accessUrl:[{...message,responseHeader:'not-an-http-status'}]},'accessUrl'),errorIs('auth_http_invalid'));
});

test('Malformed JSON/status errors do not echo credential or token contents',()=>{
  const secret='private-token-that-must-not-appear';
  for(const action of [()=>jsonBody({responseBody:secret}),()=>messageFrom({accessUrl:[response({},undefined,200)] .map(m=>({...m,responseHeader:secret}))},'accessUrl')]) {
    assert.throws(action,error=>error instanceof AuthenticationError&&!error.message.includes(secret)&&!error.stack.includes(secret));
  }
  assert.deepEqual(jsonBody({responseBody:'{"username":"alice"}'}),{username:'alice'});
});

test('Fixture cookie parsing accepts exactly one supported sid and ignores unrelated cookies',()=>{
  const message=response({},undefined,200,'Set-Cookie: theme=dark; Path=/\r\nSeT-CoOkIe: sid='+validSid+'; Path=/; Secure\r\n');
  assert.equal(sessionCookie(message),'sid='+validSid);
  assert.equal(sessionCookie(response({},undefined,200,'Set-Cookie: pb_auth='+validSid+'; Domain=benchmark.test; Path=/; Secure\r\n'),'pb_auth'),'pb_auth='+validSid);
  for(const extra of [
    '',
    'Set-Cookie: sid=short; Path=/\r\n',
    'Set-Cookie: sid='+validSid+'; Path=/\r\nSet-Cookie: sid='+validSid+'; Path=/\r\n',
    'Set-Cookie: sid='+validSid+'; Path=/\r\nSet-Cookie: sid=malformed; Path=/\r\n'
  ])assert.throws(()=>sessionCookie(response({},undefined,200,extra)),errorIs('auth_cookie_missing'));
});
test('Dedicated browser cookie authentication uses the public login and account contract',()=>{
  const entry=base+'/b2-cookie-account';
  const supplied={...manifest,entry,login:base+'/b2-cookie-signin',requiredTargetOrigins:['https://app.benchmark.test:8443','http://app.benchmark.test:8080'],requests:[{method:'GET',path:entry},{method:'GET',path:base+'/b2-cookie-observation'}]};
  const plan=authenticationPlan(supplied,{auth:'session',user:'alice'},publicScope(supplied,{origin:'https://app.benchmark.test:8443'}));
  assert.equal(plan.cookieName,'memberSession');
  assert.equal(plan.invalidCookieStatus,401);
  assert.equal(plan.session,'https://app.benchmark.test:8443'+entry);
  assert.equal(plan.protectedUrl,plan.session);
  const message=response({},undefined,200,'Set-Cookie: memberSession='+validSid+'; Path=/; SameSite=Lax\r\n');
  assert.equal(sessionCookie(message,'memberSession'),'memberSession='+validSid);
  assert.throws(()=>sessionCookie(message,'sid'),errorIs('auth_cookie_missing'));
});

test('Header inspection is case insensitive and preserves explicit empty values',()=>{
  const message={requestHeader:'GET / HTTP/1.1\r\ncOoKiE: sid=custom\r\nAuthorization:\r\nHost: app:8443\r\n\r\n'};
  assert.equal(requestHeader(message,'Cookie'),'sid=custom');
  assert.equal(requestHeader(message,'Authorization'),'');
  assert.equal(requestHeader(message,'X-Not-Present'),null);
});

test('Raw login requests JSON-encode bodies and calculate UTF-8 byte lengths',()=>{
  const body={username:'利用者',password:'quoted"value\r\nsecond-line'};
  const encoded=rawRequest(scope.origin+base+'/login',{method:'POST',body});
  const [header,content]=encoded.split('\r\n\r\n');
  assert.equal(header.split('\r\n')[0],'POST '+scope.origin+base+'/login HTTP/1.1');
  assert.match(header,/Host: app:8443\r\n/);
  assert.match(header,new RegExp('Content-Length: '+Buffer.byteLength(content)+'$'));
  assert.deepEqual(JSON.parse(content),body);
  assert.ok(!header.includes(body.password));
  assert.ok(!content.includes('\r\n'));
});

test('Header CRLF and unsupported HTTP methods are rejected without secret reflection',()=>{
  const secret='private-token-with\r\ninjection';
  for(const options of [{headers:{Authorization:secret}},{headers:{'X-Bad\r\nInjected':'value'}},{method:'DELETE'}]) {
    assert.throws(()=>rawRequest(scope.origin+base+'/session',options),error=>errorIs('auth_request_invalid')(error)&&!error.message.includes('private-token'));
  }
});

test('Generated HttpSender supplies missing headers for all selected-workspace initiators',()=>{
  const source=authenticationScript(scope.regex,{cookie:'sid='+validSid,bearer:'Bearer '+fixtureToken});
  const context=scriptContext(source);
  for(const initiator of [1,2,3,5,6,10,14,15]) {
    const message=requestMessage(scope.origin+base+'/member-api?normal=1');
    context.sendingRequest(message,initiator,{});
    assert.equal(message.value('Cookie'),'sid='+validSid);
    assert.equal(message.value('Authorization'),'Bearer '+fixtureToken);
    assert.doesNotThrow(()=>context.responseReceived(message,initiator,{}));
  }
});

test('Generated HttpSender preserves invalid, empty and differently cased diagnostic headers',()=>{
  const context=scriptContext(authenticationScript(scope.regex,{cookie:'sid='+validSid,bearer:'Bearer '+fixtureToken}));
  for(const initial of [
    {Cookie:'sid=fixture-invalid',Authorization:'Bearer modified.JWT.invalid'},
    {Cookie:'',Authorization:''},
    {cOoKiE:'other=value; sid=diagnostic',aUtHoRiZaTiOn:'Bearer changed'},
    {Cookie:'unrelated=value'}
  ]) {
    const message=requestMessage(scope.origin+base+'/member-api',initial);
    context.sendingRequest(message,2,{});
    for(const [name,value]of Object.entries(initial))assert.equal(message.value(name),value);
  }
});

test('Generated HttpSender rejects control, other origins and neighboring workspace prefixes',()=>{
  const context=scriptContext(authenticationScript(scope.regex,{cookie:'sid='+validSid,bearer:'Bearer '+fixtureToken}));
  for(const url of [
    'http://app:8099/manifest','https://app:8444'+base+'/attack','http://app:8080'+base+'/session',
    'https://evil.test'+base+'/session',scope.origin+'/w/ffffffffffff/session',scope.origin+base+'extra/session',scope.origin+'/session'
  ]) {
    const message=requestMessage(url);context.sendingRequest(message,6,{});
    assert.equal(message.value('Cookie'),null,url);assert.equal(message.value('Authorization'),null,url);
  }
});

test('Script embedding handles quotes/backslashes without executing injected script text',()=>{
  const cookie='sid=quote"\\; value=\'literal';
  const context=scriptContext(authenticationScript(scope.regex,{cookie,bearer:null}));
  const message=requestMessage(scope.origin+base+'/session');context.sendingRequest(message,6,{});
  assert.equal(message.value('Cookie'),cookie);assert.equal(message.value('Authorization'),null);
});

async function fakeZap(t,{protectedStatus=200,invalidJson=false,badIdentity=false}={}) {
  const temporary=await mkdtemp(join(tmpdir(),'benchmark-runner-auth-'));
  // Only remove the exact mkdtemp directory beneath the intended temporary root.
  assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));
  assert.ok(basename(temporary).startsWith('benchmark-runner-auth-'));
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  const calls=[];let loadedScript=null,enabled=false;
  function mutate(raw) {
    const lines=raw.split('\r\n');const first=lines.shift();
    const url=first.split(' ')[1];const initial={};
    for(const line of lines){if(!line)break;const at=line.indexOf(':');if(at>0)initial[line.slice(0,at)]=line.slice(at+1).replace(/^[ \t]+/,'');}
    const message=requestMessage(url,initial);
    if(enabled)loadedScript.sendingRequest(message,6,{});
    return message;
  }
  async function api(component,kind,name,params={}) {
    calls.push({component,kind,name,params});
    if(component==='script') {
      if(name==='load') {
        assert.equal(params.scriptEngine,'Graal.js');assert.equal(params.scriptType,'httpsender');
        loadedScript=scriptContext(await readFile(params.fileName,'utf8'));
      }else if(name==='enable')enabled=true;
      else if(name==='disable')enabled=false;
      else if(name==='remove')loadedScript=null;
      else throw new Error('Unexpected script operation');
      return {Result:'OK'};
    }
    assert.equal(component,'core');assert.ok(['accessUrl','sendRequest'].includes(name));
    const raw=name==='accessUrl'?rawRequest(params.url):params.request;
    const message=mutate(raw);const url=new URL(message.getRequestHeader().getURI().toString());
    let body={},status=200,additional='';
    if(url.pathname===base+'/login') {
      assert.deepEqual(JSON.parse(raw.split('\r\n\r\n')[1]),makePlan().credentials);
      additional='Set-Cookie: sid='+validSid+'; Path=/; Secure\r\n';
      body={loggedIn:true,username:'alice'};
    }else if(url.pathname===base+'/session') {
      body={username:message.value('Cookie')==='sid='+validSid?(badIdentity?'bob':'alice'):null,csrf:'fixture-csrf'};
    }else if(url.pathname===base+'/token')body={token:fixtureToken};
    else if(url.pathname===base+'/member-api') {
      status=message.value('Authorization')==='Bearer '+fixtureToken?protectedStatus:401;
      body={normalOperation:status===200};
    }else throw new Error('Unexpected fake public endpoint');
    const item=response(body,message.text(),status,additional);
    if(invalidJson&&url.pathname.endsWith('/session'))item.responseBody='private-token-invalid-json';
    return {[name]:[item]};
  }
  return {api,calls,temporary,get enabled(){return enabled;}};
}

test('Session establishment verifies identity and diagnostic preservation, then removes the temporary credential script',async t=>{
  const zap=await fakeZap(t);const secrets=[];let budgetChecks=0;
  const auth=await establishAuthentication({plan:makePlan(),scope,api:zap.api,ensureBudget:async()=>{budgetChecks++;},onSecret:value=>secrets.push(value),inputDirectory:zap.temporary});
  assert.equal(auth.summary.identityVerified,true);
  assert.equal(auth.summary.credentialsReplayed,true);
  assert.equal(auth.summary.selfChecks.presentCookiePreserved,true);
  assert.equal(auth.fixtureCookie(),'sid='+validSid);
  assert.ok(secrets.includes('sid='+validSid)&&secrets.includes(validSid));
  assert.ok(!JSON.stringify(auth.summary).includes(validSid));
  await auth.verify();assert.ok(budgetChecks>=5);
  await auth.cleanup();assert.equal(zap.enabled,false);
  await assert.rejects(access(join(zap.temporary,'auth-headers.js')),{code:'ENOENT'});
});

test('Bearer establishment verifies normal protected access and retains an explicit invalid JWT',async t=>{
  const zap=await fakeZap(t);const secrets=[];
  const auth=await establishAuthentication({plan:makePlan('bearer'),scope,api:zap.api,ensureBudget:async()=>{},onSecret:value=>secrets.push(value),inputDirectory:zap.temporary});
  assert.equal(auth.summary.selfChecks.presentAuthorizationPreserved,true);
  assert.deepEqual(auth.summary.protectedRoutes,{path:base+'/member-api',status:200,verified:true});
  assert.ok(secrets.includes(fixtureToken)&&secrets.includes('Bearer '+fixtureToken));
  assert.ok(!JSON.stringify(auth.summary).includes(fixtureToken));
  await auth.verify();await auth.cleanup();assert.equal(zap.enabled,false);
});

test('A valid bearer subject denied the declared normal role operation is unsupported rather than an anonymous success',async t=>{
  const zap=await fakeZap(t,{protectedStatus:403});
  await assert.rejects(establishAuthentication({plan:makePlan('bearer'),scope,api:zap.api,ensureBudget:async()=>{},inputDirectory:zap.temporary}),errorIs('unsupported_bearer_role',true));
  assert.equal(zap.enabled,false);
  await assert.rejects(access(join(zap.temporary,'auth-headers.js')),{code:'ENOENT'});
});
test('A public issuer token for a different subject fails closed before protected access',async t=>{
  const zap=await fakeZap(t);
  const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:'bob'})).toString('base64url')+'.c2lnbmF0dXJl';
  const api=async(component,kind,name,params)=>{
    const value=await zap.api(component,kind,name,params);
    if(component==='core'&&name==='accessUrl'&&params.url.endsWith('/token'))value.accessUrl[0].responseBody=JSON.stringify({token});
    return value;
  };
  await assert.rejects(establishAuthentication({plan:makePlan('bearer'),scope,api,ensureBudget:async()=>{},inputDirectory:zap.temporary}),errorIs('auth_identity_mismatch'));
  assert.equal(zap.enabled,false);
  assert.ok(!zap.calls.some(value=>value.params?.url?.endsWith('/member-api')));
});

test('Identity mismatch and malformed identity JSON fail closed and remove the script',async t=>{
  for(const settings of [{badIdentity:true},{invalidJson:true}]) {
    const zap=await fakeZap(t,settings);
    await assert.rejects(establishAuthentication({plan:makePlan(),scope,api:zap.api,ensureBudget:async()=>{},inputDirectory:zap.temporary}),errorIs(settings.invalidJson?'auth_json_invalid':'auth_identity_mismatch'));
    assert.equal(zap.enabled,false);
    await assert.rejects(access(join(zap.temporary,'auth-headers.js')),{code:'ENOENT'});
  }
});

test('Off-scope authentication and exhausted setup budgets cannot send a public request',async()=>{
  let calls=0;
  const api=async()=>{calls++;throw new Error('Should not be called');};
  await assert.rejects(establishAuthentication({plan:{...makePlan(),login:'http://app:8099/manifest'},scope,api,ensureBudget:async()=>{}}),errorIs('auth_scope_violation'));
  assert.equal(calls,0);
  await assert.rejects(establishAuthentication({plan:makePlan(),scope,api,ensureBudget:async()=>{throw new Error('budget exhausted');}}),/budget exhausted/);
  assert.equal(calls,0);
});

test('Anonymous establishment does not invoke API, budget, secrets, or write a script',async()=>{
  const never=()=>assert.fail('Anonymous profile must not establish authentication');
  const auth=await establishAuthentication({plan:{mode:'anonymous'},scope,api:never,ensureBudget:never,onSecret:never});
  assert.equal(auth.summary.configuredAuthentication,'none');
  assert.equal(auth.summary.credentialsReplayed,false);
  await auth.verify();await auth.cleanup();
});
