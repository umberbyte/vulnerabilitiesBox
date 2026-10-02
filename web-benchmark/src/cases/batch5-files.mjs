import {mkdir,writeFile,readFile,link,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {groups} from './batch5-selection.mjs';

const ids=Object.values(groups.files).flat(),active=new Set(ids);
const root='/opt/benchmark/fixtures/v5-files';
const names={B0127:'linked.txt',B0459:'temporary.txt',B0460:'backup.sql',B0467:'app.js.map',B0468:'.git/log',B0469:'.env'};
const titles={B0127:'公開リンク',B0459:'処理中の一時ファイル',B0460:'データバックアップ',B0467:'ソースマップ',B0468:'履歴メタデータ',B0469:'設定ファイル'};
export const definitions=[];
export const variantDefinitions=ids.map(variant=>({root:variant==='B0127'?'R0126':'R0455',variant,additionalVariant:true,title:titles[variant],family:'公開ファイル配置境界',feature:'v5-files-'+variant.slice(1),entry:'/v5-files',allowedPaths:['v5-files'],requests:[['GET','/v5-files',{name:'guide.txt'}],...(variant==='B0127'||variant==='B0459'?[['POST','/v5-files',{action:variant==='B0127'?'link':'process'}]]:[])],negativeDescription:'公開ガイドは読めるが、保護inodeや秘密の一時・バックアップ・設定ファイルは取得できない。',implementationNote:'コンテナtmpfsに実ファイルを配置し、公開ルートからの読取可否で比較する。'}));
export async function reset({getRun,vulnerable}){
 await rm(root,{recursive:true,force:true});if(!active.has(getRun().variant))return;
 const pub=path.join(root,'public'),priv=path.join(root,'private');await mkdir(pub,{recursive:true});await mkdir(priv,{recursive:true});
 await writeFile(path.join(pub,'guide.txt'),'Public file guide');
 const id=getRun().variant,secret=getRun().canary;
 await writeFile(path.join(priv,'report.txt'),secret);
 if(id==='B0459')return;
 if(id==='B0127')return;
 const filename=names[id],content=id==='B0467'?JSON.stringify({version:3,sources:['app.ts'],sourcesContent:[`const fixtureSecret='${secret}'`]}):id==='B0468'?`commit fixture-secret=${secret}\n`:id==='B0460'?`COPY secret FROM stdin;\n${secret}\n`:`FIXTURE_SECRET=${secret}\n`;
 const target=path.join(vulnerable()?pub:priv,filename);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,content);
}
export function register(router,{getRun,vulnerable,page,esc}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v5-files',selected,async(req,res)=>{
  const id=getRun().variant,name=String(req.query.name||'guide.txt');
  if(!['guide.txt',names[id]].includes(name))return res.sendStatus(404);
  const target=path.join(root,'public',name);
  try{
   const data=await readFile(target);if(req.query.view==='html')return res.type('html').send(page(titles[id],`<a href="?name=${encodeURIComponent(names[id])}">添付</a><p>${esc(name)}</p>`));
   res.type(id==='B0467'?'application/json':'text/plain').send(data);
  }catch{res.sendStatus(404);}
 });
 router.post('/v5-files',selected,async(req,res)=>{
  const id=getRun().variant;if(!['B0127','B0459'].includes(id))return res.sendStatus(404);
  if(id==='B0127'){
   if(req.body?.action!=='link')return res.sendStatus(400);
   if(!vulnerable())return res.sendStatus(403);
   try{await link(path.join(root,'private','report.txt'),path.join(root,'public','linked.txt'));}catch(error){if(error.code!=='EEXIST')throw error;}
  }else{
   if(req.body?.action!=='process')return res.sendStatus(400);
   const dest=path.join(root,vulnerable()?'public':'private','temporary.txt');await writeFile(dest,getRun().canary);
  }
  res.json({completed:true,download:'/v5-files?name='+encodeURIComponent(names[id])});
 });
}
export async function audit({getRun}){
 if(!active.has(getRun().variant))return {};
 const id=getRun().variant;
 let visible=false,sameInode=false;
 try{const publicFile=await stat(path.join(root,'public',names[id]));visible=true;if(id==='B0127')sameInode=publicFile.ino===(await stat(path.join(root,'private','report.txt'))).ino;}catch{}
 return {batch5Files:{variant:id,publicSecretFile:visible,hardlinkSameInode:sameInode}};
}
