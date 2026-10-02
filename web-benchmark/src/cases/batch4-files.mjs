import {mkdir,readFile,writeFile,rm,readdir,realpath,open,symlink,copyFile,unlink,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {groups} from './batch4-selection.mjs';

const ids=Object.values(groups.files).flat(),active=new Set(ids);
const root='/opt/benchmark/fixtures/v4-files';
const publicRoot=path.join(root,'public'),privateRoot=path.join(root,'private'),uploadRoot=path.join(root,'uploads'),templateRoot=path.join(root,'templates');
const normal={B0122:'guide.txt',B0125:'guide.txt',B0128:'help',B0129:'own.txt',B0130:'own.txt',B0131:'own-copy.txt',B0134:'*.txt',B0140:'guide.txt',B0136:'guide.txt',B0139:'new.txt'};
const title={B0122:'共有ファイル',B0125:'公開ファイル',B0128:'ページ案内',B0129:'下書き保存',B0130:'下書き削除',B0131:'文書コピー',B0134:'ファイル検索',B0140:'書庫の取込',B0136:'文書名',B0139:'上書き保存'};
export const variantDefinitions=Object.entries(groups.files).flatMap(([cause,variants])=>variants.map(variant=>({
 root:cause,variant,additionalVariant:true,title:title[variant],feature:'v4-file-'+variant.slice(1),family:'ファイルroot境界',
 entry:'/v4-files',allowedPaths:['v4-files'],requests:[['GET','/v4-files',{}],['POST','/v4-files',{name:normal[variant]}],['GET','/v4-files/public/guide.txt',{}]],
 negativeDescription:'公開ファイルの読取りや正規の保存は成功し、非公開ファイルの読取り・変更・公開配置を許さない。',
 implementationNote:'固定tmpfs内の実ファイルで正規化・相対path・link・コピー境界を比較する。'
})));
const exists=async filename=>{try{await stat(filename);return true;}catch{return false;}};
const within=(base,filename)=>{const relative=path.relative(base,filename);return relative===''||relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
export async function reset({getRun}){
 if(!active.has(getRun().variant))return;
 await rm(root,{recursive:true,force:true});
 for(const directory of [publicRoot,privateRoot,uploadRoot,templateRoot,path.join(root,'public-extra')])await mkdir(directory,{recursive:true});
 await writeFile(path.join(publicRoot,'guide.txt'),'Public user guide');
 await writeFile(path.join(privateRoot,'report.txt'),getRun().canary);
 await writeFile(path.join(root,'public-extra','secret.txt'),getRun().canary);
 await writeFile(path.join(templateRoot,'help.txt'),'Help page');
 await writeFile(path.join(uploadRoot,'own.txt'),'Own draft');
 await symlink(path.join(privateRoot,'report.txt'),path.join(uploadRoot,'current.txt'));
}
async function execute(id,name,v,canary){
 if(id==='B0122'){
  const target=v?path.resolve(publicRoot,name):path.resolve(publicRoot,'.'+path.sep+name);
  if(!v&&!within(publicRoot,target))return {status:403};
  return {data:await readFile(target,'utf8')};
 }
 if(id==='B0125'){
  const target=path.resolve(publicRoot,name),actual=await realpath(target);
  if(!(v?actual.startsWith(publicRoot):within(publicRoot,actual)))return {status:403};
  return {data:await readFile(actual,'utf8')};
 }
 if(id==='B0128'){
  const target=path.resolve(templateRoot,name+'.txt');
  if(!v&&(!/^[a-z]{1,20}$/.test(name)||!within(templateRoot,target)))return {status:403};
  return {data:await readFile(target,'utf8')};
 }
 if(id==='B0129'){
  const target=path.resolve(uploadRoot,name);
  if(!v&&!within(uploadRoot,target))return {status:403};
  await writeFile(target,'Saved draft');return {saved:true,pathOutsideUploads:!within(uploadRoot,target)};
 }
 if(id==='B0130'){
  const target=path.resolve(uploadRoot,name);
  if(!v&&!within(uploadRoot,target))return {status:403};
  await unlink(target);return {deleted:true,pathOutsideUploads:!within(uploadRoot,target)};
 }
 if(id==='B0131'){
  const target=path.resolve(uploadRoot,name);
  if(!v&&!within(uploadRoot,target))return {status:403};
  await copyFile(path.join(privateRoot,'report.txt'),target);return {copied:true,pathOutsideUploads:!within(uploadRoot,target)};
 }
 if(id==='B0134'){
  const directory=path.resolve(publicRoot,path.dirname(name)),pattern=path.basename(name);
  if(!v&&!within(publicRoot,directory))return {status:403};
  if(!/^[a-zA-Z0-9*.-]{1,32}$/.test(pattern))return {status:400};
  const matcher=new RegExp('^'+pattern.replaceAll('.','\\.').replaceAll('*','.*')+'$');
  const names=(await readdir(directory)).filter(entry=>matcher.test(entry)).slice(0,16);
  return {matches:await Promise.all(names.map(async entry=>({name:entry,data:await readFile(path.join(directory,entry),'utf8')})))};
 }
 if(id==='B0140'){
  // One bounded USTAR entry is assembled from the supplied archive name, then
  // parsed and extracted through the same filesystem operation in both arms.
  const archive=makeTar(name,canary),entry=readTar(archive),target=path.resolve(uploadRoot,entry.name);
  if(!v&&!within(uploadRoot,target))return {status:403};
  await writeFile(target,entry.data);return {extracted:true,pathOutsideUploads:!within(uploadRoot,target)};
 }
 if(id==='B0136'){
  const raw=path.resolve(publicRoot,name),normalized=path.resolve(publicRoot,name.normalize('NFKC'));
  if(v){if(name.includes('..'))return {status:403};return {data:await readFile(normalized,'utf8')};}
  if(!within(publicRoot,normalized))return {status:403};
  return {data:await readFile(normalized,'utf8'),checked:raw};
 }
 if(id==='B0139'){
  if(!/^[a-z][a-z0-9.-]{1,30}$/.test(name))return {status:400};
  const target=path.join(uploadRoot,name);
  if(v){await writeFile(target,'Overwritten draft');return {written:true,followedLink:name==='current.txt'};}
  try{const handle=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await handle.writeFile('Saved draft');}finally{await handle.close();}return {written:true,followedLink:false};}
  catch{return {status:403};}
 }
 throw Error('Unknown file variant');
}
function makeTar(name,data){
 const payload=Buffer.from(data),header=Buffer.alloc(512),write=(offset,size,value)=>header.write(String(value).slice(0,size),offset,'utf8');
 write(0,100,name);write(100,8,'0000644\0');write(108,8,'0000000\0');write(116,8,'0000000\0');write(124,12,payload.length.toString(8).padStart(11,'0')+'\0');write(136,12,'00000000000\0');header.fill(32,148,156);header[156]=48;write(257,6,'ustar\0');write(263,2,'00');
 const checksum=header.reduce((sum,value)=>sum+value,0);write(148,8,checksum.toString(8).padStart(6,'0')+'\0 ');
 return Buffer.concat([header,payload,Buffer.alloc((512-payload.length%512)%512),Buffer.alloc(1024)]);
}
function readTar(buffer){
 if(buffer.length>4096||buffer.toString('utf8',257,262)!=='ustar')throw Error('Invalid archive');
 const name=buffer.toString('utf8',0,100).split('\0')[0],size=parseInt(buffer.toString('utf8',124,136).trim(),8);
 if(!name||!Number.isInteger(size)||size<0||size>1024)return null;
 return {name,data:buffer.subarray(512,512+size)};
}
export function register(router,{getRun,vulnerable,page,esc}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v4-files/public/:name',selected,async(req,res)=>{
  if(!/^[a-z0-9.-]{1,40}$/.test(req.params.name))return res.sendStatus(400);
  try{res.type('text').send(await readFile(path.join(publicRoot,req.params.name),'utf8'));}catch{res.sendStatus(404);}
 });
 router.get('/v4-files',selected,(req,res)=>res.type('html').send(page(title[getRun().variant],`<p><a href="${getRun().base}/v4-files/public/guide.txt">利用案内</a></p><form method="post"><input name="name" value="${esc(normal[getRun().variant])}"><button>実行</button></form>`)));
 router.post('/v4-files',selected,async(req,res)=>{
  const name=req.body?.name;if(typeof name!=='string'||Buffer.byteLength(name)>160)return res.sendStatus(400);
  try{const result=await execute(getRun().variant,name,vulnerable(),getRun().canary);res.status(result.status||200).json(result);}
  catch{res.sendStatus(404);}
 });
}
export async function audit({getRun}){
 if(!active.has(getRun().variant))return {};
 const privateFile=path.join(privateRoot,'report.txt'),privateReportExists=await exists(privateFile);
 return {batch4Files:{variant:getRun().variant,privateReportExists,privateReportIntact:privateReportExists&&(await readFile(privateFile,'utf8'))===getRun().canary,publicLeakExists:await exists(path.join(publicRoot,'leak.txt'))}};
}
