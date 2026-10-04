import {readFile,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=files=>Object.fromEntries(Object.keys(files).sort().map(path=>[path,files[path]]));
const digest=files=>hash(JSON.stringify(canonical(files)));
export const SOURCE_METADATA=['Dockerfile','.dockerignore','package.json','package-lock.json','compose.yaml','compose.zap.yaml','verify.cmd','verify.sh','verify.ps1','reports.cmd','reports.sh'];

async function collectSourceFiles(directory,{metadata,designPath=null,includeTests}){
  const root=await lstat(directory);
  if(!root.isDirectory()||root.isSymbolicLink())throw Error('Invalid source directory');
  const files=Object.create(null);let total=0;
  async function add(path,fullPath=join(directory,path)){
    const info=await lstat(fullPath);
    if(info.isSymbolicLink()||!info.isFile())throw Error('Unsupported source file');
    if(info.size>8*1024*1024||(total+=info.size)>32*1024*1024)throw Error('Source snapshot size limit exceeded');
    if(Object.keys(files).length>=1000)throw Error('Source snapshot file limit exceeded');
    files[path]=hash(await readFile(fullPath));
  }
  async function walk(path){
    const info=await lstat(join(directory,path));
    if(info.isSymbolicLink()||!info.isDirectory())throw Error('Unsupported source directory');
    for(const entry of (await readdir(join(directory,path),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const next=path+'/'+entry.name;
      if(entry.isSymbolicLink())throw Error('Source symlink is not supported');
      if(entry.isDirectory())await walk(next);else await add(next);
    }
  }
  for(const path of metadata)await add(path);
  if(designPath)await add('@design/benchmark-design-v2.json',designPath);
  await walk('src');if(includeTests)await walk('tests');
  return canonical(files);
}

export async function sourceSnapshot(directory,{designPath=null}={}){
  const files=await collectSourceFiles(directory,{metadata:SOURCE_METADATA,designPath,includeTests:true});
  return {schema:'benchmark-source-snapshot-0.1',algorithm:'sha256-byte-files-and-sorted-path-map',sha256:digest(files),files:canonical(files),scope:'src/, tests/, Dockerfile, .dockerignore, package manifests, Compose files, and verification/report launchers'+(designPath?', design JSON':'')+'; documentation and generated artifacts excluded'};
}

// Runtime images contain src/ and package manifests, but not the Dockerfile,
// Compose file, design JSON, or tests. This proof covers exactly those bytes.
export async function runtimeSourceProof(directory){
  const files=await collectSourceFiles(directory,{metadata:['package.json','package-lock.json'],includeTests:false});
  return {schema:'benchmark-runtime-source-proof-0.1',algorithm:'sha256-byte-files-and-sorted-path-map',sha256:digest(files),files,runtime:{node:process.version,platform:process.platform,architecture:process.arch},scope:'src/, package.json, package-lock.json; application and scan-controller runtime bytes only'};
}

export function compareRuntimeSourceProof(before,after){
  const valid=value=>value?.schema==='benchmark-runtime-source-proof-0.1'&&value.algorithm==='sha256-byte-files-and-sorted-path-map'&&value.files&&typeof value.files==='object'&&!Array.isArray(value.files)&&Object.keys(value.files).length<=1000&&Object.hasOwn(value.files,'package.json')&&Object.hasOwn(value.files,'package-lock.json')&&Object.keys(value.files).some(path=>path.startsWith('src/'))&&Object.keys(value.files).every(path=>path==='package.json'||path==='package-lock.json'||path.startsWith('src/'))&&Object.values(value.files).every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))&&value.sha256===digest(value.files)&&typeof value.runtime?.node==='string'&&typeof value.runtime?.platform==='string'&&typeof value.runtime?.architecture==='string';
  if(!valid(before)||!valid(after))return {status:'invalid'};
  if(before.sha256!==after.sha256||before.runtime.node!==after.runtime.node||before.runtime.platform!==after.runtime.platform||before.runtime.architecture!==after.runtime.architecture)return {status:'changed',beforeSha256:before.sha256,afterSha256:after.sha256};
  return {status:'matched',sha256:before.sha256};
}

export function compareSources(recorded,current){
  if(!recorded)return {status:'unrecorded',changes:[],reason:'The stored run has no source snapshot'};
  const valid=s=>s?.schema==='benchmark-source-snapshot-0.1'&&s.algorithm==='sha256-byte-files-and-sorted-path-map'&&s.files&&typeof s.files==='object'&&!Array.isArray(s.files)&&Object.keys(s.files).length<=1000&&Object.values(s.files).every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))&&s.sha256===digest(s.files);
  if(!valid(recorded)||!valid(current))return {status:'invalid',changes:[],reason:'The source snapshot is malformed or its digest differs'};
  const changes=[];
  for(const path of [...new Set([...Object.keys(recorded.files),...Object.keys(current.files)])].sort()){
    if(!Object.hasOwn(recorded.files,path))changes.push({path,change:'added'});
    else if(!Object.hasOwn(current.files,path))changes.push({path,change:'removed'});
    else if(recorded.files[path]!==current.files[path])changes.push({path,change:'modified'});
  }
  return {status:changes.length?'changed':'matched',recordedSha256:recorded.sha256,currentSha256:current.sha256,changes};
}
