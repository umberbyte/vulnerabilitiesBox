import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SOURCE_METADATA,sourceSnapshot,compareSources,runtimeSourceProof,compareRuntimeSourceProof} from '../src/reporting/source.mjs';
import {runNode,tapSummary,unitTestFiles} from '../src/reporting/tool-tests.mjs';
import {collectReports,renderReports} from '../src/reporting/index.mjs';

async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'benchmark-source-'));t.after(()=>rm(dir,{recursive:true,force:true}));for(const p of SOURCE_METADATA)await writeFile(join(dir,p),'fixture');await mkdir(join(dir,'src'));await mkdir(join(dir,'tests'));return dir;}
test('source snapshots are deterministic and exclude documentation and artifacts',async t=>{
  const dir=await fixture(t);await writeFile(join(dir,'src/app.mjs'),'source');const first=await sourceSnapshot(dir);
  await writeFile(join(dir,'README.md'),'documentation');assert.equal(compareSources(first,await sourceSnapshot(dir)).status,'matched');assert.equal(Object.keys(first.files).length,SOURCE_METADATA.length+1);
});
test('modified, added, and removed source files are distinguished',async t=>{
  const dir=await fixture(t);await writeFile(join(dir,'src/old.mjs'),'old');await writeFile(join(dir,'src/change.mjs'),'before');const first=await sourceSnapshot(dir);
  await rm(join(dir,'src/old.mjs'));await writeFile(join(dir,'src/change.mjs'),'after');await writeFile(join(dir,'src/new.mjs'),'new');
  assert.deepEqual(compareSources(first,await sourceSnapshot(dir)).changes.map(c=>c.change).sort(),['added','modified','removed']);
});
test('launcher and Docker ignore changes are part of recorded reproduction inputs',async t=>{
  const dir=await fixture(t),before=await sourceSnapshot(dir);
  await writeFile(join(dir,'verify.cmd'),'different arguments');await writeFile(join(dir,'.dockerignore'),'different build inputs');
  assert.deepEqual(compareSources(before,await sourceSnapshot(dir)).changes.map(c=>c.path),['.dockerignore','verify.cmd']);
});

test('design input bytes are included when supplied to the snapshot',async t=>{
  const dir=await fixture(t),design=join(dir,'design.json');await writeFile(design,'before');const first=await sourceSnapshot(dir,{designPath:design});
  await writeFile(design,'after');const comparison=compareSources(first,await sourceSnapshot(dir,{designPath:design}));assert.deepEqual(comparison.changes,[{path:'@design/benchmark-design-v2.json',change:'modified'}]);
});
test('missing and malformed snapshots do not claim current source agreement',async t=>{
  const dir=await fixture(t),current=await sourceSnapshot(dir);
  assert.equal(compareSources(null,current).status,'unrecorded');const altered=structuredClone(current);altered.sha256='0'.repeat(64);assert.equal(compareSources(altered,current).status,'invalid');
});
test('source links are rejected rather than read outside the source tree',async t=>{
  const dir=await fixture(t);try{await symlink(tmpdir(),join(dir,'src/link'),'junction');}catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code)){t.skip('symlink unavailable');return;}throw e;}
  await assert.rejects(sourceSnapshot(dir),/symlink/);
});
test('runtime proof matches only deployed application bytes and detects stale target source',async t=>{
  const dir=await fixture(t);await writeFile(join(dir,'src/app.mjs'),'before');
  const before=await runtimeSourceProof(dir),full=await sourceSnapshot(dir);
  assert.deepEqual(Object.keys(before.files).sort(),['package-lock.json','package.json','src/app.mjs']);
  for(const [path,hash] of Object.entries(before.files))assert.equal(full.files[path],hash);
  await writeFile(join(dir,'tests/acceptance.mjs'),'changed');await writeFile(join(dir,'README.md'),'changed');
  assert.equal(compareRuntimeSourceProof(before,await runtimeSourceProof(dir)).status,'matched');
  await writeFile(join(dir,'src/app.mjs'),'after');
  assert.equal(compareRuntimeSourceProof(before,await runtimeSourceProof(dir)).status,'changed');
  const altered=structuredClone(before);altered.files['src/app.mjs']='0'.repeat(64);
  assert.equal(compareRuntimeSourceProof(before,altered).status,'invalid');
});
test('unit test discovery excludes application acceptance scripts',async t=>{
  const dir=await fixture(t);for(const name of ['acceptance.mjs','batch6-native.mjs','runner-test.mjs','evaluation.mjs','measurement.mjs'])await writeFile(join(dir,'tests',name),'');
  assert.deepEqual(await unitTestFiles(dir),['tests/evaluation.mjs','tests/measurement.mjs','tests/runner-test.mjs']);
});
test('TAP parsing requires a consistent complete summary',()=>{
  assert.deepEqual(tapSummary('# tests 3\n# pass 2\n# fail 0\n# skipped 1\n# cancelled 0\n'),{tests:3,passed:2,failed:0,skipped:1,cancelled:0});
  assert.throws(()=>tapSummary('# tests 3\n'),/Missing/);assert.throws(()=>tapSummary('# tests 3\n# pass 1\n# fail 0\n# skipped 0\n# cancelled 0\n'),/Inconsistent/);
});
test('bounded subprocess runner records timeout and output overflow',async()=>{
  const timed=await runNode(['-e','setTimeout(()=>{},5000)'],{timeoutMs:100});assert.equal(timed.stopReason,'timeout');
  const large=await runNode(['-e','process.stdout.write("x".repeat(10000))'],{maxOutputBytes:100,timeoutMs:3000});assert.equal(large.stopReason,'output_limit');
});
test('subprocess tests do not inherit scanner control credentials',async()=>{
  const original=process.env.BENCHMARK_CONTROL_KEY;process.env.BENCHMARK_CONTROL_KEY='synthetic-fixture';
  try{const result=await runNode(['-e','process.stdout.write(String(process.env.BENCHMARK_CONTROL_KEY))']);assert.equal(result.output,'undefined');assert.equal(result.exitCode,0);}finally{if(original===undefined)delete process.env.BENCHMARK_CONTROL_KEY;else process.env.BENCHMARK_CONTROL_KEY=original;}
});

test('report index distinguishes current source agreement from legacy unrecorded results',async t=>{
  const dir=await fixture(t),artifacts=join(dir,'artifacts');await mkdir(artifacts);
  const source=await sourceSnapshot(dir);await writeFile(join(artifacts,'tools-check.json'),JSON.stringify({schema:'benchmark-tools-check-0.1',source,status:'passed',summary:{tests:1,passed:1}}));
  await writeFile(join(artifacts,'full-regression.json'),JSON.stringify({schema:'benchmark-full-regression-0.1',stages:[],summary:{complete:true}}));
  let index=await collectReports(artifacts,{sourceDirectory:dir});assert.equal(index.toolsCheck.sourceComparison.status,'matched');assert.equal(index.regression.sourceComparison.status,'unrecorded');assert.match(renderReports(index),/ソース記録なし/);
  await writeFile(join(dir,'src/new.mjs'),'new');index=await collectReports(artifacts,{sourceDirectory:dir});assert.equal(index.toolsCheck.sourceComparison.status,'changed');
});
