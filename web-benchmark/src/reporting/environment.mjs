import {open} from 'node:fs/promises';
import {availableParallelism,release} from 'node:os';

const versionKeys=['node','v8','uv','openssl','zlib'];
const token=value=>typeof value==='string'&&/^[A-Za-z0-9._+~-]{1,160}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const bytes=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(value)&&BigInt(value)<=18446744073709551615n;
const only=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).every(key=>keys.includes(key));
const unavailable={status:'unavailable'};

// These three local files are the entire input surface. No environment variables,
// process arguments, hostname, paths, Docker socket, or subprocesses are read.
async function localFile(path){
  let file;
  try{file=await open(path,'r');const buffer=Buffer.alloc(4097),{bytesRead}=await file.read(buffer,0,buffer.length,0);return buffer.subarray(0,bytesRead).toString('utf8');}
  catch{return null;}
  finally{await file?.close();}
}

export function distribution(text){
  if(text==null)return {...unavailable};
  if(typeof text!=='string'||Buffer.byteLength(text)>4096)return {status:'invalid'};
  const fields={};
  for(const line of text.split(/\r?\n/)){
    const match=/^(ID|VERSION_ID)=(.*)$/.exec(line);
    if(!match)continue;
    if(Object.hasOwn(fields,match[1]))return {status:'invalid'};
    const raw=match[2],value=/^(["']).*\1$/.test(raw)?raw.slice(1,-1):raw;
    if(!token(value))return {status:'invalid'};
    fields[match[1]]=value;
  }
  if(!fields.ID)return {status:'invalid'};
  return {status:'recorded',id:fields.ID,versionId:fields.VERSION_ID??null};
}

export function memoryLimit(text){
  if(text==null)return {...unavailable};
  if(typeof text!=='string'||text.length>80)return {status:'invalid'};
  const value=text.trim();
  if(value==='max')return {status:'unlimited'};
  return bytes(value)?{status:'limited',bytes:value}:{status:'invalid'};
}

export function cpuLimit(text){
  if(text==null)return {...unavailable};
  if(typeof text!=='string'||text.length>80)return {status:'invalid'};
  const match=/^(max|[1-9][0-9]*)\s+([1-9][0-9]*)$/.exec(text.trim());
  if(!match||!positive(Number(match[2])))return {status:'invalid'};
  if(match[1]==='max')return {status:'unlimited',periodMicroseconds:Number(match[2])};
  return positive(Number(match[1]))?{status:'limited',quotaMicroseconds:Number(match[1]),periodMicroseconds:Number(match[2])}:{status:'invalid'};
}

export async function environmentSnapshot({read=localFile,platform=process.platform,architecture=process.arch,versions=process.versions,kernelRelease=release(),parallelism=availableParallelism(),capturedAt=new Date().toISOString()}={}){
  const selected=Object.fromEntries(versionKeys.filter(key=>token(versions[key])).map(key=>[key,versions[key]]));
  const optional=async path=>{try{return await read(path);}catch{return null;}};
  const [os,memory,cpu]=platform==='linux'?await Promise.all(['/etc/os-release','/sys/fs/cgroup/memory.max','/sys/fs/cgroup/cpu.max'].map(optional)):[];
  const snapshot={schema:'benchmark-environment-snapshot-0.1',capturedAt,scope:'offline-tools-process',runtime:{platform,architecture,versions:selected},os:{kernelRelease:token(kernelRelease)?kernelRelease:null,distribution:platform==='linux'?distribution(os):{status:'not_applicable'}},resources:{availableParallelism:parallelism,cgroupV2MemoryMax:platform==='linux'?memoryLimit(memory):{status:'not_applicable'},cgroupV2CpuMax:platform==='linux'?cpuLimit(cpu):{status:'not_applicable'}}};
  if(!validEnvironment(snapshot))throw Error('Invalid environment snapshot');
  return snapshot;
}

export function validEnvironment(snapshot){
  if(!only(snapshot,['schema','capturedAt','scope','runtime','os','resources'])||snapshot.schema!=='benchmark-environment-snapshot-0.1'||snapshot.scope!=='offline-tools-process'||typeof snapshot.capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(snapshot.capturedAt)||!Number.isFinite(Date.parse(snapshot.capturedAt)))return false;
  const {runtime,os,resources}=snapshot;
  if(!only(runtime,['platform','architecture','versions'])||!['aix','darwin','freebsd','linux','openbsd','sunos','win32','android'].includes(runtime.platform)||!token(runtime.architecture)||!only(runtime.versions,versionKeys)||!token(runtime.versions.node)||!Object.values(runtime.versions).every(token))return false;
  if(!only(os,['kernelRelease','distribution'])||!(os.kernelRelease===null||token(os.kernelRelease)))return false;
  const dist=os.distribution;
  if(!only(dist,['status','id','versionId']))return false;
  if(dist.status==='recorded'){if(!token(dist.id)||!(dist.versionId===null||token(dist.versionId)))return false;}
  else if(!['unavailable','invalid','not_applicable'].includes(dist.status)||Object.keys(dist).length!==1)return false;
  if(!only(resources,['availableParallelism','cgroupV2MemoryMax','cgroupV2CpuMax'])||!positive(resources.availableParallelism))return false;
  const memory=resources.cgroupV2MemoryMax,cpu=resources.cgroupV2CpuMax;
  if(!only(memory,['status','bytes'])||!only(cpu,['status','quotaMicroseconds','periodMicroseconds']))return false;
  if(memory.status==='limited'){if(!bytes(memory.bytes)||Object.keys(memory).length!==2)return false;}
  else if(!['unlimited','unavailable','invalid','not_applicable'].includes(memory.status)||Object.keys(memory).length!==1)return false;
  if(cpu.status==='limited'){if(!positive(cpu.quotaMicroseconds)||!positive(cpu.periodMicroseconds)||Object.keys(cpu).length!==3)return false;}
  else if(cpu.status==='unlimited'){if(!positive(cpu.periodMicroseconds)||Object.keys(cpu).length!==2)return false;}
  else if(!['unavailable','invalid','not_applicable'].includes(cpu.status)||Object.keys(cpu).length!==1)return false;
  if(runtime.platform!=='linux'&&[dist,memory,cpu].some(value=>value.status!=='not_applicable'))return false;
  if(runtime.platform==='linux'&&[dist,memory,cpu].some(value=>value.status==='not_applicable'))return false;
  return true;
}

export function environmentRows(snapshot){
  if(snapshot==null)return [['環境記録','なし（過去の記録には後付けしません）']];
  if(!validEnvironment(snapshot))return [['環境記録','不正な記録']];
  const {runtime,os,resources}=snapshot,memory=resources.cgroupV2MemoryMax,cpu=resources.cgroupV2CpuMax;
  const state=value=>({unavailable:'取得不可',invalid:'形式不正',unlimited:'このcgroupの上限なし',not_applicable:'対象外'}[value.status]);
  return [['取得日時',snapshot.capturedAt],['適用範囲','オフライン単体検証のプロセス'],['OS / アーキテクチャ',runtime.platform+' / '+runtime.architecture],...Object.entries(runtime.versions).map(([key,value])=>[key,value]),['カーネルリリース',os.kernelRelease??'取得不可'],['OS配布版',os.distribution.status==='recorded'?os.distribution.id+' '+(os.distribution.versionId??'バージョン未記録'):state(os.distribution)],['Nodeが利用可能と報告する並列度',resources.availableParallelism],['cgroup v2 memory.max',memory.status==='limited'?memory.bytes+' bytes':state(memory)],['cgroup v2 cpu.max',cpu.status==='limited'?cpu.quotaMicroseconds+' / '+cpu.periodMicroseconds+' microseconds':cpu.status==='unlimited'?'max / '+cpu.periodMicroseconds+' microseconds':state(cpu)]];
}

export function environmentMarkdown(snapshot){
  return '| 項目 | 記録 |\n|---|---|\n'+environmentRows(snapshot).map(row=>'| '+row.join(' | ')+' |').join('\n')+'\n\nこれは取得時点の当該プロセスの記録です。cgroup v2ファイルを取得できない場合や親cgroupの制限は未確認であり、上限なしと推定しません。ピーク使用量・実際のDockerイメージID・追加OSパッケージ・ホスト全体の資源・ZAPやアプリの環境は証明しません。\n';
}
