import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import express from 'express';
import {createServer,request} from 'node:http';
import {selected} from '../src/cases/batch4-selection.mjs';
import {variantCases} from '../src/catalog.mjs';
import {requests,openapi} from '../src/contracts.mjs';
import {createVariantPanel,validateVariantPanel} from '../src/runner/variant-panel.mjs';
import {main as generateVariantPanel} from '../src/runner/generate-variant-panel.mjs';
import * as cache from '../src/cases/batch4-cache.mjs';
import * as csrf from '../src/cases/batch4-csrf.mjs';

const design=JSON.parse(readFileSync(new URL('../../benchmark-design-v2.json',import.meta.url)));
test('the 100 additional cases retain their designed root identity and a separate 300-cell plan',()=>{
 const roots=new Map(design.variants.map(item=>[item.id,item.root_id]));
 assert.equal(selected.length,100);
 const batch4=new Set(selected.map(item=>item.variant));
 assert.equal(variantCases.filter(item=>batch4.has(item.variant)).length,100);
 assert.deepEqual(batch4,new Set(variantCases.filter(item=>batch4.has(item.variant)).map(item=>item.variant)));
 for(const item of selected)assert.equal(roots.get(item.variant),item.root);
 const plan=createVariantPanel({variantIds:selected.map(item=>item.variant),createdAt:'2026-10-02T00:00:00.000Z'});
 assert.equal(plan.cellCount,300);assert.equal(plan.catalogSnapshot.additionalVariantCount,100);
 assert.equal(validateVariantPanel(plan).planId,plan.planId);
 assert.equal(new Set(plan.cells.map(cell=>cell.cellId)).size,300);
});
test('an active additional-variant plan preserves its scanner conditions through validation',()=>{
 const ids=selected.slice(0,2).map(item=>item.variant);
 const plan=createVariantPanel({variantIds:ids,profile:'active',wallSeconds:60,requests:700,seed:'core-dast-active',createdAt:'2026-10-04T00:00:00.000Z'});
 assert.equal(plan.cellCount,6);
 assert.ok(plan.cells.every(cell=>cell.condition.profile==='active'&&cell.condition.wallSeconds===60&&cell.condition.requestedHttpRequests===700));
 assert.deepEqual(validateVariantPanel(plan),plan);
 const modified=structuredClone(plan);modified.cells[0].condition.profile='baseline';
 assert.throws(()=>validateVariantPanel(modified),/differ/);
});
test('the Docker variant-plan command accepts explicit active scan settings',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'variant-plan-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const output=join(dir,'plan.json');
 await generateVariantPanel([output,'--variants',selected[0].variant,'--profile','active','--seed','active-batch','--wall-seconds','60','--requests','700']);
 const plan=JSON.parse(await readFile(output,'utf8'));
 assert.equal(plan.cellCount,3);assert.equal(plan.selection.profile,'active');
 assert.equal(plan.selection.seed,'active-batch');
 assert.deepEqual(validateVariantPanel(plan),plan);
 await assert.rejects(generateVariantPanel([output,'--profile','active']),{code:'EEXIST'});
});
test('each additional variant exposes scoped normal requests and a matching OpenAPI contract',()=>{
 for(const item of variantCases){
  const base='/w/123456789abc',normal=requests(item.feature,base),schema=openapi(item.feature,base);
  assert.ok(normal.some(r=>r.method==='GET'&&r.path===base+item.entry.split('?')[0]),item.variant);
  for(const req of normal){
   assert.ok(req.path.startsWith(base+'/'),item.variant);
   assert.ok(schema.paths[req.path]?.[req.method.toLowerCase()],item.variant+' '+req.method+' '+req.path);
   assert.ok(!req.path.includes(item.variant)&&!req.path.includes(item.root),item.variant);
  }
 }
});

