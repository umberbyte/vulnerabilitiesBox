import {mkdir,lstat,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {artifactReader,assertOutputFiles} from './files.mjs';
import {auditVerification} from './verification.mjs';

async function historyRoot(directory,{create=false}={}){
  const reader=await artifactReader(directory),root=join(reader.root,'verification-history');
  if(create)await mkdir(root,{recursive:true});
  try{const info=await lstat(root);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Invalid verification history directory');}catch(e){if(e.code==='ENOENT'&&!create)return null;throw e;}
  return root;
}

export async function storeToolsCheck(directory,report,log,markdown){
  if(report?.schema!=='benchmark-tools-check-0.1'||typeof report.finishedAt!=='string'||!Number.isFinite(Date.parse(report.finishedAt))||typeof log!=='string'||typeof markdown!=='string')throw Error('Invalid tools check archive');
  const root=await historyRoot(directory,{create:true});
  await assertOutputFiles(directory,['tools-check.json','tools-check.log','tools-check.md']);
  const id='tools-'+new Date(report.finishedAt).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
  const archive=join(root,id);
  await mkdir(archive); // Exclusive unique run directory; never reuse a prior run.
  const stored={...report,archive:'verification-history/'+id};
  const outputs={'tools-check.log':log,'tools-check.json':JSON.stringify(stored,null,2)+'\n','tools-check.md':markdown};
  for(const [name,content] of Object.entries(outputs))await writeFile(join(archive,name),content,{flag:'wx'});
  // The complete archive exists before updating the familiar latest filenames.
  for(const [name,content] of Object.entries(outputs))await writeFile(join(directory,name),content);
  return stored;
}

export async function collectVerificationHistory(directory){
  const root=await historyRoot(directory),runs=[],warnings=[];
  if(!root)return {runs,warnings};
  const entries=(await readdir(root,{withFileTypes:true})).sort((a,b)=>b.name.localeCompare(a.name));
  if(entries.length>1000)throw Error('Too many verification history entries (maximum 1000)');
  for(const entry of entries){
    if(!/^tools-\d{4}-\d\d-\d\dT[\d-]+Z-[0-9a-f-]{36}$/.test(entry.name)||entry.isSymbolicLink()||!entry.isDirectory()){warnings.push({path:'verification-history/'+entry.name,reason:'invalid_history_entry'});continue;}
    const path='verification-history/'+entry.name;
    try{
      const reader=await artifactReader(join(root,entry.name));
      const report=await reader.json('tools-check.json');
      if(report?.schema!=='benchmark-tools-check-0.1'||report.archive!==path)throw Error('inconsistent_archive_reference');
      const audit=await auditVerification(join(root,entry.name));
      runs.push({path:path+'/tools-check.json',markdown:await reader.exists('tools-check.md')?path+'/tools-check.md':null,startedAt:report.startedAt,status:report.status,summary:report.summary,sourceSha256:report.source?.sha256,evidence:audit.records.find(r=>r.kind==='tools')});
    }catch{warnings.push({path,reason:'unreadable_history_record'});}
  }
  return {runs,warnings};
}
