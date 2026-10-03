import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {environmentSnapshot,distribution,memoryLimit,cpuLimit,validEnvironment,environmentRows,environmentMarkdown} from '../src/reporting/environment.mjs';
import {auditVerification} from '../src/reporting/verification.mjs';
import {generateReports} from '../src/reporting/index.mjs';

const capturedAt='2026-10-03T00:00:00.500Z';
const options={platform:'linux',architecture:'arm64',versions:{node:'24.21.0',v8:'13.6.233.17-node.48',openssl:'3.5.4',unknown:'SECRET'},kernelRelease:'6.12.0-linuxkit',parallelism:4,capturedAt};
const input={'/etc/os-release':'ID=debian\nVERSION_ID="12"\nPRETTY_NAME="PRIVATE"\nSECRET=SECRET\n','/sys/fs/cgroup/memory.max':'536870912\n','/sys/fs/cgroup/cpu.max':'max 100000\n'};
const snapshot=()=>environmentSnapshot({...options,read:async path=>input[path]});
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t){const directory=await mkdtemp(join(tmpdir(),'benchmark-environment-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
async function tools(directory,environment){
  const log='# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n',files={'tests/runner-fixture.mjs':sha('fixture')};
  const source={schema:'benchmark-source-snapshot-0.1',algorithm:'sha256-byte-files-and-sorted-path-map',files,sha256:sha(JSON.stringify(files))};
  const record={schema:'benchmark-tools-check-0.1',startedAt:'2026-10-03T00:00:00Z',finishedAt:'2026-10-03T00:00:01Z',status:'passed',exitCode:0,stopReason:null,testFiles:Object.keys(files),source,sourceAfter:{status:'matched',recordedSha256:source.sha256,currentSha256:source.sha256,changes:[]},log:'tools-check.log',logSha256:sha(log),summary:{tests:1,passed:1,failed:0,skipped:0,cancelled:0},...(environment===undefined?{}:{environment})};
  await writeFile(join(directory,'tools-check.json'),JSON.stringify(record));await writeFile(join(directory,'tools-check.log'),log);return record;
}

test('collector reads only fixed local files and retains allowlisted metadata',async()=>{
  const paths=[];
  const result=await environmentSnapshot({...options,read:async path=>{paths.push(path);return input[path];}});
  assert.deepEqual(paths,Object.keys(input));assert.equal(result.runtime.versions.node,'24.21.0');assert.equal(result.runtime.versions.unknown,undefined);
  assert.deepEqual(result.os.distribution,{status:'recorded',id:'debian',versionId:'12'});assert.equal(result.resources.cgroupV2MemoryMax.bytes,'536870912');assert.ok(validEnvironment(result));assert.doesNotMatch(JSON.stringify(result),/SECRET|PRIVATE/);
});
test('missing files and cgroup v1 do not imply unlimited resources',async()=>{
  const result=await environmentSnapshot({...options,read:async()=>{throw Error('private path');}});
  assert.equal(result.os.distribution.status,'unavailable');assert.equal(result.resources.cgroupV2MemoryMax.status,'unavailable');assert.equal(result.resources.cgroupV2CpuMax.status,'unavailable');assert.doesNotMatch(JSON.stringify(result),/private path/);
});
test('non-Linux platforms skip Linux file reads rather than infer container limits',async()=>{
  const result=await environmentSnapshot({...options,platform:'win32',kernelRelease:'10.0.26100',read:async()=>{throw Error('must not read');}});
  assert.equal(result.os.distribution.status,'not_applicable');assert.equal(result.resources.cgroupV2CpuMax.status,'not_applicable');assert.ok(validEnvironment(result));
});
test('OS parser rejects duplicates, commands, markup, escapes, and oversized input',()=>{
  for(const text of ['ID=debian\nID=ubuntu','ID=$(whoami)','ID="<script>"','ID="a\\b"','ID=debian\nVERSION_ID=../../secret','ID=debian\n'+'x'.repeat(4096),'PRETTY_NAME="Only name"'])assert.equal(distribution(text).status,'invalid');
  assert.deepEqual(distribution("ID='alpine'\r\nVERSION_ID=3.22"),{status:'recorded',id:'alpine',versionId:'3.22'});
});
test('memory limits preserve exact byte values without numeric precision loss',()=>{
  assert.deepEqual(memoryLimit('18446744073709551615\n'),{status:'limited',bytes:'18446744073709551615'});
  assert.deepEqual(memoryLimit('max\n'),{status:'unlimited'});
  assert.deepEqual(memoryLimit('0'),{status:'limited',bytes:'0'});
  for(const text of ['18446744073709551616','-1','1e9','100 secret','001',true])assert.equal(memoryLimit(text).status,'invalid');
  assert.equal(memoryLimit(null).status,'unavailable');
});
test('CPU quota and period remain separate and do not round fractional CPUs',()=>{
  assert.deepEqual(cpuLimit('50000 100000\n'),{status:'limited',quotaMicroseconds:50000,periodMicroseconds:100000});
  assert.deepEqual(cpuLimit('max 100000'),{status:'unlimited',periodMicroseconds:100000});
  for(const text of ['max','-1 100','1 0','1.5 100','9007199254740992 100000','100000 100000 x'])assert.equal(cpuLimit(text).status,'invalid');
});
test('invalid snapshots cannot display arbitrary or secret fields',async()=>{
  const good=await snapshot();
  for(const alter of [s=>{s.hostname='SECRET';},s=>{s.runtime.versions.secret='SECRET';},s=>{s.os.kernelRelease='<script>';},s=>{s.resources.availableParallelism=0;},s=>{s.resources.cgroupV2MemoryMax.bytes='9999999999999999999999999';},s=>{s.capturedAt='bad';},s=>{s.runtime.platform='win32';}]){
    const value=structuredClone(good);alter(value);assert.equal(validEnvironment(value),false);assert.doesNotMatch(environmentMarkdown(value),/SECRET|<script>/);
  }
  assert.deepEqual(environmentRows({schema:'unknown'}),[['環境記録','不正な記録']]);
});
test('collector sanitizes unusable kernel strings and rejects invalid runtime',async()=>{
  const result=await environmentSnapshot({...options,kernelRelease:'secret path /host',read:async()=>null});assert.equal(result.os.kernelRelease,null);
  await assert.rejects(environmentSnapshot({...options,versions:{node:'<bad>'},read:async()=>null}),/Invalid environment/);
});
test('historical records remain environment-unrecorded and byte-for-byte unchanged',async t=>{
  const directory=await fixture(t);await tools(directory);const before=await readFile(join(directory,'tools-check.json'));
  const result=await auditVerification(directory);assert.equal(result.records[0].environmentStatus,'unrecorded');assert.equal(result.summary.verified,1);assert.equal(result.summary.errors,0);assert.deepEqual(await readFile(join(directory,'tools-check.json')),before);
});
test('invalid or out-of-execution environment records are audit errors',async t=>{
  const directory=await fixture(t);
  for(const change of [s=>{s.capturedAt='2026-10-02T23:59:00Z';},s=>{s.capturedAt='2026-10-03T00:00:02Z';},s=>{s.resources.cgroupV2CpuMax.quotaMicroseconds=1;},s=>{s.extra='secret';}]){
    const value=await snapshot();change(value);await tools(directory,value);const result=await auditVerification(directory);assert.equal(result.records[0].environmentStatus,'invalid');assert.equal(result.records[0].evidenceStatus,'inconsistent');assert.ok(result.issues.some(i=>i.code==='invalid_environment_snapshot'));
  }
});
test('offline report exposes observed environment without changing original evidence',async t=>{
  const directory=await fixture(t),value=await snapshot();await tools(directory,value);await writeFile(join(directory,'status.json'),'{}');
  const before=await readFile(join(directory,'tools-check.json'));
  await generateReports(directory,{statusPath:join(directory,'status.json')});
  const index=JSON.parse(await readFile(join(directory,'report-index.json'),'utf8')),html=await readFile(join(directory,'index.html'),'utf8');
  assert.equal(index.toolsCheck.evidence.environmentStatus,'recorded');assert.equal(index.toolsCheck.environment.resources.cgroupV2MemoryMax.bytes,'536870912');assert.match(html,/536870912 bytes/);assert.match(html,/cgroup v2 cpu.max/);assert.match(html,/debian 12/);assert.doesNotMatch(html,/SECRET|PRIVATE/);assert.deepEqual(await readFile(join(directory,'tools-check.json')),before);
});
