import Busboy from 'busboy';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {groups,primaryRoots} from './batch5-selection.mjs';

const ids=groups.parsing.R0150,active=new Set(ids),root='/opt/benchmark/fixtures/v5-parsing';
const titles={B0150:'文書アップロード',B0359:'文書指定',B0360:'文書更新',B0361:'JSON文書更新',B0370:'圧縮済み更新'};
const normal={B0150:{description:'public document'},B0359:{target:101},B0360:{target:101,action:'read'},B0361:{target:101,action:'read'},B0370:{contact:'alice.updated@example.test'}};
const all=ids.map(variant=>({root:'R0150',variant,title:titles[variant],feature:'v5-parse-'+variant.slice(1),family:'入力解析の不一致',entry:'/v5-parse',allowedPaths:['v5-parse'],requests:[['GET','/v5-parse',{}],...(variant==='B0150'?[]:[['POST','/v5-parse',normal[variant]]])],negativeDescription:'単一の正常入力は処理され、重複・別媒体・圧縮で検証対象と処理対象がずれない。',implementationNote:'Nodeのbody parser、multipart stream、raw JSON、PostgreSQL文書を使用する。',...(primaryRoots.has('R0150')&&variant==='B0150'?{}:{additionalVariant:true})}));
export const definitions=all.filter(x=>!x.additionalVariant);
export const variantDefinitions=all.filter(x=>x.additionalVariant);
let lastSaved='';
export async function reset({getRun}){lastSaved='';await rm(root,{recursive:true,force:true});if(active.has(getRun().variant))await mkdir(root,{recursive:true});}
async function multipart(req){
 const parser=Busboy({headers:req.headers,limits:{files:3,fileSize:2048,fields:4}}),files=[];
 parser.on('file',(field,stream,info)=>{let chunks=[],size=0;stream.on('data',part=>{size+=part.length;if(size<=2048)chunks.push(part);});stream.on('end',()=>files.push({field,name:info.filename,data:Buffer.concat(chunks).toString('utf8'),size}));});
 await new Promise((resolve,reject)=>{parser.on('error',reject);parser.on('close',resolve);req.pipe(parser);});
 return files;
}
const integer=value=>Number.isSafeInteger(Number(value))&&Number(value)>=1?Number(value):null;
export function register(router,{db,getRun,vulnerable,requireLogin,page,esc}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v5-parse',selected,(req,res)=>res.type('html').send(page(titles[getRun().variant],'<form method="post" enctype="multipart/form-data"><input type="file" name="file"><button>送信</button></form>')));
 router.get('/v5-parse/uploaded',selected,async(req,res)=>{
  if(getRun().variant!=='B0150')return res.sendStatus(404);
  try{res.type('text/plain').send(await readFile(root+'/saved.txt','utf8'));}catch{res.sendStatus(404);}
 });
 router.post('/v5-parse',selected,async(req,res)=>{
  if(!requireLogin(req,res))return;
  const id=getRun().variant,v=vulnerable();
  if(id==='B0150'){
   if(!req.is('multipart/form-data'))return res.sendStatus(415);
   let files;try{files=await multipart(req);}catch{return res.sendStatus(400);}
   if(files.length<1||files.some(f=>f.field!=='file'||f.size>2048))return res.sendStatus(400);
   if(!v&&files.length!==1)return res.sendStatus(400);
   if(files[0].data.includes('PRIVATE:'))return res.sendStatus(403);
   const saved=files.at(-1).data;lastSaved=saved;await writeFile(root+'/saved.txt',saved);
   return res.json({stored:true,download:getRun().base+'/v5-parse/uploaded'});
  }
  if(id==='B0359'){
   const all=new URL(req.originalUrl,'http://local').searchParams.getAll('target');if(!all.length&&req.body?.target!==undefined)all.push(String(req.body.target));
   if(!all.length)return res.sendStatus(400);
   if(!v&&all.length!==1)return res.sendStatus(400);
   const inspected=integer(all[0]),used=integer(all.at(-1));
   if(inspected!==101||!used)return res.sendStatus(403);
   const row=(await db.query('SELECT id,owner,body FROM documents WHERE id=$1',[used])).rows[0];if(!row)return res.sendStatus(404);
   if(!v&&row.owner!==req.member.name)return res.sendStatus(403);
   return res.json({document:row.body});
  }
  if(id==='B0360'||id==='B0361'){
   const inspected=id==='B0360'?integer(new URL(req.originalUrl,'http://local').searchParams.get('target')??req.body?.target):integer((req.rawJson||'').match(/"target"\s*:\s*(\d+)/)?.[1]);
   const used=integer(req.body?.target);
   if(id==='B0361'&&!v&&(req.rawJson||'').match(/"target"\s*:/g)?.length!==1)return res.sendStatus(400);
   if(inspected!==101||!used)return res.sendStatus(403);
   if(!v&&inspected!==used)return res.sendStatus(403);
   const row=(await db.query('SELECT id,owner,body FROM documents WHERE id=$1',[used])).rows[0];if(!row)return res.sendStatus(404);
   if(!v&&row.owner!==req.member.name)return res.sendStatus(403);
   return res.json({document:row.body});
  }
  if(id==='B0370'){
   const contact=String(req.body?.contact||'');if(!/^[a-z0-9_.+-]+@[a-z0-9.-]+$/i.test(contact))return res.sendStatus(400);
   const compressed=req.headers['content-encoding']==='gzip';
   if(!v||!compressed){if(contact.endsWith('@private.example.test'))return res.sendStatus(403);}
   await db.query('UPDATE users SET contact=$1 WHERE name=$2',[contact,req.member.name]);
   return res.json({changed:true,contact});
  }
  res.sendStatus(404);
 });
}
export async function audit({getRun}){return active.has(getRun().variant)?{batch5Parsing:{variant:getRun().variant,lastSaved}}:{};}
