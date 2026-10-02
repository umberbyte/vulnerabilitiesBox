import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import express from 'express';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {cases,variantCases} from '../src/catalog.mjs';
import {selected} from '../src/cases/batch5-selection.mjs';
import {requests,openapi} from '../src/contracts.mjs';
import * as cache from '../src/cases/batch5-cache.mjs';
import * as auth from '../src/cases/batch5-auth.mjs';
import * as parsing from '../src/cases/batch5-parsing.mjs';
import * as socket from '../src/cases/batch5-socket.mjs';

const design=JSON.parse(readFileSync(new URL('../../benchmark-design-v2.json',import.meta.url)));
test('selected cases retain design roots and expose normal public contracts',()=>{
 const roots=new Map(design.variants.map(v=>[v.id,v.root_id])),all=[...cases,...variantCases];
 assert.equal(selected.length,37);
 for(const item of selected){
  assert.equal(roots.get(item.variant),item.root);
  const definition=all.find(v=>v.root===item.root&&v.variant===item.variant);
  assert.ok(definition,item.variant);
  const normal=requests(definition.feature,'/w/123456789abc');
  assert.ok(normal.some(r=>r.method==='GET'&&r.path.startsWith('/w/123456789abc'+definition.entry)),item.variant);
  const schema=openapi(definition.feature,'/w/123456789abc');
  for(const request of normal)assert.ok(schema.paths[request.path]?.[request.method.toLowerCase()],item.variant);
 }
});

async function host(register,run){
 const map=new Map(),redis={get:async k=>map.get(k)||null,set:async(k,v)=>{map.set(k,v);return 'OK';},del:async k=>{map.delete(k);},keys:async p=>[...map.keys()].filter(k=>k.startsWith(p.slice(0,-1)))};
 const updates=[];const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT id,owner,body FROM documents'))return {rows:[{id:args[0],owner:args[0]===102?'bob':'alice',body:args[0]===102?'private_canary':'Alice document'}]};
  if(sql.startsWith('SELECT body FROM documents WHERE owner'))return {rows:[{body:args[0]==='bob'?'private_canary':'Alice document'}]};
  if(sql.startsWith('UPDATE users'))updates.push(args);
  return {rows:[]};
 }};
 const app=express();app.use(express.json({verify:(req,res,b)=>{req.rawJson=b.toString('utf8');}}));app.use(express.urlencoded({extended:false}));
 app.use((req,res,next)=>{req.member={name:'alice',tenant:'A',contact:'alice@example.test'};req.session={sid:'a'.repeat(48),csrf:'valid-csrf'};next();});
 const router=express.Router();register(router,{db,redis,getRun:()=>run,vulnerable:()=>run.mode==='V',requireLogin:()=>true,page:(t,c)=>`<h1>${t}</h1>${c}`,esc:x=>x,newSession:async()=>{},token:()=> 'b'.repeat(48)});app.use(router);
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:`http://127.0.0.1:${server.address().port}`,server,redis,db,updates,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('path delimiter cache pollution is isolated by the fixed key',async()=>{
 for(const mode of ['V','F']){
  const run={variant:'B0378',mode,base:'/w/123456789abc',canary:'private_canary'},h=await host(cache.register,run);
  try{
   const secret=await (await fetch(h.url+'/v5-cache/public;private')).json();
   const publicResponse=await (await fetch(h.url+'/v5-cache/public')).json();
   assert.equal(secret.text,'private_canary');
   assert.equal(publicResponse.text,mode==='V'?'private_canary':'Public page');
  }finally{await h.close();}
 }
});
test('missing Sec-Fetch-Site does not bypass the fixed CSRF token check',async()=>{
 for(const mode of ['V','F']){
  const run={variant:'B0329',mode},h=await host(auth.register,run);
  try{
   const send=body=>fetch(h.url+'/v5-auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   assert.equal((await send({operation:'change',contact:'alice.updated@example.test',csrf:'valid-csrf'})).status,200);
   assert.equal((await send({operation:'change',contact:'attacker@example.test'})).status,mode==='V'?200:403);
   assert.equal(h.updates.length,mode==='V'?2:1);
  }finally{await h.close();}
 }
});
test('duplicate JSON target reaches a different document only in the vulnerable parser',async()=>{
 for(const mode of ['V','F']){
  const run={variant:'B0361',mode},h=await host(parsing.register,run);
  try{
   const response=await fetch(h.url+'/v5-parse',{method:'POST',headers:{'content-type':'application/json'},body:'{"target":101,"target":102,"action":"read"}'});
   assert.equal(response.status,mode==='V'?200:400);
   if(mode==='V')assert.equal((await response.json()).document,'private_canary');
  }finally{await h.close();}
 }
});
test('WebSocket frame subject cannot override the fixed authenticated user',async()=>{
 for(const mode of ['V','F']){
  const run={variant:'B0342',mode,base:'/w/123456789abc'},h=await host(socket.register,run);
  h.redis.set('sid:'+'a'.repeat(48),JSON.stringify({username:'alice',csrf:'valid-csrf'}));
  h.server.on('upgrade',(req,net,head)=>{socket.tryUpgrade(req,net,head,{db:h.db,redis:h.redis,getRun:()=>run,vulnerable:()=>mode==='V'}).catch(()=>net.destroy());});
  try{
   const result=await new Promise((resolve,reject)=>{
    const client=new WebSocket(h.url.replace('http:','ws:')+run.base+'/v5-socket',{headers:{cookie:'sid='+'a'.repeat(48)}});
    const timer=setTimeout(()=>{client.terminate();reject(Error('WebSocket timed out'));},3000);
    client.on('open',()=>client.send(JSON.stringify({action:'read',user:'bob'})));
    client.on('message',bytes=>{clearTimeout(timer);resolve(JSON.parse(bytes.toString()));client.close();});
    client.on('error',error=>{clearTimeout(timer);reject(error);});
   });
   assert.equal(mode==='V'?result.body:result.error,mode==='V'?'private_canary':'forbidden');
  }finally{await socket.reset();await h.close();}
 }
});
