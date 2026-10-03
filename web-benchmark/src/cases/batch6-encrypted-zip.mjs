import {readFile,rm,writeFile} from 'node:fs/promises';
import {zipRead} from './batch2-storage.mjs';

const variant='B0159',stored='/opt/benchmark/fixtures/encrypted-package.zip';
const normalZip='UEsDBBQAAAgAAAAAAAC65bpQFwAAABcAAAAJAAAAZ3VpZGUudHh0T3JkaW5hcnkgcGFja2FnZWQgZ3VpZGVQSwECFAAUAAAIAAAAAAAAuuW6UBcAAAAXAAAACQAAAAAAAAAAAAAAAAAAAAAAZ3VpZGUudHh0UEsFBgAAAAABAAEANwAAAD4AAAAAAA==';
let published=false,encrypted=false,scanStatus=null;
const unsafe=bytes=>/<\s*(script|iframe|object|embed)\b|\bon[a-z]+\s*=|javascript\s*:/i.test(bytes.toString('utf8'));
function encryptedZip(base64){
  if(typeof base64!=='string'||base64.length>30000||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw Error('Invalid ZIP encoding');
  const bytes=Buffer.from(base64,'base64'),end=bytes.length-22;
  if(end<76||bytes.length>20000||bytes.readUInt32LE(end)!==0x06054b50||bytes.readUInt16LE(end+8)!==1||bytes.readUInt16LE(end+10)!==1||bytes.readUInt16LE(end+20)!==0)throw Error('Invalid ZIP end');
  const central=bytes.readUInt32LE(end+16),directorySize=bytes.readUInt32LE(end+12);
  if(central+directorySize!==end||directorySize<46||bytes.readUInt32LE(central)!==0x02014b50)throw Error('Invalid ZIP directory');
  const flags=bytes.readUInt16LE(central+8),method=bytes.readUInt16LE(central+10),packed=bytes.readUInt32LE(central+20),unpacked=bytes.readUInt32LE(central+24),nameSize=bytes.readUInt16LE(central+28),local=bytes.readUInt32LE(central+42);
  if(flags!==0x801||method!==0||packed<13||packed>8192||unpacked<1||unpacked>8192||packed!==unpacked+12||nameSize<1||nameSize>80||local!==0||directorySize!==46+nameSize)throw Error('Unsupported encrypted ZIP');
  const name=bytes.subarray(central+46,central+46+nameSize).toString('utf8');
  if(name!=='report.html'||bytes.readUInt32LE(0)!==0x04034b50||bytes.readUInt16LE(6)!==flags||bytes.readUInt16LE(8)!==method||bytes.readUInt32LE(18)!==packed||bytes.readUInt32LE(22)!==unpacked||bytes.readUInt16LE(26)!==nameSize||bytes.readUInt16LE(28)!==0||!bytes.subarray(30,30+nameSize).equals(bytes.subarray(central+46,central+46+nameSize))||30+nameSize+packed!==central)throw Error('ZIP local mismatch');
  return bytes;
}
export const definitions=[{root:'R0159',variant,title:'暗号化ZIP検査省略',feature:'b6-encrypted-zip',family:'検査不能アーカイブ公開',entry:'/zip-packages',allowedPaths:['zip-packages','zip-download'],requests:[['GET','/zip-packages',{}],['POST','/zip-packages',{zip:normalZip}],['GET','/zip-download',{}]],sessionProtectedPath:'/zip-packages',negativeDescription:'通常の未暗号化ZIPは検査して公開でき、復号できないZIPを検査済みとして公開しない。',implementationNote:'実ZIPのlocal/central header・暗号化flag・整合性を読み、通常ZIPは既存CRC検証parserで全内容を検査。Vだけ復号不能なZipCrypto archiveを検査済みとして公開し、F/Nは拒否する。'}];
export const variantDefinitions=[];
export async function reset(){published=false;encrypted=false;scanStatus=null;await rm(stored,{force:true});}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>getRun().variant===variant?next():next('route');
  router.get('/zip-packages',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    res.type('html').send(page('ZIP文書パッケージ','<p>検査が終わったパッケージのみ公開します。</p>'));
  });
  router.post('/zip-packages',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    let bytes,isEncrypted=false;
    try{
      const entries=zipRead(req.body?.zip);
      if(entries.some(entry=>unsafe(entry.data)))return res.sendStatus(400);
      bytes=Buffer.from(req.body.zip,'base64');
    }catch{
      try{bytes=encryptedZip(req.body?.zip);isEncrypted=true;}catch{return res.sendStatus(400);}
      if(!vulnerable())return res.sendStatus(422);
    }
    await writeFile(stored,bytes);
    published=true;encrypted=isEncrypted;scanStatus=isEncrypted?'passed_without_decryption':'passed_after_inspection';
    res.status(201).json({published:true,scanStatus,download:getRun().base+'/zip-download'});
  });
  router.get('/zip-download',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    if(!published)return res.sendStatus(404);
    res.type('application/zip').send(await readFile(stored));
  });
}
export async function audit({getRun}){return getRun().variant===variant?{batch6EncryptedZip:{published,encrypted,scanStatus}}:{};}
