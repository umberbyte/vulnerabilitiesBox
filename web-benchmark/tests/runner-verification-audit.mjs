import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {auditVerification,verificationMarkdown} from '../src/reporting/verification.mjs';
import {collectReports,renderReports,generateReports} from '../src/reporting/index.mjs';
import {tapSummary} from '../src/reporting/tool-tests.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const tap='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n';
const summary={tests:2,passed:2,failed:0,skipped:0,cancelled:0};
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'benchmark-verification-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function save(dir,path,data){await writeFile(join(dir,path),JSON.stringify(data));}
async function tools(dir,update=()=>{}){
  const files={'tests/runner-fixture.mjs':sha('fixture')};
  const source={schema:'benchmark-source-snapshot-0.1',algorithm:'sha256-byte-files-and-sorted-path-map',sha256:sha(JSON.stringify(files)),files};
  const data={schema:'benchmark-tools-check-0.1',startedAt:'2026-10-03T00:00:00Z',finishedAt:'2026-10-03T00:00:01Z',source,sourceAfter:{status:'matched',recordedSha256:source.sha256,currentSha256:source.sha256,changes:[]},testFiles:Object.keys(files),status:'passed',exitCode:0,stopReason:null,log:'tools-check.log',logSha256:sha(tap),summary:{...summary}};
  await writeFile(join(dir,'tools-check.log'),tap);update(data);await save(dir,'tools-check.json',data);return data;
}
async function full(dir,update=()=>{}){
  await mkdir(join(dir,'full-regression-logs'));
  const summaries={unit:{tests:2,passed:2,failed:0,files:1},'representative-acceptance':{cells:3,passed:3,failed:0,checks:12},'extended-variants':{files:1,passed:1,failed:0,reportedCells:3},'selected-smoke':{cells:2,passed:2,failed:0}};
  const stages=[];
  for(const [name,summary] of Object.entries(summaries)){
    const log=name==='unit'?tap:JSON.stringify(summary)+'\n';await writeFile(join(dir,'full-regression-logs',name+'.log'),log);
    stages.push({name,summary,status:'passed',exitCode:0,durationMs:10,log:`artifacts/full-regression-logs/${name}.log`,logSha256:sha(log)});
  }
  const data={schema:'benchmark-full-regression-0.1',startedAt:'2026-10-03T00:00:00Z',finishedAt:'2026-10-03T00:00:01Z',stages,summary:{stages:4,passed:4,failed:0,complete:true}};
  update(data);await save(dir,'full-regression.json',data);return data;
}
const codes=a=>a.issues.map(i=>i.code);

