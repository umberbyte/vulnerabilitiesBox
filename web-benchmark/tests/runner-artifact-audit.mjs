import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditArtifacts,auditMarkdown} from '../src/reporting/audit.mjs';
import {artifactReader} from '../src/reporting/files.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
async function save(path,value){const bytes=JSON.stringify(value);await writeFile(path,bytes);return hash(bytes);}
async function fixture(t,arms=['V','F','N']){
  const dir=await mkdtemp(join(tmpdir(),'benchmark-audit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const condition={profile:'active',authMode:'anonymous',subject:null,wallSeconds:90,requestedHttpRequests:1000,requestedConcurrency:2};
  const cells=arms.map(arm=>({cellId:'cell-'+arm,root:'R0041',variant:'B0041',seed:'test',replicate:1,arm,expectedWorkspace:'/w/fixture',condition:{...condition},status:'not_run'}));
  const plan={schema:'benchmark-operator-panel-0.1',planId:'plan-test',cells:structuredClone(cells)};
  const planHash=await save(join(dir,'plan.json'),plan);
  const ledger={schema:'benchmark-operator-panel-ledger-0.1',status:'completed',plan:{path:'artifacts/plan.json',sha256:planHash,planId:plan.planId},cells};
  for(const cell of cells){
    const folder='zap-'+cell.arm;await mkdir(join(dir,folder));
    const value={schema:'benchmark-scanner-run-0.2',runId:folder,status:'completed',profile:'anonymous-active',trafficSettled:true,errors:[],workspace:cell.expectedWorkspace,measurement:{workspace:cell.expectedWorkspace,count:26},scannerConfigurationSha256:'a'.repeat(64),budgets:{wallSeconds:90,requestedHttpRequests:1000,requestedConcurrency:2}};
    const sha256=await save(join(dir,folder,'run.json'),value);
    cell.status='completed';cell.run={path:'artifacts/'+folder+'/run.json',sha256,runId:folder,status:'completed',summary:{status:'completed',requests:26,profile:value.profile,scannerConfigurationSha256:value.scannerConfigurationSha256}};
  }
  async function flush(){await save(join(dir,'test-ledger.json'),ledger);}
  await flush();return{dir,ledger,flush};
}

test('matched V/F/N requires plan and run hash agreement and one configuration',async t=>{
  const f=await fixture(t),audit=await auditArtifacts(f.dir);
  assert.equal(audit.summary.errors,0);assert.equal(audit.summary.completeVfnSeries,1);assert.equal(audit.summary.verifiedCells,3);
  assert.match(auditMarkdown(audit),/検出の成功を示しません/);assert.equal(audit.detectionRate,undefined);
});

test('V-only experiments are incomplete comparisons, not negative findings',async t=>{
  const f=await fixture(t,['V']),audit=await auditArtifacts(f.dir);
  assert.equal(audit.summary.errors,0);assert.equal(audit.summary.completeVfnSeries,0);assert.equal(audit.summary.incompleteVfnSeries,1);
});

test('edited source bytes break run agreement even if the filename matches',async t=>{
  const f=await fixture(t);await writeFile(join(f.dir,'zap-V/run.json'),'{}');
  const audit=await auditArtifacts(f.dir);assert.ok(audit.issues.some(i=>i.code==='run_hash_mismatch'));assert.equal(audit.summary.completeVfnSeries,0);
});

test('edited plan bytes and relabelled cells cannot form a valid comparison',async t=>{
  const f=await fixture(t);f.ledger.cells[0].arm='N';await f.flush();
  assert.ok((await auditArtifacts(f.dir)).issues.some(i=>i.code==='cell_plan_mismatch'));
  await writeFile(join(f.dir,'plan.json'),'{}');assert.ok((await auditArtifacts(f.dir)).issues.some(i=>i.code==='plan_hash_mismatch'));
});

test('metadata mismatch, missing artifacts, and duplicate references stay visible',async t=>{
  const f=await fixture(t);f.ledger.cells[0].run.runId='different';f.ledger.cells[1].run.path=f.ledger.cells[0].run.path;
  f.ledger.cells[2].run=null;await f.flush();
  const audit=await auditArtifacts(f.dir);const codes=new Set(audit.issues.map(i=>i.code));
  for(const code of ['run_metadata_mismatch','duplicate_run_in_ledger','completed_cell_without_run'])assert.ok(codes.has(code),code);
  assert.equal(audit.summary.completeVfnSeries,0);assert.equal(audit.summary.orphanRuns,2);
});

test('configuration changes prevent V/F/N completion even when all cells finish',async t=>{
  const f=await fixture(t),path=join(f.dir,'zap-F/run.json'),value=JSON.parse(await readFile(path));
  value.scannerConfigurationSha256='b'.repeat(64);f.ledger.cells[1].run.sha256=await save(path,value);f.ledger.cells[1].run.summary.scannerConfigurationSha256=value.scannerConfigurationSha256;await f.flush();
  const audit=await auditArtifacts(f.dir);assert.equal(audit.summary.errors,0);assert.equal(audit.summary.completeVfnSeries,0);assert.equal(audit.summary.warnings,1);
});

test('budget and profile inconsistencies cannot be hidden behind updated hashes',async t=>{
  const f=await fixture(t);
  for(const [arm,field,value,expected]of [['V','profile','session-active','profile_mismatch'],['F','budgets',{wallSeconds:20,requestedHttpRequests:1000,requestedConcurrency:2},'budget_mismatch']]){
    const path=join(f.dir,'zap-'+arm+'/run.json'),run=JSON.parse(await readFile(path));run[field]=value;f.ledger.cells.find(c=>c.arm===arm).run.sha256=await save(path,run);await f.flush();
    assert.ok((await auditArtifacts(f.dir)).issues.some(i=>i.code===expected));
  }
});

test('completed metadata with unsettled traffic is invalid; stale running ledgers are informational',async t=>{
  const f=await fixture(t),path=join(f.dir,'zap-V/run.json'),run=JSON.parse(await readFile(path));
  run.trafficSettled=false;f.ledger.cells[0].run.sha256=await save(path,run);f.ledger.status='running';await f.flush();
  const audit=await auditArtifacts(f.dir);assert.ok(audit.issues.some(i=>i.code==='incomplete_completed_run'));assert.ok(audit.issues.some(i=>i.level==='info'&&i.code==='unfinished_ledger_record'));
});

test('untrusted artifact references cannot escape the artifact root',async t=>{
  const f=await fixture(t);f.ledger.plan.path='artifacts/../outside.json';f.ledger.cells[0].run.path='artifacts/zap-../run.json';await f.flush();
  const reader=await artifactReader(f.dir);await assert.rejects(reader.read('../outside.json'),/invalid_path/);await assert.rejects(reader.read('C:/outside.json'),/invalid_path/);await assert.rejects(reader.read('zap-V\\run.json'),/invalid_path/);
  const audit=await auditArtifacts(f.dir);assert.ok(audit.issues.some(i=>i.code==='plan_unavailable'));assert.ok(audit.issues.some(i=>i.code==='run_unavailable'));
});

test('malformed cell labels become errors rather than invoking object coercion',async t=>{
  const f=await fixture(t);f.ledger.cells[0].root={toString:null};await f.flush();
  const audit=await auditArtifacts(f.dir);assert.ok(audit.issues.some(i=>i.code==='invalid_cell_labels'));assert.equal(audit.summary.completeVfnSeries,0);assert.match(auditMarkdown(audit),/invalid_cell_labels/);
});
