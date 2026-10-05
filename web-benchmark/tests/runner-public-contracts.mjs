import test from 'node:test';
import assert from 'node:assert/strict';
import {cases} from '../src/catalog.mjs';
import {definitions,variantDefinitions} from '../src/cases/index.mjs';
import {requests,openapi} from '../src/contracts.mjs';

const workspace='/w/123456abcdef';
const normalPath=request=>request.path.replace(/\{([^}]+)\}/g,(_,name)=>encodeURIComponent(request.pathValues?.[name]??''));

test('CORS variants declare the browser origin used by their own acceptance path',()=>{
  const origins={B0334:'https://evil.benchmark.test:8444',B0335:'http://app.benchmark.test:8443',B0336:'https://app.benchmark.test:8444'};
  for(const [variant,attacker] of Object.entries(origins)){
    const definition=variantDefinitions.find(item=>item.variant===variant);
    assert.deepEqual(definition?.requiredTargetOrigins,['https://app.benchmark.test:8443',attacker],variant);
  }
});
test('WebSocket Origin claim is an observation capability rather than a second target origin',()=>{
  const socket=definitions.find(item=>item.root==='R0341');
  assert.deepEqual(socket?.requiredTargetOrigins,['https://app:8443']);
  assert.deepEqual(socket?.requiredObservationCapabilities,['websocket_frame']);
});

test('The representative catalog has unique roots, variants and feature contracts',()=>{
  for(const key of ['root','variant','feature'])assert.equal(new Set(cases.map(item=>item[key])).size,cases.length,key);
  for(const item of definitions){
    assert.ok(cases.some(value=>value.root===item.root&&value.variant===item.variant&&value.feature===item.feature));
    assert.ok(item.negativeDescription&&item.implementationNote);
  }
});

test('Every module entry and declared protected GET has a real normal input contract',()=>{
  for(const item of definitions){
    const contract=requests(item.feature,workspace);
    const entry=new URL(workspace+item.entry,'https://app:8443').pathname;
    assert.ok(contract.some(value=>value.method==='GET'&&new URL(normalPath(value),'https://app:8443').pathname===entry),item.root+' entry');
    if(item.sessionProtectedPath)assert.ok(contract.some(value=>value.method==='GET'&&value.path===workspace+item.sessionProtectedPath),item.root+' protected GET');
  }
});

test('Dedicated normal sign-in paths agree with the public request and OpenAPI contracts',()=>{
  for(const item of definitions){
    const loginPath=item.loginPath||(item.feature==='signin'?'/signin':'/login');
    const logoutPath=item.logoutPath||(item.feature==='signout'?'/signout':'/logout');
    for(const value of [loginPath,logoutPath])assert.match(value,/^\/[a-z][a-z0-9/-]*$/);
    const schema=openapi(item.feature,workspace),contract=requests(item.feature,workspace);
    const signIn=contract.find(value=>value.method==='POST'&&value.path===workspace+loginPath);
    assert.deepEqual(signIn?.values,{username:'alice',password:'Fixture-alice-2026!',...item.loginFields},item.root);
    assert.ok(schema.paths[workspace+loginPath]?.get&&schema.paths[workspace+loginPath]?.post,item.root+' login');
    assert.ok(schema.paths[workspace+logoutPath]?.post,item.root+' logout');
    assert.equal(contract.filter(value=>value.method==='POST'&&value.path===workspace+loginPath).length,1);
  }
});

test('Normal scanner contracts remain scoped and omit private root and variant labels',()=>{
  const labels=cases.flatMap(item=>[item.root,item.variant]);
  for(const item of cases){
    const contract=requests(item.feature,workspace),schema=openapi(item.feature,workspace);
    assert.equal(new Set(contract.map(value=>value.method+' '+value.path)).size,contract.length);
    for(const value of contract){
      assert.ok(value.path.startsWith(workspace+'/')&&!value.path.includes('..'));
      assert.ok(schema.paths[value.path]?.[value.method.toLowerCase()]);
      assert.ok(normalPath(value).startsWith(workspace+'/'));
    }
    const body=JSON.stringify({requests:contract,schema});
    for(const label of labels)assert.equal(body.includes(label),false,item.root+' leaked '+label);
  }
});

test('Structured and typed normal JSON examples retain their types and avoid unsupported form flattening',()=>{
  for(const item of cases){
    const schema=openapi(item.feature,workspace);
    for(const request of requests(item.feature,workspace).filter(value=>value.method==='POST')){
      const content=schema.paths[request.path].post.requestBody.content;
      const properties=content['application/json'].schema.properties;
      for(const [name,value] of Object.entries(request.values)){
        assert.deepEqual(properties[name].example,value,item.root+' '+name);
        const expected=Array.isArray(value)?'array':typeof value==='number'?(Number.isInteger(value)?'integer':'number'):typeof value;
        if(value!==null)assert.equal(properties[name].type,expected,item.root+' '+name);
      }
      if(Object.values(request.values).some(value=>value!==null&&typeof value==='object'))assert.equal(content['application/x-www-form-urlencoded'],undefined,item.root);
    }
  }
});

test('Cross-origin operation exceptions stay within declared workspace contracts and lab origins',()=>{
  for(const definition of definitions){
    const contract=requests(definition.feature,workspace);
    for(const path of definition.crossOriginPostPaths||[]){
      assert.match(path,/^\/[a-z][a-z0-9/-]*$/);
      assert.ok(contract.some(request=>request.method==='POST'&&request.path===workspace+path),definition.root+' cross-origin exception lacks a normal operation');
    }
    for(const origin of definition.requiredTargetOrigins||[]){
      const url=new URL(origin);
      assert.equal(url.origin,origin);
      assert.ok(['app','benchmark.test','app.benchmark.test','partner.benchmark.test','evil.benchmark.test','attacker.test'].includes(url.hostname));
      assert.ok(['8080','8443','8444'].includes(url.port));
    }
    if(definition.feature.startsWith('b2-storage-'))for(const request of contract){
      for(const match of request.path.matchAll(/\{([^}]+)\}/g))assert.ok(request.pathValues?.[match[1]],definition.root+' missing normal resource extraction hint');
    }
  }
});
