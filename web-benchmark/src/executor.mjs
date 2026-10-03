import express from 'express';
import {mkdir,writeFile,readFile,rm,chmod,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import path from 'node:path';
const app=express(); app.use(express.json({limit:'32kb'}));
const home='/tmp/execution-fixture';
let cliHttpReceipts=[];
const cliHttpServer=createServer((req,res)=>{
  if(req.url==='/public'&&req.method==='GET'){res.writeHead(200,{'content-type':'text/plain'});res.end('Public HTTP fixture');return;}
  if(req.url==='/collect'&&req.method==='POST'){
    const chunks=[];let size=0;
    req.on('data',chunk=>{size+=chunk.length;if(size>1024)req.destroy();else chunks.push(chunk);});
    req.on('end',()=>{cliHttpReceipts.push(Buffer.concat(chunks).toString('utf8'));res.writeHead(200);res.end('Collected');});return;
  }
  res.writeHead(404);res.end();
});
cliHttpServer.listen(8091,'127.0.0.1');
await mkdir(home,{recursive:true});
app.post('/reset',async(req,res)=>{
  cliHttpReceipts=[];
  await rm(home,{recursive:true,force:true}); await mkdir(home,{recursive:true});
  await writeFile(path.join(home,'private-canary.txt'),String(req.body.canary));
  await writeFile(path.join(home,'public.txt'),'Public search guide');
  for(const directory of ['public','private','trusted','uploaded'])await mkdir(path.join(home,directory));
  for(const [directory,body] of [['trusted','printf "Trusted tool\\n"'],['uploaded','cat private-canary.txt']]){
    const program=path.join(home,directory,'fixture-tool');
    await writeFile(program,'#!/bin/sh\n'+body+'\n');await chmod(program,0o755);
  }
  await writeFile(path.join(home,'remote-shell.sh'),'touch /tmp/execution-fixture/private/rsync-marker.txt\n');
  const gitInit=await runCli('/usr/bin/git',['init','--bare',path.join(home,'public','repository.git')]);
  if(gitInit.code!==0)return res.status(500).json({error:'Git fixture initialization failed'});
  res.json({ok:true});
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
app.get('/cli-public-file/:name',async(req,res)=>{
  if(!/^[a-z][a-z0-9-]{0,25}\.txt$/.test(req.params.name))return res.sendStatus(400);
  try{res.type('text/plain').send(await readFile(path.join(home,'public',req.params.name),'utf8'));}catch{res.sendStatus(404);}
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
const cliPrograms={B0072:{binary:'/usr/bin/awk'},B0073:{binary:'/usr/bin/sed'},B0078:{binary:'/usr/bin/find'}};
app.post('/cli-evaluate',async(req,res)=>{
  const variant=String(req.body?.variant||''),config=cliPrograms[variant],expression=req.body?.expression;
  if(!config||typeof expression!=='string'||expression.length<1||Buffer.byteLength(expression)>160||/[\r\n\0]/.test(expression))return res.sendStatus(400);
  const vulnerable=req.body.vulnerable===true;
  let args,input='Guide\n';
  if(variant==='B0072'){
    const match=/^([0-9]{1,3})([+*])([0-9]{1,3})$/.exec(expression);
    if(!vulnerable&&!match)return res.sendStatus(400);
    args=[`BEGIN { print ${vulnerable?expression:match[1]+match[2]+match[3]} }`];
  }else if(variant==='B0073'){
    const match=/^s\/Guide\/([A-Za-z]{1,24})\/p$/.exec(expression);
    if(!vulnerable&&!match)return res.sendStatus(400);
    args=['-n',vulnerable?expression:`s/Guide/${match[1]}/p`];
  }else{
    const match=/^-name ([a-z][a-z0-9.]{0,30})$/.exec(expression);
    if(!vulnerable&&!match)return res.sendStatus(400);
    const terms=vulnerable?expression.split(/\s+/):['-name',match[1]];
    if(terms.length>10)return res.sendStatus(400);
    args=[home,'-maxdepth','1','-type','f',...terms];input='';
  }
  const result=await new Promise(resolve=>{
    const child=spawn(config.binary,args,{cwd:home,env:{PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','pipe']});
    let output='',error='',done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish({code:124,output,error:'timeout'});},800);
    child.stdout.on('data',part=>{output+=part.toString();if(output.length>2048)child.kill('SIGKILL');});
    child.stderr.on('data',part=>{error+=part.toString();if(error.length>512)child.kill('SIGKILL');});
    child.stdin.on('error',()=>{});
    child.once('error',event=>finish({code:127,output,error:event.message}));
    child.once('close',code=>finish({code,output:output.slice(0,2048),error:error.slice(0,512)}));
    child.stdin.end(input);
  });
  res.status(result.code===0?200:422).json(result);
});
async function runCli(binary,args,input='',environment={PATH:'/usr/bin:/bin'}){
  return new Promise(resolve=>{
    const child=spawn(binary,args,{cwd:home,env:environment,stdio:['pipe','pipe','pipe']});
    let output='',error='',done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish({code:124,output,error:'timeout'});},800);
    child.stdout.on('data',part=>{output+=part.toString();if(output.length>2048)child.kill('SIGKILL');});
    child.stderr.on('data',part=>{error+=part.toString();if(error.length>512)child.kill('SIGKILL');});
    child.stdin.on('error',()=>{});
    child.once('error',event=>finish({code:127,output,error:event.message}));
    child.once('close',code=>finish({code,output:output.slice(0,2048),error:error.slice(0,512)}));
    child.stdin.end(input);
  });
}
const boundaryVariants=new Set(['B0074','B0075','B0077','B0079','B0080','B0081','B0082','B0083','B0085','B0087','B0088','B0090']);
app.post('/cli-boundary',async(req,res)=>{
  const variant=String(req.body?.variant||''),value=req.body?.value,vulnerable=req.body?.vulnerable===true;
  if(!boundaryVariants.has(variant)||typeof value!=='string'||Buffer.byteLength(value)>160||value.length<1||value.includes('\0'))return res.sendStatus(400);
  let result;
  if(variant==='B0074'){
    const local='file:///tmp/execution-fixture/public/repository.git';
    if(!vulnerable&&value!==local)return res.sendStatus(400);
    result=await runCli('/usr/bin/git',['ls-remote',vulnerable?value:local],'',{PATH:'/usr/bin:/bin',GIT_ALLOW_PROTOCOL:vulnerable?'file:ext':'file'});
  }else if(variant==='B0075'){
    if(!vulnerable&&value!=='local')return res.sendStatus(400);
    result=value==='local'
      ?await runCli('/usr/bin/rsync',['-a',path.join(home,'public.txt'),path.join(home,'public','synced.txt')])
      :await runCli('/usr/bin/rsync',['-e',value,path.join(home,'public.txt'),'fixture@127.0.0.1:/tmp/execution-fixture/public/synced.txt']);
  }else if(variant==='B0077'){
    if(!vulnerable&&value!=='-colorspace Gray')return res.sendStatus(400);
    const options=value.split(/\s+/);
    if(options.length>5||options.some(option=>!option))return res.sendStatus(400);
    result=await runCli('/usr/bin/convert',['-size','1x1','xc:red',...(vulnerable?options:['-colorspace','Gray']),path.join(home,'public','image.png')]);
  }else if(variant==='B0082'){
    const allowed='file:///tmp/execution-fixture/public.txt';
    if(!vulnerable&&value!==allowed)return res.sendStatus(400);
    const output=path.join(home,'public','media.bin');
    result=await runCli('/usr/bin/ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-f','data','-i',vulnerable?value:allowed,'-map','0:0','-c','copy','-f','data',output]);
    if(result.code===0)result.output=await readFile(output,'utf8');
  }else if(variant==='B0079'){
    if(!vulnerable&&value!=='public.txt')return res.sendStatus(400);
    const args=['-cf',path.join(home,'package.tar'),'--checkpoint=1',...(vulnerable?[value,'public.txt']:['--','public.txt'])];
    result=await runCli('/usr/bin/tar',args);
  }else if(variant==='B0090'){
    if(!vulnerable&&value!=='public.txt')return res.sendStatus(400);
    if(vulnerable){
      const responseFile=path.join(home,'arguments.txt');await writeFile(responseFile,value+'\n');
      result=await runCli('/usr/bin/xargs',['-a',responseFile,'/usr/bin/tar','-cf',path.join(home,'response-package.tar'),'--checkpoint=1']);
    }else result=await runCli('/usr/bin/tar',['-cf',path.join(home,'response-package.tar'),'--','public.txt']);
  }else if(variant==='B0080'){
    const publicUrl='http://127.0.0.1:8091/public';
    if(!vulnerable&&value!==publicUrl)return res.sendStatus(400);
    if(vulnerable){
      const args=value.split(/\s+/);
      if(args.length>8||args.some(arg=>!arg))return res.sendStatus(400);
      result=await runCli('/usr/bin/curl',['--silent','--show-error','--max-time','1',...args]);
    }else{
      const response=await fetch(publicUrl,{signal:AbortSignal.timeout(800)});
      result={code:response.ok?0:22,output:await response.text(),error:''};
    }
  }else if(variant==='B0081'){
    if(!vulnerable&&!/^public\/[a-z][a-z0-9-]{0,25}\.txt$/.test(value))return res.sendStatus(400);
    if(vulnerable)result=await runCli('/bin/sh',['-c',`printf 'Public report\\n' > ${value}`]);
    else{await writeFile(path.join(home,value),'Public report\n');result={code:0,output:'Public report',error:''};}
  }else if(variant==='B0083'){
    if(/[\r]/.test(value)||!vulnerable&&value.includes('\n'))return res.sendStatus(400);
    result=vulnerable?await runCli('/bin/sh',['-s'],`echo ${value}\n`):await runCli('/usr/bin/printf',['%s\n',value]);
  }else if(variant==='B0085'){
    if(!['trusted','uploaded'].includes(value))return res.sendStatus(400);
    result=vulnerable
      ?await runCli('/bin/sh',['-c','exec /bin/sh "$(command -v fixture-tool)"'],'',{PATH:path.join(home,value)+':/usr/bin:/bin'})
      :await runCli('/bin/sh',[path.join(home,'trusted','fixture-tool')]);
  }else if(variant==='B0087'){
    if(/[\r\n]/.test(value))return res.sendStatus(400);
    result=vulnerable
      ?await runCli('/bin/sh',['-c','/bin/sh -c "printf %s $1"','fixture',value])
      :await runCli('/usr/bin/printf',['%s',value]);
  }else{
    if(value.includes('\r')||!vulnerable&&value.includes('\n'))return res.sendStatus(400);
    if(vulnerable){
      const program=path.join(home,'generated.sh');await writeFile(program,'echo '+value+'\n');
      result=await runCli('/bin/sh',[program]);
    }else result=await runCli('/usr/bin/printf',['%s\n',value]);
  }
  let protectedWrite=false;try{protectedWrite=(await stat(path.join(home,'private','proof.txt'))).isFile();}catch{}
  let transportMarker=false;
  if(['B0074','B0075'].includes(variant)){
    const name=variant==='B0074'?'git-marker.txt':'rsync-marker.txt';
    try{transportMarker=(await stat(path.join(home,'private',name))).isFile();}catch{}
  }
  let imageMarker=false;
  if(variant==='B0077')try{imageMarker=(await stat(path.join(home,'private','image-marker.png'))).isFile();}catch{}
  const secret=variant==='B0080'?(await readFile(path.join(home,'private-canary.txt'),'utf8')).trim():'';
  const sentSecret=variant==='B0080'&&cliHttpReceipts.some(body=>body.includes(secret));
  res.status(result.code===0?200:422).json({...result,protectedWrite,sentSecret,transportMarker,imageMarker});
});
app.listen(8090,'0.0.0.0');
