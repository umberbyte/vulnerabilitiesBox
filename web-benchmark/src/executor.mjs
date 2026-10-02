import express from 'express';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const app=express(); app.use(express.json({limit:'32kb'}));
const home='/tmp/execution-fixture';
await mkdir(home,{recursive:true});
app.post('/reset',async(req,res)=>{
  await rm(home,{recursive:true,force:true}); await mkdir(home,{recursive:true});
  await writeFile(path.join(home,'private-canary.txt'),String(req.body.canary)); res.json({ok:true});
});
app.post('/store',async(req,res)=>{
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(req.body.id)||typeof req.body.source!=='string') return res.sendStatus(400);
  const extension=req.body.executable?'.mjs':'.txt';
  await writeFile(path.join(home,req.body.id+extension),req.body.source); res.json({ok:true});
});
app.get('/download/:id',async(req,res)=>{
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(req.params.id))return res.sendStatus(400);
  try{res.type('text').send(await readFile(path.join(home,req.params.id+'.txt'),'utf8'));}catch{res.sendStatus(404);}
});
app.get('/execute/:id',async(req,res)=>{
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(req.params.id)) return res.sendStatus(400);
  const file=path.join(home,req.params.id+'.mjs');
  try {await readFile(file);} catch {return res.sendStatus(404);}
  // The container, rather than the permission model, is the security boundary.
  // No host mounts, DB credentials, or data network are attached to this worker.
  const child=spawn(process.execPath,['--permission',`--allow-fs-read=${home}`,file],{cwd:home,env:{},stdio:['ignore','pipe','pipe']});
  let stdout='',overflow=false;
  const timeout=setTimeout(()=>child.kill('SIGKILL'),1500);
  child.stdout.on('data',chunk=>{stdout+=chunk.toString(); if(stdout.length>4096){overflow=true;child.kill('SIGKILL');}});
  child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timeout);if(!res.headersSent)res.sendStatus(500);});
  child.on('close',code=>{clearTimeout(timeout);if(!res.headersSent)res.status(code===0&&!overflow?200:422).type('text').send(stdout.slice(0,4096));});
});
app.listen(8090,'0.0.0.0');