test('consistent unit evidence validates without executing tests or altering evidence',async t=>{
  const dir=await fixture(t);await tools(dir);const before=await readFile(join(dir,'tools-check.json'));
  const audit=await auditVerification(dir);assert.equal(audit.summary.verified,1);assert.equal(audit.summary.errors,0);assert.equal(audit.records[0].sourceStatus,'stable_record');assert.deepEqual(await readFile(join(dir,'tools-check.json')),before);
});
test('hash mismatch is an error even when the modified TAP still passes',async t=>{
  const dir=await fixture(t);await tools(dir);await writeFile(join(dir,'tools-check.log'),'# changed\n'+tap);
  const audit=await auditVerification(dir);assert.ok(codes(audit).includes('log_hash_mismatch'));assert.equal(audit.summary.verified,0);
});
test('matching log hashes do not hide inconsistent recorded counts',async t=>{
  const dir=await fixture(t);await tools(dir,d=>{d.summary.tests=3;d.summary.passed=3;});
  assert.ok(codes(await auditVerification(dir)).includes('log_summary_mismatch'));
});
test('timeout, nonzero exit, and skipped tests cannot back a passed claim',async t=>{
  const dir=await fixture(t);await tools(dir,d=>{d.stopReason='timeout';d.exitCode=1;d.summary.skipped=1;});
  const audit=await auditVerification(dir);assert.ok(codes(audit).includes('inconsistent_passed_status'));assert.ok(codes(audit).includes('passed_with_nonpassing_tests'));
});
test('duplicate and CRLF TAP summaries are handled explicitly',()=>{
  assert.throws(()=>tapSummary(tap+tap),/duplicate/);assert.deepEqual(tapSummary(tap.replaceAll('\n','\r\n')),summary);
});
test('passed claims require a valid source snapshot and consistent after hashes',async t=>{
  const dir=await fixture(t);await tools(dir,d=>{d.source.sha256='0'.repeat(64);d.sourceAfter.currentSha256='f'.repeat(64);});
  const audit=await auditVerification(dir);assert.ok(codes(audit).includes('invalid_source_snapshot'));assert.ok(codes(audit).includes('inconsistent_source_after'));assert.notEqual(audit.records[0].sourceStatus,'stable_record');
});
test('a declared source change remains visible and conflicts with passing status',async t=>{
  const dir=await fixture(t);await tools(dir,d=>{d.sourceAfter.status='changed';d.sourceAfter.currentSha256='a'.repeat(64);d.sourceAfter.changes=[{path:'tests/runner-fixture.mjs',change:'modified'}];});
  const audit=await auditVerification(dir);assert.equal(audit.records[0].sourceStatus,'changed_during_execution');assert.ok(codes(audit).includes('passed_with_source_change'));
});
test('missing logs and unsafe references cannot become verified evidence',async t=>{
  const dir=await fixture(t);await tools(dir,d=>{d.log='../tools-check.log';});assert.ok(codes(await auditVerification(dir)).includes('unexpected_log_reference'));
  await tools(dir);await rm(join(dir,'tools-check.log'));assert.ok(codes(await auditVerification(dir)).includes('unreadable_log'));
});
test('invalid hashes, file lists, and execution dates are rejected',async t=>{
  const dir=await fixture(t);await tools(dir,d=>{d.logSha256='bad';d.testFiles.push(d.testFiles[0]);d.finishedAt='2026-10-02T00:00:00Z';});
  const audit=await auditVerification(dir);for(const c of ['invalid_log_hash','invalid_test_files','invalid_execution_dates'])assert.ok(codes(audit).includes(c));
});
test('historical full regression logs can match while source remains unrecorded',async t=>{
  const dir=await fixture(t);await full(dir);const audit=await auditVerification(dir);
  assert.equal(audit.summary.verifiedLogs,4);assert.equal(audit.summary.verified,1);assert.equal(audit.summary.errors,0);assert.equal(audit.records[0].sourceStatus,'unrecorded');assert.match(verificationMarkdown(audit),/ソース記録なし/);
});
test('duplicated or absent stages cannot substantiate a complete regression',async t=>{
  const dir=await fixture(t);await full(dir,d=>{d.stages[3]=d.stages[0];});
  const audit=await auditVerification(dir);assert.ok(codes(audit).includes('invalid_stage'));assert.ok(codes(audit).includes('inconsistent_complete_status'));
});
test('stage summary must agree with the summary in the hashed log',async t=>{
  const dir=await fixture(t);await full(dir,d=>{d.stages[1].summary.checks=99;d.summary.passed=3;});
  const audit=await auditVerification(dir);assert.ok(codes(audit).includes('log_summary_mismatch'));assert.ok(codes(audit).includes('stage_count_mismatch'));
});
test('malformed JSON and unsupported schemas are reported without throwing',async t=>{
  const dir=await fixture(t);await writeFile(join(dir,'tools-check.json'),'{');await save(dir,'full-regression.json',null);
  const audit=await auditVerification(dir);assert.equal(audit.summary.records,2);assert.equal(audit.summary.inconsistent,2);
});
test('symlinked logs are rejected',async t=>{
  const dir=await fixture(t);await tools(dir);await rm(join(dir,'tools-check.log'));
  try{await symlink(tmpdir(),join(dir,'tools-check.log'),'junction');}catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code)){t.skip('symlink unavailable');return;}throw e;}
  assert.ok(codes(await auditVerification(dir)).includes('unreadable_log'));
});
test('report generation exposes contradictory passing claims with audit links',async t=>{
  const dir=await fixture(t);await tools(dir,d=>{d.exitCode=2;});const status=join(dir,'status.json');await save(dir,'status.json',{summary:{}});
  const index=await collectReports(dir);assert.equal(index.toolsCheck.status,'passed');assert.equal(index.toolsCheck.evidence.evidenceStatus,'inconsistent');
  const html=renderReports(index);assert.match(html,/保存された状態: 合格/);assert.match(html,/検証資料に不整合あり/);assert.match(html,/verification-audit.md/);
  await generateReports(dir,{statusPath:status});assert.equal(JSON.parse(await readFile(join(dir,'verification-audit.json'),'utf8')).summary.inconsistent,1);
});