async function host(register,run){
 const app=express();app.use(express.json());app.use(express.urlencoded({extended:false}));
 app.use((req,res,next)=>{const user=(req.headers.cookie||'').match(/user=(alice|bob|carol)/)?.[1];req.member=user?{name:user,tenant:user==='carol'?'B':'A',contact:user+'@example.test'}:null;req.session={csrf:'valid-csrf'};next();});
 const map=new Map(),redis={get:async k=>map.get(k)||null,set:async(k,v)=>map.set(k,v),keys:async pattern=>[...map.keys()].filter(k=>k.startsWith(pattern.slice(0,-1)))};
 const updates=[];const db={query:async(sql,args)=>{if(sql.startsWith('UPDATE users'))updates.push(args);return {rows:[]};}};
 const router=express.Router();register(router,{redis,db,getRun:()=>run,vulnerable:()=>run.mode==='V',requireLogin:(req,res)=>{if(req.member)return true;res.sendStatus(401);return false;},page:(t,c)=>`<h1>${t}</h1>${c}`,esc:x=>String(x)});app.use(router);
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 return {base,updates,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('query-key omission and authentication cache leak occur only in vulnerable mode',async()=>{
 for(const mode of ['V','F']){
  const run={variant:'B0372',mode,canary:'private_canary'};const h=await host(cache.register,run);
  try{
   const first=await (await fetch(h.base+'/v4-cache?q=private')).json();
   const second=await (await fetch(h.base+'/v4-cache?q=public')).json();
   assert.equal(first.result,'private_canary');assert.equal(second.result,mode==='V'?'private_canary':'Public search result');
  }finally{await h.close();}
  run.variant='B0376';const a=await host(cache.register,run);
  try{
   const privateResponse=await (await fetch(a.base+'/v4-cache',{headers:{cookie:'user=alice'}})).json();
   const publicResponse=await (await fetch(a.base+'/v4-cache')).json();
   assert.match(privateResponse.profile,/private_canary/);
   assert.equal(publicResponse.profile,mode==='V'?privateResponse.profile:'Public profile');
  }finally{await a.close();}
 }
});
test('Accept and tenant dimensions separate cached responses in fixed mode',async()=>{
 for(const mode of ['V','F']){
  const run={variant:'B0375',mode,canary:'private_canary'};const h=await host(cache.register,run);
  try{
   const html=await fetch(h.base+'/v4-cache',{headers:{accept:'text/html'}});
   assert.match(await html.text(),/private_canary/);
   const json=await fetch(h.base+'/v4-cache',{headers:{accept:'application/json'}});
   assert.equal(json.headers.get('content-type')?.includes('text/html'),mode==='V');
  }finally{await h.close();}
  run.variant='B0386';const t=await host(cache.register,run);
  try{
   const a=await (await fetch(t.base+'/v4-cache?id=101',{headers:{cookie:'user=alice'}})).json();
   const b=await (await fetch(t.base+'/v4-cache?id=101',{headers:{cookie:'user=carol'}})).json();
   assert.equal(a.document,'private_canary');
   assert.equal(b.document,mode==='V'?'private_canary':'Tenant B record');
  }finally{await t.close();}
 }
});
test('GET bodies cannot poison a public cache in the fixed mode',async()=>{
 const raw=(url,body)=>new Promise((resolve,reject)=>{
  const payload=body?JSON.stringify(body):'';
  const req=request(url,{method:'GET',headers:payload?{'content-type':'application/json','content-length':Buffer.byteLength(payload)}:{}},res=>{
   let value='';res.on('data',part=>value+=part);res.on('end',()=>resolve({status:res.statusCode,body:value}));
  });req.on('error',reject);req.end(payload);
 });
 for(const mode of ['V','F']){
  const run={variant:'B0388',mode,canary:'private_canary'},h=await host(cache.register,run);
  try{
   const warm=await raw(h.base+'/v4-cache',{term:'private'});
   assert.equal(warm.status,mode==='V'?200:400);
   const clean=await raw(h.base+'/v4-cache');
   assert.equal(JSON.parse(clean.body).result,mode==='V'?'private_canary':'Public body result');
  }finally{await h.close();}
 }
});
test('CSRF route preserves the ordinary token and rejects the missing token in fixed mode',async()=>{
 for(const mode of ['V','F']){
  const run={variant:'B0312',mode};const h=await host(csrf.register,run);
  try{
   const send=body=>fetch(h.base+'/v4-csrf',{method:'POST',headers:{cookie:'user=alice','content-type':'application/json'},body:JSON.stringify(body)});
   const normal=await send({action:'update',contact:'alice.updated@example.test',csrf:'valid-csrf'});
   assert.equal(normal.status,200);
   const missing=await send({action:'update',contact:'attacker@example.test'});
   assert.equal(missing.status,mode==='V'?200:403);
   assert.equal(h.updates.length,mode==='V'?2:1);
  }finally{await h.close();}
 }
});
