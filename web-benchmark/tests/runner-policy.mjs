import test from 'node:test';
import assert from 'node:assert/strict';
import {options,publicScope,entryPost,seedUrls,anonymousSchema,identityChangingExamples,validateTargetSurface,TargetSurfaceError,isActiveProfile,COLLECTOR_ORIGIN,HTTP_TRANSPORT_ORIGIN,HTTP_FORWARD_ORIGIN,COOKIE_HTTPS_ORIGIN,COOKIE_HTTP_ORIGIN} from '../src/runner/policy.mjs';

const manifest={base:'/w/123456abcdef',entry:'/w/123456abcdef/search?q=Apple',openapi:'/w/123456abcdef/openapi.json',requests:[{method:'GET',path:'/w/123456abcdef/documents/{id}',pathValues:{id:101},values:{}},{method:'GET',path:'/w/123456abcdef/search',values:{q:'Apple & Banana'}},{method:'POST',path:'/w/123456abcdef/login',values:{username:'alice',password:'Fixture-alice-2026!'}},{method:'GET',path:'http://app:8099/oracle',values:{}},{method:'GET',path:'https://app:8444/attack',values:{}}]};
test('Legacy and declared HTTPS-only target surfaces remain supported without modifying the contract',()=>{
  for(const supplied of [manifest,{...manifest,requiredTargetOrigins:['https://app:8443']}]) {
    const before=structuredClone(supplied);
    assert.deepEqual(validateTargetSurface(supplied),{requiredOrigins:['https://app:8443'],supportedOrigins:['https://app:8443'],verified:true});
    assert.deepEqual(supplied,before);
  }
});
test('Additional declared public origins are unsupported regardless of private identifiers or input order',()=>{
  for(const required of [['http://benchmark.test:8080'],['http://other:8080','https://app:8443'],['https://app:8443','http://other:8080'],['https://app:8444']]) {
    for(const privateLabels of [{},{root:'R0461',arm:'V'},{root:'R0001',arm:'F'}]) {
      assert.throws(()=>validateTargetSurface({...manifest,...privateLabels,requiredTargetOrigins:required}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_target_surface'&&error.unsupported===true);
    }
  }
});
test('The fixed anonymous HTTP transport pair is supported but requires measured reachability',()=>{
  for(const required of [[HTTP_TRANSPORT_ORIGIN,'https://app:8443'],['https://app:8443',HTTP_TRANSPORT_ORIGIN]]){
    const supplied={...manifest,requiredTargetOrigins:required};
    assert.deepEqual(validateTargetSurface(supplied,{auth:'anonymous'}),{requiredOrigins:required,supportedOrigins:required,verified:false,adapter:'dual-http-transport'});
    assert.throws(()=>validateTargetSurface(supplied,{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_authenticated_transport');
    const http=publicScope(supplied,{origin:HTTP_TRANSPORT_ORIGIN});
    assert.ok(http.isAllowed(HTTP_TRANSPORT_ORIGIN+manifest.base+'/search'));
    assert.equal(http.isAllowed('https://app:8443'+manifest.base+'/search'),false);
    assert.equal(http.isAllowed('http://app:8099'+manifest.base+'/search'),false);
  }
});
test('The fixed forwarded HTTP pair requires a verified session and separate measured reachability',()=>{
  for(const required of [[HTTP_FORWARD_ORIGIN,'https://app:8443'],['https://app:8443',HTTP_FORWARD_ORIGIN]]){
    const supplied={...manifest,requiredTargetOrigins:required};
    assert.deepEqual(validateTargetSurface(supplied,{auth:'session'}),{requiredOrigins:required,supportedOrigins:required,verified:false,adapter:'dual-forwarded-transport'});
    for(const auth of ['anonymous','bearer'])assert.throws(()=>validateTargetSurface(supplied,{auth}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_forwarded_transport_auth');
    const http=publicScope(supplied,{origin:HTTP_FORWARD_ORIGIN});
    assert.ok(http.isAllowed(HTTP_FORWARD_ORIGIN+manifest.base+'/search'));
    assert.equal(http.isAllowed('https://app:8443'+manifest.base+'/search'),false);
    assert.equal(http.isAllowed('http://app:8099'+manifest.base+'/search'),false);
  }
});
test('The fixed browser cookie pair requires session authentication and stays within its two origins',()=>{
  for(const required of [[COOKIE_HTTPS_ORIGIN,COOKIE_HTTP_ORIGIN],[COOKIE_HTTP_ORIGIN,COOKIE_HTTPS_ORIGIN]]) {
    const supplied={...manifest,requiredTargetOrigins:required};
    assert.deepEqual(validateTargetSurface(supplied,{auth:'session'}),{requiredOrigins:required,supportedOrigins:required,verified:false,adapter:'browser-cookie-transport'});
    for(const auth of ['anonymous','bearer'])assert.throws(()=>validateTargetSurface(supplied,{auth}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_cookie_transport_auth');
    const scope=publicScope(supplied,{origin:COOKIE_HTTP_ORIGIN});
    assert.ok(scope.isAllowed(COOKIE_HTTP_ORIGIN+manifest.base+'/search'));
    assert.equal(scope.isAllowed(COOKIE_HTTPS_ORIGIN+manifest.base+'/search'),false);
  }
});

test('The local event collector is observation-only for its two declared browser operations',()=>{
  for(const [entry,auth] of [['login-analytics','anonymous'],['error-reporting','session']]) {
    const required=['https://app:8443',COLLECTOR_ORIGIN];
    const supplied={...manifest,entry:manifest.base+'/'+entry,requiredTargetOrigins:required,auxiliaryRequests:[{method:'POST',origin:COLLECTOR_ORIGIN,path:'/collect-events'}]};
    assert.deepEqual(validateTargetSurface(supplied,{auth}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],verified:false,adapter:'browser-event-collector'});
    assert.throws(()=>validateTargetSurface(supplied,{auth:auth==='session'?'anonymous':'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_collector_auth');
    assert.throws(()=>publicScope(supplied,{origin:COLLECTOR_ORIGIN}));
    for(const auxiliaryRequests of [[],[{method:'GET',origin:COLLECTOR_ORIGIN,path:'/collect-events'}],[{method:'POST',origin:COLLECTOR_ORIGIN,path:'/other'}]])
      assert.throws(()=>validateTargetSurface({...supplied,auxiliaryRequests},{auth}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_collector_contract');
    assert.throws(()=>validateTargetSurface({...supplied,entry:manifest.base+'/other'},{auth}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_collector_entry');
  }
});

test('The local distribution URL is observation-only for the declared library integrity operation',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN],fixture=manifest.base+'/b2-library-fixture';
  const supplied={...manifest,entry:manifest.base+'/b2-library',requiredTargetOrigins:required,requests:[{method:'GET',path:fixture},{method:'POST',path:fixture}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'session'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-library.js',verified:false,adapter:'browser-library-integrity'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_library_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[{method:'GET',path:fixture}]},{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_library_contract');
  assert.throws(()=>publicScope(supplied,{origin:COLLECTOR_ORIGIN}));
});

test('Alternative local scripts are observed only for the two declared resource selection pages',()=>{
  for(const entry of ['b2-resource','b2-named']) {
    const required=['https://app:8443',COLLECTOR_ORIGIN],normal={method:'GET',path:manifest.base+'/b2-standard.js'};
    const supplied={...manifest,entry:manifest.base+'/'+entry,requiredTargetOrigins:required,requests:[normal]};
    assert.deepEqual(validateTargetSurface(supplied,{auth:'anonymous'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-resource.js',verified:false,adapter:'browser-resource-switch'});
    assert.throws(()=>validateTargetSurface(supplied,{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_resource_auth');
    assert.throws(()=>validateTargetSurface({...supplied,requests:[]},{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_resource_contract');
  }
});
test('The declared JSONP page observes only its fixed auxiliary script source',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN];
  const supplied={...manifest,entry:manifest.base+'/b2-jsonp-panel',requiredTargetOrigins:required,requests:[{method:'GET',path:manifest.base+'/b2-notice-data'}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'anonymous'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-jsonp',verified:false,adapter:'browser-jsonp-csp'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_jsonp_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[]},{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_jsonp_contract');
});
test('The declared external window page observes only the fixed local popup',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN];
  const supplied={...manifest,entry:manifest.base+'/b2-external',requiredTargetOrigins:required,requests:[{method:'GET',path:manifest.base+'/b2-link-home'}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'anonymous'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-linked-screen',verified:false,adapter:'browser-external-window'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_external_window_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[]},{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_external_window_contract');
});
test('The declared framed approval page requires a session and its normal operations',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN],entry=manifest.base+'/b2-approval';
  const supplied={...manifest,entry,requiredTargetOrigins:required,requests:[{method:'GET',path:entry},{method:'POST',path:entry}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'session'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-frame',verified:false,adapter:'browser-frame-approval'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_frame_approval_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[{method:'GET',path:entry}]},{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_frame_approval_contract');
});
test('The declared postMessage hub observes only the local auxiliary receiver',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN];
  const supplied={...manifest,entry:manifest.base+'/b2-message-hub',requiredTargetOrigins:required,requests:[{method:'GET',path:manifest.base+'/b2-message-client'}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'session'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-origin-page',verified:false,adapter:'browser-message-boundary'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_message_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[]},{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_message_contract');
});
test('The declared transfer form observes only the local alternate receiver',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN];
  const supplied={...manifest,entry:manifest.base+'/b2-transfer',requiredTargetOrigins:required,requests:[{method:'POST',path:manifest.base+'/b2-transfer-complete'}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'session'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-collect',verified:false,adapter:'browser-form-destination'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_form_destination_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[]},{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_form_destination_contract');
});
test('The declared profile observes only its two local auxiliary browser pages',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN],entry=manifest.base+'/b2-profile';
  const supplied={...manifest,entry,requiredTargetOrigins:required,requests:[{method:'GET',path:entry},{method:'POST',path:entry}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'session'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPaths:['/b2-origin-page','/b2-form'],verified:false,adapter:'browser-profile-origin'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_profile_origin_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[{method:'GET',path:entry}]},{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_profile_origin_contract');
});
test('The declared login initiation observes only the local auxiliary form',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN],entry=manifest.base+'/b2-signin';
  const supplied={...manifest,entry,login:entry,requiredTargetOrigins:required,requests:[{method:'GET',path:entry}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'anonymous'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-form',verified:false,adapter:'browser-login-origin'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_login_origin_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[]},{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_login_origin_contract');
});
test('The declared recovery flow observes only its local auxiliary pixel',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN],entry=manifest.base+'/b3-recover',reset=manifest.base+'/b3-reset';
  const supplied={...manifest,entry,requiredTargetOrigins:required,requests:[{method:'POST',path:entry},{method:'GET',path:reset},{method:'POST',path:reset}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'anonymous'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b3-pixel',verified:false,adapter:'browser-recovery-referer'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_recovery_referer_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[{method:'POST',path:entry}]},{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_recovery_referer_contract');
});
test('The declared CSS preview observes only the local image collector',()=>{
  const required=['https://app:8443',COLLECTOR_ORIGIN],entry=manifest.base+'/b2-css';
  const supplied={...manifest,entry,requiredTargetOrigins:required,requests:[{method:'GET',path:entry,values:{cssRules:'#sample { color: blue; }'}}]};
  assert.deepEqual(validateTargetSurface(supplied,{auth:'session'}),{requiredOrigins:required,supportedOrigins:required,scanOrigins:['https://app:8443'],observationOrigins:[COLLECTOR_ORIGIN],observationPath:'/b2-collect',verified:false,adapter:'browser-css-collector'});
  assert.throws(()=>validateTargetSurface(supplied,{auth:'anonymous'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_css_collector_auth');
  assert.throws(()=>validateTargetSurface({...supplied,requests:[]},{auth:'session'}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_css_collector_contract');
});
test('The forwarded transport diagnostic selects the entry POST rather than the login POST',()=>{
  const supplied={...manifest,entry:'/w/123456abcdef/b3-transport',requests:[
    {method:'POST',path:'/w/123456abcdef/login',values:{username:'alice',password:'fixture'}},
    {method:'POST',path:'/w/123456abcdef/b3-transport',values:{}},
    {method:'POST',path:'/w/123456abcdef/other',values:{}}
  ]};
  const selected=entryPost(supplied,publicScope(supplied,{origin:HTTP_FORWARD_ORIGIN}));
  assert.equal(selected?.path,'/w/123456abcdef/b3-transport');
});
test('Declared WebSocket frame observation is unsupported until the adapter verifies it',()=>{
  const surface={...manifest,requiredTargetOrigins:['https://app:8443'],requiredObservationCapabilities:['websocket_frame']};
  assert.throws(()=>validateTargetSurface(surface),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_observation_capability'&&error.unsupported===true);
  for(const invalid of [null,'websocket_frame',[1],['websocket_frame','websocket_frame'],['WebSocket'],['websocket-frame']]){
    assert.throws(()=>validateTargetSurface({...surface,requiredObservationCapabilities:invalid}),error=>error instanceof TargetSurfaceError&&error.code==='invalid_observation_capability'&&error.unsupported===false);
  }
});
test('Malformed, duplicate or non-origin target declarations fail closed as invalid contracts',()=>{
  for(const required of [null,[],{},'https://app:8443',[42],[''],['https://app:8443','https://app:8443'],['https://app:8443/'],['https://app:8443/path'],['https://app:8443?key=value'],['https://user:password@app:8443'],['file:///tmp/fixture']]) {
    assert.throws(()=>validateTargetSurface({...manifest,requiredTargetOrigins:required}),error=>error instanceof TargetSurfaceError&&error.code==='invalid_target_surface'&&error.unsupported===false);
  }
});
test('Settings reject unsupported profiles and unbounded budgets',()=>{
  assert.deepEqual(options({}),{profile:'baseline',auth:'anonymous',user:'alice',seconds:120,requests:300,concurrency:2});
  assert.equal(options({SCAN_CONCURRENCY:'4'}).concurrency,4);
  assert.equal(options({SCAN_CONCURRENCY:'6'}).concurrency,6);
  assert.equal(options({SCAN_CONCURRENCY:'8'}).concurrency,8);
  assert.equal(options({SCAN_REQUEST_BUDGET:'10000'}).requests,10000);
  for(const env of [{SCAN_PROFILE:'full'},{SCAN_AUTH:'auto'},{SCAN_USER:'root'},{SCAN_SECONDS:'0'},{SCAN_SECONDS:'1201'},{SCAN_SECONDS:'1; bad'},{SCAN_REQUEST_BUDGET:'10001'},{SCAN_CONCURRENCY:'3'},{SCAN_CONCURRENCY:'7'},{SCAN_CONCURRENCY:'9'}])assert.throws(()=>options(env));
});
test('active-low is an explicit additional active profile with unchanged generic budgets and authentication',()=>{
  assert.deepEqual(options({SCAN_PROFILE:'active-low'}),{profile:'active-low',auth:'anonymous',user:'alice',seconds:120,requests:300,concurrency:2});
  assert.equal(isActiveProfile('baseline'),false);assert.equal(isActiveProfile('active'),true);assert.equal(isActiveProfile('active-low'),true);
  assert.equal(isActiveProfile('active-root-special'),false);
});
test('Authenticated discovery omits identity-changing routes while preserving business POSTs',()=>{
  const base=manifest.base;
  const supplied={...manifest,login:base+'/signin',logout:base+'/signout',requests:[...manifest.requests,{method:'GET',path:base+'/signin',values:{}},{method:'GET',path:base+'/signout',values:{}},{method:'GET',path:base+'/connect',values:{}}]};
  const scope=publicScope(supplied);
  const urls=seedUrls(supplied,scope,{auth:'session'});
  assert.ok(urls.every(value=>!/\/(?:login|logout|signin|signout|connect)(?:\?|$)/.test(value)));
  const result=anonymousSchema({paths:{[base+'/signin']:{get:{},post:{}},[base+'/signout']:{post:{}},[base+'/callback']:{get:{}},[base+'/shop']:{post:{}}}},scope,{auth:'bearer',manifest:supplied});
  assert.deepEqual(Object.keys(result.paths),[base+'/shop']);
});
test('Authenticated OpenAPI import does not replay a credentialed session-elevation example',()=>{
  const path=manifest.base+'/v5-auth';
  const example={method:'POST',path,values:{operation:'elevate',adminPassword:'fixture-example'}};
  const supplied={...manifest,requests:[...manifest.requests,example]};
  const input={paths:{[path]:{get:{},post:{requestBody:{example:example.values}}},[manifest.base+'/business']:{post:{requestBody:{example:{amount:100}}}}}};
  assert.deepEqual(identityChangingExamples(supplied),[{method:'post',path}]);
  const authenticated=anonymousSchema(input,publicScope(supplied),{auth:'session',manifest:supplied});
  assert.ok(authenticated.paths[path].get);
  assert.equal(authenticated.paths[path].post,undefined);
  assert.ok(authenticated.paths[manifest.base+'/business'].post);
  const anonymous=anonymousSchema(input,publicScope(supplied),{auth:'anonymous',manifest:supplied});
  assert.ok(anonymous.paths[path].post);
  assert.ok(input.paths[path].post,'The public schema remains unchanged');
});
test('Workspace scope excludes control, sibling origin, other roots and traversal',()=>{
  const scope=publicScope(manifest);const re=new RegExp(scope.regex);
  for(const path of [manifest.entry,manifest.openapi,'https://app:8443/w/123456abcdef/profile?x=1'])assert.ok(scope.isAllowed(path));
  for(const path of ['http://app:8099/manifest','https://app:8444/attack','http://app:8080/w/123456abcdef/search','https://app:8443/w/aaaaaaaaaaaa/search','https://app:8443/w/123456abcdef-extra/search','https://evil.test/w/123456abcdef/search','/w/123456abcdef/../other','https://user:password@app:8443/w/123456abcdef/search'])assert.equal(scope.isAllowed(path),false,path);
  assert.ok(re.test(scope.entry));assert.equal(re.test('https://app:8443/w/aaaaaaaaaaaa/search'),false);
});
test('Malformed or cross-origin manifest fails closed',()=>{
  for(const change of [{base:'/w/root-id'},{entry:'http://app:8099/manifest'},{openapi:'https://app:8444/openapi.json'}])assert.throws(()=>publicScope({...manifest,...change}));
});
test('Normal seed replay uses public GETs, preserves examples, expands path input and omits credentials',()=>{
  const seeds=seedUrls(manifest,publicScope(manifest));
  assert.ok(seeds.some(v=>v.endsWith('/documents/101')));
  assert.ok(seeds.some(v=>new URL(v).searchParams.get('q')==='Apple & Banana'));
  assert.ok(seeds.every(v=>v.startsWith('https://app:8443/w/123456abcdef/')));
  assert.ok(seeds.every(v=>!v.includes('Fixture-')&&!v.includes('/login')));
});
test('Anonymous OpenAPI excludes successful login replay and off-scope operations',()=>{
  const base=manifest.base;
  const input={openapi:'3.0.3',paths:{[base+'/login']:{get:{summary:'Login form'},post:{requestBody:{password:'fixture'}}},[base+'/logout']:{post:{}},[base+'/signin']:{post:{requestBody:{password:'fixture'}}},[base+'/signout']:{post:{}},[base+'/idp/authorize']:{post:{}},[base+'/search']:{get:{parameters:[{name:'q',example:'Apple'}]}},[base+'/shop']:{post:{requestBody:{normalPrice:1000}}},'/oracle':{get:{}}}};
  const result=anonymousSchema(input,publicScope(manifest));
  assert.equal(result.paths[base+'/login'].post,undefined);
  assert.equal(result.paths[base+'/logout'],undefined);
  assert.equal(result.paths[base+'/signin'],undefined);
  assert.equal(result.paths[base+'/signout'],undefined);
  assert.equal(result.paths[base+'/idp/authorize'],undefined);
  assert.equal(result.paths['/oracle'],undefined);
  assert.equal(result.paths[base+'/search'].get.parameters[0].example,'Apple');
  assert.equal(result.paths[base+'/shop'].post.requestBody.normalPrice,1000);
  assert.ok(input.paths[base+'/login'].post,'Input remains unmodified');
});
