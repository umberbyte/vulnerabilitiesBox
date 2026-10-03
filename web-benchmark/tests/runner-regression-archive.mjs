import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {archiveRegression,readRegressionArchive} from '../src/reporting/regression-archive.mjs';
import {collectVerificationHistory} from '../src/reporting/history.mjs';
import {generateReports} from '../src/reporting/index.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const tap='# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# cancelled 0\n';
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'benchmark-regression-archive-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function full(dir){
  await mkdir(join(dir,'full-regression-logs'));
  const summaries={unit:{tests:1,passed:1,failed:0,files:1},'representative-acceptance':{cells:3,passed:3,failed:0,checks:12},'extended-variants':{files:1,passed:1,failed:0,reportedCells:3},'selected-smoke':{cells:2,passed:2,failed:0}};
  const stages=[];
  for(const [name,summary] of Object.entries(summaries)){
    const log=name==='unit'?tap:JSON.stringify(summary)+'\n';await writeFile(join(dir,'full-regression-logs',name+'.log'),log);
    stages.push({name,summary,status:'passed',exitCode:0,durationMs:10,log:`artifacts/full-regression-logs/${name}.log`,logSha256:sha(log)});
  }
  const report={schema:'benchmark-full-regression-0.1',startedAt:'2026-10-03T00:00:00Z',finishedAt:'2026-10-03T00:00:01Z',stages,summary:{stages:4,passed:4,failed:0,complete:true}};
  await writeFile(join(dir,'full-regression.json'),JSON.stringify(report,null,2)+'\n');await writeFile(join(dir,'full-regression.md'),'original human report');return report;
}

