import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {definitions,register,reset,shutdown,audit} from '../src/cases/batch3-engines.mjs';
import {boundary,blockedInSafeModes} from './batch3-engines-fixtures.mjs';
let run={root:'R0061',mode:'V',canary:'synthetic-secret-marker'};
const app=express();app.use(express.json());
register(app,{getRun:()=>run,vulnerable:()=>run.mode==='V',requireLogin:()=>true,page:(title,content)=>'<h1>'+title+'</h1>'+content});
const listener=app.listen(0,'127.0.0.1');
const base=()=>`http://127.0.0.1:${listener.address().port}`;
const post=async(root,body)=>{const response=await fetch(base()+'/r3e-'+root.slice(1),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};

test('engine cases retain normal behavior and expose the marker only in V',async()=>{
 try {
  assert.deepEqual(definitions.map(x=>x.root),Object.keys(boundary));
  for(const root of Object.keys(boundary))for(const mode of ['V','F','N']) {
   run={root,mode,canary:'synthetic-secret-marker'};
   await reset({getRun:()=>run});
   const normal=await post(root,definitions.find(item=>item.root===root).requests[1][2]);
   assert.equal(normal.status,200,`${root}/${mode} normal`);
   assert.equal(JSON.stringify(normal.body).includes(run.canary),false,`${root}/${mode} normal secrecy`);
   if(['R0105','R0107','R0108'].includes(root))assert.equal(normal.body.selected,'Guide',`${root}/${mode} normal XPath result`);
   if(['R0111','R0113'].includes(root))assert.equal(normal.body.text,'Guide',`${root}/${mode} normal XML text`);
   const body={operation:'boundary',...boundary[root]};
   if(root==='R0170')body.url='http://public.fixture.test:'+(await audit({getRun:()=>run})).enginesBatch.ports.private+'/';
   const probe=await post(root,body);
   assert.equal(probe.status,mode!=='V'&&blockedInSafeModes.has(root)?403:200,`${root}/${mode} boundary status`);
   assert.equal(JSON.stringify(probe.body).includes(run.canary),mode==='V',`${root}/${mode} marker exposure`);
   const state=await audit({getRun:()=>run});
   assert.ok(state.enginesBatch.records.length>=2,`${root}/${mode} audit`);
  }
 } finally {await shutdown();await new Promise(resolve=>listener.close(resolve));}
});
