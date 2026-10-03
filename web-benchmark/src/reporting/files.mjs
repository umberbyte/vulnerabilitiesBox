import {readFile,readdir,lstat,realpath,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';

export async function artifactReader(directory,{maxBytes=4*1024*1024}={}){
  await mkdir(directory,{recursive:true});
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid artifact directory');
  const root=await realpath(directory);
  async function file(path){
    if(typeof path!=='string'||path.includes('\\')||path.split('/').some(part=>!part||part==='.'||part==='..')||path.startsWith('/')||/^[A-Za-z]:/.test(path))throw Error('invalid_path');
    let current=root;
    for(const part of path.split('/')){
      current=join(current,part);
      const info=await lstat(current);
      if(info.isSymbolicLink())throw Error('symlink');
    }
    const info=await lstat(current);
    if(!info.isFile())throw Error('not_file');
    if(info.size>maxBytes)throw Error('oversized');
    return current;
  }
  return {
    root,
    async entries(){const entries=(await readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));if(entries.length>5000)throw Error('Too many artifact entries (maximum 5000)');return entries;},
    async read(path){return readFile(await file(path));},
    async json(path){return JSON.parse((await this.read(path)).toString('utf8'));},
    async exists(path){try{await file(path);return path;}catch{return null;}}
  };
}

export async function assertOutputFiles(directory,names){
  for(const name of names){
    const path=resolve(directory,name);
    try{const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Invalid output file');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
}