test('raw regression bytes and missing historical source provenance are retained',async t=>{
  const dir=await fixture(t);await full(dir);const original=await readFile(join(dir,'full-regression.json'));
  const saved=await archiveRegression(dir),read=await readRegressionArchive(join(dir,saved.archive));
  assert.equal(saved.status,'created');assert.deepEqual(await readFile(join(dir,saved.archive,'full-regression.json')),original);assert.deepEqual(await readFile(join(dir,'full-regression.json')),original);
  assert.equal(read.evidence.evidenceStatus,'verified');assert.equal(read.evidence.sourceStatus,'unrecorded');assert.equal(read.report.source,undefined);assert.equal(Object.keys(read.manifest.files).length,6);
});
test('repeated preservation deduplicates identical stored content',async t=>{
  const dir=await fixture(t);await full(dir);const first=await archiveRegression(dir),second=await archiveRegression(dir);
  assert.equal(second.status,'existing');assert.equal(first.archive,second.archive);assert.equal((await readdir(join(dir,'verification-history'))).length,1);
});
test('modified logs create separate saved versions and retain inconsistency',async t=>{
  const dir=await fixture(t);await full(dir);const first=await archiveRegression(dir);
  await writeFile(join(dir,'full-regression-logs','unit.log'),tap+'# changed\n');const second=await archiveRegression(dir);assert.notEqual(second.archive,first.archive);
  const history=await collectVerificationHistory(dir);assert.equal(history.runs.length,2);assert.ok(history.runs.every(r=>r.savedVersions===2));assert.ok(history.runs.some(r=>r.evidence.evidenceStatus==='inconsistent'));
});
test('missing logs are declared and are not manufactured from summary counts',async t=>{
  const dir=await fixture(t);await full(dir);await rm(join(dir,'full-regression-logs','unit.log'));
  const saved=await archiveRegression(dir),read=await readRegressionArchive(join(dir,saved.archive));
  assert.deepEqual(read.manifest.missingFiles,['full-regression-logs/unit.log']);assert.equal(read.evidence.evidenceStatus,'inconsistent');
});
test('archive manifest detects changes to original Markdown as well as logs',async t=>{
  const dir=await fixture(t);await full(dir);const saved=await archiveRegression(dir);await writeFile(join(dir,saved.archive,'full-regression.md'),'changed report');
  const read=await readRegressionArchive(join(dir,saved.archive));assert.deepEqual(read.fileIssues,[{code:'archive_file_hash_mismatch',path:'full-regression.md'}]);assert.equal(read.evidence.evidenceStatus,'inconsistent');
  await assert.rejects(archiveRegression(dir),/Existing regression archive is inconsistent/);
});
test('unexpected log references never cause reads outside the artifact root',async t=>{
  const dir=await fixture(t),report=await full(dir);report.stages[0].log='../outside.log';await writeFile(join(dir,'full-regression.json'),JSON.stringify(report));
  await assert.rejects(archiveRegression(dir),/Invalid regression log reference/);
});
test('manifest file names and content digests are validated',async t=>{
  const dir=await fixture(t);await full(dir);const saved=await archiveRegression(dir),path=join(dir,saved.archive,'archive-manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));
  manifest.files['../outside.json']='a'.repeat(64);await writeFile(path,JSON.stringify(manifest));await assert.rejects(readRegressionArchive(join(dir,saved.archive)),/Invalid regression archive manifest/);
});
test('symlinked inputs and history directories are rejected',async t=>{
  const dir=await fixture(t),outside=await fixture(t);await full(dir);
  try{await symlink(outside,join(dir,'verification-history'),'junction');}catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code)){t.skip('symlink unavailable');return;}throw e;}
  await assert.rejects(archiveRegression(dir),/Invalid verification history/);await rm(join(dir,'verification-history'));
  await rm(join(dir,'full-regression-logs','unit.log'));await symlink(outside,join(dir,'full-regression-logs','unit.log'),'junction');await assert.rejects(archiveRegression(dir),/symlink/);
});
test('incomplete and failed regression metadata stays incomplete in history',async t=>{
  const dir=await fixture(t),report=await full(dir);report.stages=report.stages.slice(0,1);report.summary={stages:1,passed:1,failed:0,complete:false};report.error='later stage did not start';await writeFile(join(dir,'full-regression.json'),JSON.stringify(report));
  await archiveRegression(dir);const history=await collectVerificationHistory(dir);assert.equal(history.runs[0].status,'incomplete');assert.equal(history.runs[0].summary.complete,false);assert.equal(history.runs[0].sourceComparison.status,'unrecorded');
});
test('no existing regression is a harmless absence',async t=>{
  const dir=await fixture(t);assert.deepEqual(await archiveRegression(dir),{status:'absent'});assert.deepEqual(await collectVerificationHistory(dir),{runs:[],warnings:[]});
});
test('report generation archives existing results and reuses the same archive',async t=>{
  const dir=await fixture(t);await full(dir);const status=join(dir,'status.json');await writeFile(status,JSON.stringify({summary:{}}));
  await generateReports(dir,{statusPath:status});let index=JSON.parse(await readFile(join(dir,'report-index.json'),'utf8'));assert.equal(index.regressionArchive.status,'created');assert.equal(index.verificationHistory.runs[0].kind,'regression');
  await generateReports(dir,{statusPath:status});index=JSON.parse(await readFile(join(dir,'report-index.json'),'utf8'));assert.equal(index.regressionArchive.status,'existing');assert.equal(index.verificationHistory.runs.length,1);
});
test('archive failures stay visible without suppressing the report dashboard',async t=>{
  const dir=await fixture(t),report=await full(dir);report.stages[0].log='/outside.log';await writeFile(join(dir,'full-regression.json'),JSON.stringify(report));
  const status=join(dir,'status.json');await writeFile(status,JSON.stringify({summary:{}}));await generateReports(dir,{statusPath:status});const index=JSON.parse(await readFile(join(dir,'report-index.json'),'utf8'));
  assert.equal(index.regressionArchive.status,'not_archived');assert.ok(index.warnings.some(w=>w.reason==='regression_archive_not_created'));
});
