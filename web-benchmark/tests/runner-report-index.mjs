import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectReports,renderReports,generateReports} from '../src/reporting/index.mjs';

async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'benchmark-report-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function json(path,value){await writeFile(path,JSON.stringify(value));}

test('indexes finished, stopped, and unsupported runs without scoring',async t=>{
  const dir=await fixture(t);
  for(const [name,status] of [['zap-a','completed'],['zap-b','budget_stopped'],['zap-c','unsupported_target_surface']]){
    await mkdir(join(dir,name));
    await json(join(dir,name,'run.json'),{schema:'benchmark-scanner-run-0.2',runId:name,status,startedAt:'2026-10-03T08:00:00Z',measurement:{count:12},profile:'anonymous-active'});
  }
  await writeFile(join(dir,'zap-a','zap-report.html'),'report');
  await writeFile(join(dir,'zap-review.md'),'private local review');
  await json(join(dir,'panel-ledger.json'),{schema:'benchmark-operator-panel-ledger-0.1',status:'halted',cells:[{root:'R0041',arm:'V',status:'completed'},{root:'R0041',arm:'F',status:'not_run'}]});
  const index=await collectReports(dir,{sourceSummary:{implemented_roots:337,implemented_positive_variants:500}});
  assert.equal(index.summary.runs,3);assert.equal(index.runs.find(r=>r.id==='zap-a').report,'zap-a/zap-report.html');
  assert.equal(index.runs.find(r=>r.id==='zap-b').report,null);assert.equal(index.ledgers[0].states.not_run,1);
  assert.equal(index.summary.runStates.budget_stopped,1);assert.equal(index.detectionRate,undefined);
  assert.deepEqual(index.notes,['zap-review.md']);assert.match(renderReports(index),/zap-review.md/);
  assert.match(renderReports(index),/500/);assert.match(renderReports(index),/上限で停止/);
});

test('escaped metadata cannot inject markup or external links',async t=>{
  const dir=await fixture(t);await mkdir(join(dir,'zap-test'));
  await json(join(dir,'zap-test','run.json'),{schema:'benchmark-scanner-run-0.2',runId:'<script>alert(1)</script>',profile:'" onmouseover="x',status:'completed'});
  const html=renderReports(await collectReports(dir));
  assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('href="http'));assert.match(html,/default-src 'none'/);
});

test('malformed, unknown, missing, and oversized records remain visible warnings',async t=>{
  const dir=await fixture(t);
  await writeFile(join(dir,'bad-ledger.json'),'{');await json(join(dir,'other-ledger.json'),{schema:'other'});
  await mkdir(join(dir,'zap-missing'));await writeFile(join(dir,'large-ledger.json'),' '.repeat(4*1024*1024+1));
  const index=await collectReports(dir);
  assert.equal(index.summary.warnings,4);assert.deepEqual(new Set(index.warnings.map(w=>w.reason)),new Set(['invalid_json','unsupported_schema','missing_file','oversized']));
});

test('stored regression scope and incompleteness are preserved',async t=>{
  const dir=await fixture(t);
  await json(join(dir,'full-regression.json'),{schema:'benchmark-full-regression-0.1',scope:{full500VariantAcceptance:false},summary:{complete:false},stages:[{name:'unit',status:'passed',summary:{passed:187}}]});
  const index=await collectReports(dir);assert.equal(index.regression.scope.full500VariantAcceptance,false);assert.equal(index.regression.complete,false);assert.match(renderReports(index),/未完了または失敗/);
});

test('unexpected state names cannot change the count object prototype',async t=>{
  const dir=await fixture(t);await mkdir(join(dir,'zap-state'));
  await json(join(dir,'zap-state','run.json'),{schema:'benchmark-scanner-run-0.2',status:'__proto__'});
  const index=await collectReports(dir);assert.equal(index.summary.runStates.__proto__,1);assert.equal(Object.getPrototypeOf(index.summary.runStates),null);
});

test('output generation writes only indexes and does not change the evidence',async t=>{
  const dir=await fixture(t),status=join(dir,'status.json');
  await json(status,{summary:{implemented_roots:337,implemented_positive_variants:500}});
  assert.deepEqual(JSON.parse(JSON.stringify(await generateReports(dir,{statusPath:status}))),{runs:0,ledgers:0,runStates:{},warnings:0});
  assert.deepEqual(JSON.parse(JSON.stringify(await generateReports(dir,{statusPath:status}))),{runs:0,ledgers:0,runStates:{},warnings:0});
});

test('symlink artifact directory is ignored and output symlink is rejected',async t=>{
  const dir=await fixture(t),outside=await fixture(t);
  try{await symlink(outside,join(dir,'zap-link'),'junction');}catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code)){t.skip('symlink unavailable');return;}throw e;}
  assert.equal((await collectReports(dir)).summary.runs,0);
  const status=join(dir,'status.json');await json(status,{summary:{}});
  await symlink(outside,join(dir,'index.html'),'junction');
  await assert.rejects(generateReports(dir,{statusPath:status}),/Invalid output file/);
});
