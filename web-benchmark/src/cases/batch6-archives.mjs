import {mkdir,readFile,realpath,rm,stat,symlink,writeFile} from 'node:fs/promises';
import path from 'node:path';

const root='/opt/benchmark/fixtures/batch6-tar';
const variant='B0133';
const within=(parent,target)=>target===parent||target.startsWith(parent+path.sep);
const field=(header,start,length)=>header.subarray(start,start+length).toString('utf8').split('\0')[0].trim();
function octal(header,start,length){
  const value=field(header,start,length);
  if(!/^[0-7]+$/.test(value))throw new Error('Invalid TAR number');
  return parseInt(value,8);
}
function parseTar(encoded){
  if(typeof encoded!=='string'||encoded.length>50000||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error('Invalid TAR encoding');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length<1536||bytes.length>32768||bytes.length%512!==0)throw new Error('Invalid TAR length');
  const entries=[];let cursor=0,total=0,ended=false;
  while(cursor+512<=bytes.length){
    const header=bytes.subarray(cursor,cursor+512);
    if(header.every(byte=>byte===0)){ended=true;break;}
    if(field(header,257,6)!=='ustar')throw new Error('Unsupported TAR format');
    const recorded=octal(header,148,8),check=Buffer.from(header);check.fill(0x20,148,156);
    if(check.reduce((sum,byte)=>sum+byte,0)!==recorded)throw new Error('TAR checksum mismatch');
    const name=field(header,0,100),size=octal(header,124,12),type=String.fromCharCode(header[156]),link=field(header,157,100);
    if(!/^public\/[A-Za-z0-9._/-]{1,80}$/.test(name)||name.split('/').some(part=>part==='.'||part==='..'||part==='')||size>8192||!['0','2'].includes(type)||type==='2'&&size!==0)throw new Error('Unsupported TAR entry');
    const dataStart=cursor+512,dataEnd=dataStart+size;
    if(dataEnd>bytes.length)throw new Error('Truncated TAR entry');
    total+=size;if(total>16384||entries.length>=12)throw new Error('TAR budget exceeded');
    entries.push({name,type,link,data:Buffer.from(bytes.subarray(dataStart,dataEnd))});
    cursor=dataStart+Math.ceil(size/512)*512;
  }
  if(!ended||entries.length<1||bytes.length-cursor<1024||!bytes.subarray(cursor).every(byte=>byte===0))throw new Error('TAR end marker missing');
  return entries;
}

// This is a real USTAR archive with one ordinary public file, used only as a normal input.
function normalTar(){
  const data=Buffer.from('Public package guide');const header=Buffer.alloc(512);
  header.write('public/guide.txt',0);header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
  header.write(data.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);
  header.fill(0x20,148,156);header.write('0',156);header.write('ustar\0',257);header.write('00',263);
  header.write(header.reduce((sum,byte)=>sum+byte,0).toString(8).padStart(6,'0')+'\0 ',148);
  return Buffer.concat([header,Buffer.concat([data,Buffer.alloc(512-data.length)]),Buffer.alloc(1024)]).toString('base64');
}
export const definitions=[];
export const variantDefinitions=[{
  root:'R0132',variant,additionalVariant:true,title:'TARリンク展開',feature:'b6-tar',family:'archive展開境界',
  entry:'/tar-packages',allowedPaths:['tar-packages','tar-files'],
  requests:[['GET','/tar-packages',{}],['POST','/tar-packages',{tar:normalTar()}],['GET','/tar-files',{name:'guide.txt'}]],
  sessionProtectedPath:'/tar-packages',negativeDescription:'正規USTARの公開ファイルは展開でき、リンク経由の保護directory書込は成立しない。',
  implementationNote:'実USTAR header/checksumを解析してコンテナーtmpfsへ展開。Vだけpublic下の相対symlinkを許し、後続entryが保護directoryへ到達する。全条件でfixture root外への書込を禁止。'
}];
export async function reset({getRun}){
  await rm(root,{recursive:true,force:true});
  if(getRun().variant!==variant)return;
  await mkdir(path.join(root,'public'),{recursive:true});await mkdir(path.join(root,'private'),{recursive:true});
  await writeFile(path.join(root,'public','guide.txt'),'Public package guide');
  await writeFile(path.join(root,'private','report.txt'),getRun().canary);
}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>getRun().variant===variant?next():next('route');
  router.get('/tar-packages',selected,(req,res)=>res.type('html').send(page('TAR文書パッケージ','<p>公開文書のUSTARパッケージを取り込みます。</p>')));
  router.get('/tar-files',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    if(req.query.name!=='guide.txt')return res.sendStatus(404);
    res.type('text/plain').send(await readFile(path.join(root,'public','guide.txt')));
  });
  router.post('/tar-packages',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    let entries;try{entries=parseTar(req.body?.tar);}catch{return res.sendStatus(400);}
    try{
      for(const entry of entries){
        const destination=path.resolve(root,entry.name);
        if(!within(path.join(root,'public'),destination))throw new Error('Outside public root');
        if(entry.type==='2'){
          if(!vulnerable()||!/^\.\.\/[A-Za-z0-9._/-]{1,80}$/.test(entry.link))throw new Error('Link rejected');
          const resolved=path.resolve(path.dirname(destination),entry.link);
          if(!within(root,resolved))throw new Error('Link leaves fixture root');
          await mkdir(path.dirname(destination),{recursive:true});await symlink(entry.link,destination);
        }else{
          await mkdir(path.dirname(destination),{recursive:true});
          const parent=await realpath(path.dirname(destination));
          if(!within(vulnerable()?root:path.join(root,'public'),parent))throw new Error('Resolved path outside allowed root');
          await writeFile(destination,entry.data);
        }
      }
      res.json({extracted:entries.length});
    }catch{res.sendStatus(400);}
  });
}
export async function audit({getRun}){
  if(getRun().variant!==variant)return {};
  let protectedWrite=false;
  try{protectedWrite=(await stat(path.join(root,'private','proof.txt'))).isFile();}catch{}
  return {batch6Tar:{protectedWrite}};
}
