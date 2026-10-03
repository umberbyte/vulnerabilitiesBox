import {mkdir,lstat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {artifactReader} from './files.mjs';
import {auditVerification} from './verification.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stageNames=['unit','representative-acceptance','extended-variants','selected-smoke'];
const allowed=path=>['full-regression.json','full-regression.md'].includes(path)||stageNames.some(name=>path===`full-regression-logs/${name}.log`);
const canonical=files=>Object.fromEntries(Object.keys(files).sort().map(path=>[path,files[path]]));
const contentHash=(files,missingFiles)=>sha(JSON.stringify({files:canonical(files),missingFiles:[...missingFiles].sort()}));

export async function readRegressionArchive(directory){
  const reader=await artifactReader(directory,{maxBytes:8*1024*1024});
  const manifest=await reader.json('archive-manifest.json');
  if(manifest?.schema!=='benchmark-verification-archive-0.1'||manifest.kind!=='regression'||!manifest.files||typeof manifest.files!=='object'||Array.isArray(manifest.files)||Object.keys(manifest.files).length>6||!Object.hasOwn(manifest.files,'full-regression.json')||Object.entries(manifest.files).some(([path,hash])=>!allowed(path)||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))||!Array.isArray(manifest.missingFiles)||manifest.missingFiles.length>4||new Set(manifest.missingFiles).size!==manifest.missingFiles.length||manifest.missingFiles.some(path=>!allowed(path)||Object.hasOwn(manifest.files,path))||manifest.contentSha256!==contentHash(manifest.files,manifest.missingFiles)||manifest.originalReportSha256!==manifest.files['full-regression.json']||manifest.archive!=='verification-history/regression-'+manifest.contentSha256)throw Error('Invalid regression archive manifest');
  const issues=[];
  for(const [path,expected] of Object.entries(manifest.files)){
    try{if(sha(await reader.read(path))!==expected)issues.push({code:'archive_file_hash_mismatch',path});}catch{issues.push({code:'archive_file_unavailable',path});}
  }
  const report=await reader.json('full-regression.json');
  if(report?.schema!=='benchmark-full-regression-0.1')throw Error('Invalid regression archive report');
  const audit=await auditVerification(directory);
  const evidence=audit.records.find(r=>r.kind==='regression');
  if(issues.length&&evidence){evidence.evidenceStatus='inconsistent';evidence.errors+=issues.length;}
  return {manifest,report,evidence,issues:[...audit.issues,...issues.map(issue=>({...issue,level:'error'}))],fileIssues:issues};
}

// Preserve exactly the stored bytes, including missing source provenance and
// unsuccessful runs. This never executes the regression harness.
export async function archiveRegression(directory){
  const reader=await artifactReader(directory,{maxBytes:8*1024*1024});
  let bytes;
  try{bytes=await reader.read('full-regression.json');}catch(e){if(e.code==='ENOENT')return {status:'absent'};throw e;}
  const report=JSON.parse(bytes.toString('utf8'));
  if(report?.schema!=='benchmark-full-regression-0.1'||!Array.isArray(report.stages)||report.stages.length>4||new Set(report.stages.map(s=>s?.name)).size!==report.stages.length||report.stages.some(s=>!stageNames.includes(s?.name)))throw Error('Invalid regression archive input');
  const contents=new Map([['full-regression.json',bytes]]),missingFiles=[];
  try{contents.set('full-regression.md',await reader.read('full-regression.md'));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const stage of report.stages){
    const path=`full-regression-logs/${stage.name}.log`;
    if(stage.log!==path&&stage.log!=='artifacts/'+path)throw Error('Invalid regression log reference');
    try{contents.set(path,await reader.read(path));}catch(e){if(e.code!=='ENOENT')throw e;missingFiles.push(path);}
  }
  const files=canonical(Object.fromEntries([...contents].map(([path,data])=>[path,sha(data)])));
  const hash=contentHash(files,missingFiles),relative='verification-history/regression-'+hash,root=join(reader.root,'verification-history');
  await mkdir(root,{recursive:true});
  const rootInfo=await lstat(root);if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())throw Error('Invalid verification history directory');
  const destination=join(root,'regression-'+hash);
  try{
    const info=await lstat(destination);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Invalid regression archive directory');
    const existing=await readRegressionArchive(destination);
    if(existing.manifest.archive!==relative||existing.fileIssues.length)throw Error('Existing regression archive is inconsistent');
    return {status:'existing',archive:relative};
  }catch(e){if(e.code!=='ENOENT')throw e;}
  await mkdir(destination);
  if([...contents.keys()].some(path=>path.includes('/')))await mkdir(join(destination,'full-regression-logs'));
  for(const [path,data] of contents)await writeFile(join(destination,path),data,{flag:'wx'});
  const manifest={schema:'benchmark-verification-archive-0.1',kind:'regression',archive:relative,archivedAt:new Date().toISOString(),contentSha256:hash,originalReportSha256:files['full-regression.json'],files,missingFiles};
  await writeFile(join(destination,'archive-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return {status:'created',archive:relative};
}
