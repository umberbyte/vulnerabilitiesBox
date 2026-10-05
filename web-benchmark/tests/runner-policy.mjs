import test from 'node:test';
import assert from 'node:assert/strict';
import {options,publicScope,seedUrls,anonymousSchema,validateTargetSurface,TargetSurfaceError,isActiveProfile} from '../src/runner/policy.mjs';

const manifest={base:'/w/123456abcdef',entry:'/w/123456abcdef/search?q=Apple',openapi:'/w/123456abcdef/openapi.json',requests:[{method:'GET',path:'/w/123456abcdef/documents/{id}',pathValues:{id:101},values:{}},{method:'GET',path:'/w/123456abcdef/search',values:{q:'Apple & Banana'}},{method:'POST',path:'/w/123456abcdef/login',values:{username:'alice',password:'Fixture-alice-2026!'}},{method:'GET',path:'http://app:8099/oracle',values:{}},{method:'GET',path:'https://app:8444/attack',values:{}}]};
test('Legacy and declared HTTPS-only target surfaces remain supported without modifying the contract',()=>{
  for(const supplied of [manifest,{...manifest,requiredTargetOrigins:['https://app:8443']}]) {
    const before=structuredClone(supplied);
    assert.deepEqual(validateTargetSurface(supplied),{requiredOrigins:['https://app:8443'],supportedOrigins:['https://app:8443'],verified:true});
    assert.deepEqual(supplied,before);
  }
});
test('Additional declared public origins are unsupported regardless of private identifiers or input order',()=>{
  for(const required of [['http://benchmark.test:8080'],['http://benchmark.test:8080','https://app:8443'],['https://app:8443','http://benchmark.test:8080'],['https://app:8444']]) {
    for(const privateLabels of [{},{root:'R0461',arm:'V'},{root:'R0001',arm:'F'}]) {
      assert.throws(()=>validateTargetSurface({...manifest,...privateLabels,requiredTargetOrigins:required}),error=>error instanceof TargetSurfaceError&&error.code==='unsupported_target_surface'&&error.unsupported===true);
    }
  }
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
  for(const env of [{SCAN_PROFILE:'full'},{SCAN_AUTH:'auto'},{SCAN_USER:'root'},{SCAN_SECONDS:'0'},{SCAN_SECONDS:'1201'},{SCAN_SECONDS:'1; bad'},{SCAN_REQUEST_BUDGET:'3001'},{SCAN_CONCURRENCY:'3'},{SCAN_CONCURRENCY:'7'},{SCAN_CONCURRENCY:'9'}])assert.throws(()=>options(env));
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
