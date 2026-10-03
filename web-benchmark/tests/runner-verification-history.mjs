import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {storeToolsCheck,collectVerificationHistory,historyMarkdown} from '../src/reporting/history.mjs';
import {collectReports,renderReports} from '../src/reporting/index.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const log='# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# cancelled 0\n';
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'benchmark-history-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
function report(status='passed'){
  const files={'tests/runner-fixture.mjs':sha('source')},hash=sha(JSON.stringify(files));
  return {schema:'benchmark-tools-check-0.1',startedAt:'2026-10-03T10:00:00Z',finishedAt:'2026-10-03T10:00:01Z',status,exitCode:status==='passed'?0:1,stopReason:null,summary:{tests:1,passed:1,failed:0,skipped:0,cancelled:0},testFiles:Object.keys(files),source:{schema:'benchmark-source-snapshot-0.1',algorithm:'sha256-byte-files-and-sorted-path-map',sha256:hash,files},sourceAfter:{status:'matched',recordedSha256:hash,currentSha256:hash,changes:[]},log:'tools-check.log',logSha256:sha(log)};
}
test('repeated runs retain distinct complete archives while latest filenames update',async t=>{
  const dir=await fixture(t),first=await storeToolsCheck(dir,report(),log,'first result'),second=await storeToolsCheck(dir,report('failed'),log,'second result');
  assert.notEqual(first.archive,second.archive);assert.equal(await readFile(join(dir,first.archive,'tools-check.md'),'utf8'),'first result');
  assert.equal(JSON.parse(await readFile(join(dir,'tools-check.json'),'utf8')).archive,second.archive);assert.equal((await collectVerificationHistory(dir)).runs.length,2);
});
test('an archive includes its original source record and audited log evidence',async t=>{
  const dir=await fixture(t),saved=await storeToolsCheck(dir,report(),log,'result'),history=await collectVerificationHistory(dir);
  assert.equal(history.warnings.length,0);assert.equal(history.runs[0].sourceSha256,saved.source.sha256);assert.equal(history.runs[0].evidence.evidenceStatus,'verified');
});
test('corrupted archive logs are visible as inconsistent history',async t=>{
  const dir=await fixture(t),saved=await storeToolsCheck(dir,report(),log,'result');await writeFile(join(dir,saved.archive,'tools-check.log'),log+'altered');
  const history=await collectVerificationHistory(dir);assert.equal(history.runs[0].evidence.evidenceStatus,'inconsistent');
});
test('malformed and mismatched archive references become warnings',async t=>{
  const dir=await fixture(t),saved=await storeToolsCheck(dir,report(),log,'result');
  const data=JSON.parse(await readFile(join(dir,saved.archive,'tools-check.json'),'utf8'));data.archive='somewhere-else';await writeFile(join(dir,saved.archive,'tools-check.json'),JSON.stringify(data));
  await mkdir(join(dir,'verification-history','unexpected'));
  const history=await collectVerificationHistory(dir);assert.equal(history.runs.length,0);assert.equal(history.warnings.length,2);
});
test('absent history is accepted and invalid archive inputs are rejected',async t=>{
  const dir=await fixture(t);assert.deepEqual(await collectVerificationHistory(dir),{runs:[],warnings:[]});
  await assert.rejects(storeToolsCheck(dir,{...report(),finishedAt:'../escape'},log,'result'),/Invalid/);
});
test('symlinked history and latest output paths are rejected before writing',async t=>{
  const dir=await fixture(t),outside=await fixture(t);
  try{await symlink(outside,join(dir,'verification-history'),'junction');}catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code)){t.skip('symlink unavailable');return;}throw e;}
  await assert.rejects(storeToolsCheck(dir,report(),log,'result'),/Invalid verification history/);
  await rm(join(dir,'verification-history'));await symlink(outside,join(dir,'tools-check.json'),'junction');
  await assert.rejects(storeToolsCheck(dir,report(),log,'result'),/Invalid output file/);
});
test('report index links archives and preserves the recorded historical state',async t=>{
  const dir=await fixture(t),saved=await storeToolsCheck(dir,report(),log,'result'),index=await collectReports(dir);
  assert.equal(index.verificationHistory.runs.length,1);assert.ok(renderReports(index).includes(saved.archive+'/tools-check.json'));assert.match(renderReports(index),/評価ツール・統合回帰の検証履歴/);
});
test('historical source comparison uses the original snapshot and exposes changes',async t=>{
  const dir=await fixture(t),original=report();await storeToolsCheck(dir,original,log,'result');
  assert.equal((await collectVerificationHistory(dir,{currentSource:original.source})).runs[0].sourceComparison.status,'matched');
  const changed=structuredClone(original.source);changed.files['tests/runner-fixture.mjs']=sha('changed');changed.sha256=sha(JSON.stringify(changed.files));
  const history=await collectVerificationHistory(dir,{currentSource:changed});assert.equal(history.runs[0].sourceComparison.status,'changed');assert.equal(history.runs[0].sourceSha256,original.source.sha256);
});
test('human history includes the causes of conflicting saved evidence',async t=>{
  const dir=await fixture(t),saved=await storeToolsCheck(dir,report(),log,'result');await writeFile(join(dir,saved.archive,'tools-check.log'),log+'# altered\n');
  const history=await collectVerificationHistory(dir),markdown=historyMarkdown(history),visible=markdown.replace(/&#(\d+);/g,(_,code)=>String.fromCharCode(Number(code)));assert.match(visible,/log_hash_mismatch/);assert.match(markdown,/不整合/);assert.ok(history.runs[0].issues.some(i=>i.code==='log_hash_mismatch'));
});
test('untrusted metadata cannot insert Markdown images or executable HTML',()=>{
  const metadata='![external](https://example.test/pixel)<script>x</script>';
  const markdown=historyMarkdown({runs:[{kind:'tools',path:'verification-history/tools-fixture/tools-check.json',status:metadata,startedAt:metadata,issues:[]}],warnings:[]});
  assert.ok(!markdown.includes('![external]'));assert.ok(!markdown.includes('<script>'));assert.ok(markdown.includes('&#33;'));
});
