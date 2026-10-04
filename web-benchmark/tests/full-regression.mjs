import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {unitTestFiles} from '../src/reporting/tool-tests.mjs';
import {sourceSnapshot,compareSources} from '../src/reporting/source.mjs';
import {archiveRegression} from '../src/reporting/regression-archive.mjs';

// One repeatable Docker entry point. Scope is explicit: the newer variants have
// dedicated V/F/N tests, while the older acceptance harness covers 210 roots.
const status=JSON.parse(await readFile('implementation-status.json','utf8'));
const roots=status.implemented.filter(item=>item.status==='previous_release_acceptance_verified').map(item=>item.root);
if(roots.length!==210||new Set(roots).size!==210)throw Error('The representative acceptance root set changed');
if(!process.env.BENCHMARK_CONTROL_KEY)throw Error('BENCHMARK_CONTROL_KEY is required');
const unitFiles=await unitTestFiles('.');
await archiveRegression('artifacts');
const report={schema:'benchmark-full-regression-0.1',startedAt:new Date().toISOString(),scope:{sourceRoots:337,sourceVariants:500,representativeAcceptanceRoots:roots.length,representativeAcceptanceArms:['V','F','N'],extendedTests:'batch4-priority-* and batch6-* V/F/N',selectedSmokeArms:['V','F'],full500VariantAcceptance:false,scannerMeasurement:false},stages:[]};
await mkdir('artifacts/full-regression-logs',{recursive:true});
report.source=await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'});

async function stage(name,args,env={}){
  console.log(`START ${name}`);
  const started=Date.now();
  const result=await new Promise(resolve=>{
    const child=spawn(process.execPath,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
    let output='',error='';
    child.stdout.on('data',part=>{output+=part.toString();if(output.length>8*1024*1024)child.kill('SIGKILL');});
    child.stderr.on('data',part=>{error+=part.toString();if(error.length>8*1024*1024)child.kill('SIGKILL');});
    child.on('error',failure=>resolve({code:127,output,error:failure.message}));
    child.on('close',code=>resolve({code,output,error}));
  });
  const log=`artifacts/full-regression-logs/${name}.log`;
  await writeFile(log,result.output+(result.error?'\nSTDERR\n'+result.error:''));
  const entry={name,status:result.code===0?'passed':'failed',exitCode:result.code,durationMs:Date.now()-started,log,logSha256:createHash('sha256').update(result.output+(result.error?'\nSTDERR\n'+result.error:'')).digest('hex')};
  report.stages.push(entry);
  console.log(`${entry.status.toUpperCase()} ${name} ${entry.durationMs} ms`);
  if(result.code!==0)throw Error(`${name} failed; see ${log}: ${(result.error||result.output).slice(-1200)}`);
  return result.output;
}
let failure;
try{
  const unitOutput=await stage('unit',['--test','--test-reporter=tap',...unitFiles]);
  const tests=Number(unitOutput.match(/^# tests (\d+)$/m)?.[1]);
  const passed=Number(unitOutput.match(/^# pass (\d+)$/m)?.[1]);
  const failed=Number(unitOutput.match(/^# fail (\d+)$/m)?.[1]);
  if(!tests||tests!==passed||failed!==0)throw Error('Unit TAP summary missing or incomplete');
  report.stages.at(-1).summary={tests,passed,failed,files:unitFiles.length};

  await stage('representative-acceptance',['tests/acceptance.mjs'],{BENCHMARK_TEST_ROOT:roots.join(',')});
  const acceptance=JSON.parse(await readFile('artifacts/acceptance.json','utf8'));
  if(acceptance.summary.cells!==630||acceptance.summary.passed!==630||acceptance.summary.failed!==0)throw Error('Representative acceptance summary is incomplete');
  report.stages.at(-1).summary=acceptance.summary;

  await stage('extended-variants',['tests/extended-regression.mjs']);
  const extended=JSON.parse(await readFile('artifacts/extended-regression.json','utf8'));
  if(extended.summary.files!==25||extended.summary.passed!==25||extended.summary.failed!==0||extended.summary.reportedCells!==234)throw Error('Extended variant summary is incomplete');
  report.stages.at(-1).summary=extended.summary;

  await stage('selected-smoke',['tests/docker-smoke-selected.mjs'],{BENCHMARK_VALIDATION_ORIGIN:'http://app:8080',BENCHMARK_SMOKE_REPORT:'artifacts/docker-smoke-selected-run.json'});
  const smoke=JSON.parse(await readFile('artifacts/docker-smoke-selected-run.json','utf8'));
  if(smoke.summary.cells!==20||smoke.summary.passed!==20||smoke.summary.failed!==0)throw Error('Selected smoke summary is incomplete');
  report.stages.at(-1).summary=smoke.summary;
}catch(error){failure=error;console.error(error.message);}
try{report.sourceAfter=compareSources(report.source,await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'}));if(report.sourceAfter.status!=='matched')failure??=new Error('Source changed during verification');}catch(error){failure??=error;}
report.finishedAt=new Date().toISOString();
report.summary={stages:report.stages.length,passed:report.stages.filter(item=>item.status==='passed').length,failed:report.stages.filter(item=>item.status==='failed').length,complete:!failure};
if(failure)report.error=failure.message;
await writeFile('artifacts/full-regression.json',JSON.stringify(report,null,2)+'\n');
const labels={'unit':'単体テスト','representative-acceptance':'代表210根本原因のV/F/N','extended-variants':'追加78変種のV/F/N','selected-smoke':'選択10変種のV/F'};
const counts={'unit':item=>`${item.summary.passed}/${item.summary.tests} テスト`,'representative-acceptance':item=>`${item.summary.passed}/${item.summary.cells} 条件、${item.summary.checks} チェック`,'extended-variants':item=>`${item.summary.reportedCells} 条件、${item.summary.passed}/${item.summary.files} テストファイル`,'selected-smoke':item=>`${item.summary.passed}/${item.summary.cells} 条件`};
const rows=report.stages.map(item=>`| ${labels[item.name]} | ${item.status==='passed'?'合格':'失敗'} | ${item.summary?counts[item.name](item):'—'} |`).join('\n');
await writeFile('artifacts/full-regression.md',`# Docker回帰テスト結果\n\n実行: ${report.startedAt} – ${report.finishedAt}\n\n| 検証 | 結果 | 合格数 |\n|---|---|---|\n${rows}\n\nソース実装は337根本原因・500変種です。この実行は代表210根本原因のV/F/N、追加78変種の専用V/F/N、選択10変種のV/F、および単体テストを検証します。500変種すべてのV/F/N成立確認とZAP/Burp検出率測定は含みません。\n${failure?'\n失敗: '+failure.message+'\n':''}`);
console.log(JSON.stringify(report.summary));
if(failure)process.exitCode=1;
