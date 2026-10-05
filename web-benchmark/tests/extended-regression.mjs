import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {designCases,passedCells} from '../src/reporting/coverage.mjs';
import {sourceSnapshot,compareSources,runtimeSourceProof,compareRuntimeSourceProof} from '../src/reporting/source.mjs';

const outputName=process.env.BENCHMARK_EXTENDED_OUTPUT||'extended-regression.json';
if(!/^(?:extended-regression|extended-regression-saved-[A-Za-z0-9-]+)\.json$/.test(outputName))throw Error('Invalid extended regression output name');
const outputPath='artifacts/'+outputName;
if(outputName!=='extended-regression.json'&&existsSync(outputPath))throw Error('Extended regression output already exists');
const linked=outputName!=='extended-regression.json';
if(linked&&(!process.env.CONTROL_URL||!process.env.BENCHMARK_CONTROL_KEY))throw Error('Private benchmark control is required for source-linked acceptance');
const targetProof=async()=>{
  const response=await fetch(process.env.CONTROL_URL+'/source-proof',{headers:{'x-benchmark-key':process.env.BENCHMARK_CONTROL_KEY}});
  if(!response.ok)throw Error('Target runtime source proof unavailable');
  return response.json();
};
const files=(await readdir('tests')).filter(name=>/^(batch4-priority-|batch6-).*\.mjs$/.test(name)&&!name.endsWith('-acceptance.mjs')).sort();
const design=designCases(JSON.parse(await readFile('../benchmark-design-v2.json','utf8')));
const report={schema:'benchmark-extended-regression-0.2',startedAt:new Date().toISOString(),scope:'sequential priority boundary, browser, SQL and batch6 Docker V/F/N tests with individual cell IDs; representative acceptance and full 500-variant acceptance are separate',source:await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'}),results:[]};
if(linked){
  report.targetRuntimeSource={verifier:await runtimeSourceProof('.'),targetBefore:await targetProof()};
  report.targetRuntimeSource.verifierMatch=compareRuntimeSourceProof(report.targetRuntimeSource.verifier,report.targetRuntimeSource.targetBefore);
  if(report.targetRuntimeSource.verifierMatch.status!=='matched')throw Error('Verifier and target runtime source differ before extended acceptance');
}
for(const file of files){
  const start=Date.now();
  const result=await new Promise(resolve=>{
    const child=spawn(process.execPath,['tests/'+file],{env:process.env,stdio:['ignore','pipe','pipe']});
    let output='',error='';
    child.stdout.on('data',part=>{output+=part.toString();if(output.length>1024*1024)child.kill('SIGKILL');});
    child.stderr.on('data',part=>{error+=part.toString();if(error.length>1024*1024)child.kill('SIGKILL');});
    child.on('error',failure=>resolve({code:127,output,error:failure.message}));
    child.on('close',code=>resolve({code,output,error}));
  });
  let cellResults=[],captureError;
  try{cellResults=passedCells(result.output,design);if(!cellResults.length&&result.code===0)throw Error('No individual acceptance results recorded');}catch(error){captureError=error.message;}
  const cells=cellResults.length;
  const entry={file,status:result.code===0&&!captureError?'passed':'failed',cells,cellResults,durationMs:Date.now()-start};
  if(result.code!==0)entry.error=(result.error||result.output).slice(-3000);
  if(captureError)entry.error=captureError;
  report.results.push(entry);
  console.log(`${entry.status.toUpperCase()} ${file} ${cells} cells ${entry.durationMs} ms`);
}
report.finishedAt=new Date().toISOString();
report.sourceAfter=compareSources(report.source,await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'}));
if(linked){
  report.targetRuntimeSource.targetAfter=await targetProof();
  report.targetRuntimeSource.targetMatch=compareRuntimeSourceProof(report.targetRuntimeSource.targetBefore,report.targetRuntimeSource.targetAfter);
}
report.summary={files:files.length,passed:report.results.filter(entry=>entry.status==='passed').length,failed:report.results.filter(entry=>entry.status==='failed').length,reportedCells:report.results.reduce((sum,entry)=>sum+entry.cells,0)};
await mkdir('artifacts',{recursive:true});
await writeFile(outputPath,JSON.stringify(report,null,2)+'\n',{flag:linked?'wx':'w'});
console.log(JSON.stringify(report.summary));
if(report.summary.failed||report.sourceAfter.status!=='matched'||linked&&report.targetRuntimeSource.targetMatch.status!=='matched')process.exitCode=1;
