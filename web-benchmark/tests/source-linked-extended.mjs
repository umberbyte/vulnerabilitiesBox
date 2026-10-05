import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {open,readFile} from 'node:fs/promises';
import {designCases,passedCells} from '../src/reporting/coverage.mjs';
import {sourceSnapshot,compareSources,runtimeSourceProof,compareRuntimeSourceProof} from '../src/reporting/source.mjs';

const testName=process.env.BENCHMARK_SOURCE_LINK_TEST;
const selected=process.env.BENCHMARK_SOURCE_LINK_VARIANTS?.split(',').map(value=>value.trim());
const outputName=process.env.BENCHMARK_SOURCE_LINK_OUTPUT;
if(!/^batch(?:4-priority-|6-)[a-z0-9-]+\.mjs$/.test(testName||''))throw Error('Select an existing extended acceptance test');
if(!selected?.length||new Set(selected).size!==selected.length||selected.some(value=>!/^B\d{4}$/.test(value)))throw Error('Select distinct benchmark variants');
if(!/^extended-regression-source-link-[A-Za-z0-9-]+\.json$/.test(outputName||''))throw Error('Choose a new source-link report name');
if(!process.env.CONTROL_URL||!process.env.BENCHMARK_CONTROL_KEY)throw Error('Private benchmark control is required');
const outputPath='artifacts/'+outputName;
if(existsSync(outputPath))throw Error('Source-link report already exists; choose a new output name');
const design=designCases(JSON.parse(await readFile('../benchmark-design-v2.json','utf8')));
for(const variant of selected)if(!design.has(variant))throw Error('Unknown benchmark variant: '+variant);
await readFile('tests/'+testName);

const targetProof=async()=>{
  const response=await fetch(process.env.CONTROL_URL+'/source-proof',{headers:{'x-benchmark-key':process.env.BENCHMARK_CONTROL_KEY}});
  if(!response.ok)throw Error('Target runtime source proof unavailable');
  return response.json();
};
const source=await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'});
const targetRuntimeSource={verifier:await runtimeSourceProof('.'),targetBefore:await targetProof()};
targetRuntimeSource.verifierMatch=compareRuntimeSourceProof(targetRuntimeSource.verifier,targetRuntimeSource.targetBefore);
if(targetRuntimeSource.verifierMatch.status!=='matched')throw Error('Verifier and target runtime source differ before acceptance');
const startedAt=new Date().toISOString();
const childResult=await new Promise(resolve=>{
  const child=spawn(process.execPath,['tests/'+testName],{env:process.env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',part=>{stdout+=part.toString();if(stdout.length>1024*1024)child.kill('SIGKILL');});
  child.stderr.on('data',part=>{stderr+=part.toString();if(stderr.length>1024*1024)child.kill('SIGKILL');});
  child.on('error',error=>resolve({code:127,stdout,stderr:error.message}));
  child.on('close',code=>resolve({code:code??127,stdout,stderr}));
});
let cells=[],error;
try{
  cells=passedCells(childResult.stdout,design);
  const keys=new Set(cells.map(cell=>cell.variant+':'+cell.mode));
  if(cells.length!==selected.length*3||selected.some(variant=>['V','F','N'].some(mode=>!keys.has(variant+':'+mode))))throw Error('Incomplete selected V/F/N cells');
  if(cells.some(cell=>!selected.includes(cell.variant)))throw Error('Acceptance output includes an unselected variant');
}catch(cause){error=cause.message;}
if(childResult.code!==0)error='Acceptance child failed: '+childResult.stderr.slice(-1000);
const sourceAfter=compareSources(source,await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'}));
targetRuntimeSource.targetAfter=await targetProof();
targetRuntimeSource.targetMatch=compareRuntimeSourceProof(targetRuntimeSource.targetBefore,targetRuntimeSource.targetAfter);
const passed=!error&&sourceAfter.status==='matched'&&targetRuntimeSource.targetMatch.status==='matched';
const report={schema:'benchmark-extended-regression-0.2',startedAt,finishedAt:new Date().toISOString(),scope:'Selected existing Docker V/F/N acceptance with individual cells and target runtime source proof; not a scanner measurement',source,sourceAfter,targetRuntimeSource,results:[{file:'tests/'+testName,status:passed?'passed':'failed',cells:passed?cells.length:0,cellResults:passed?cells:[],...(!passed?{error:error||'Source changed during acceptance'}:{})}],summary:{files:1,variants:selected.length,passed:passed?1:0,failed:passed?0:1,reportedCells:passed?cells.length:0,childExitCode:childResult.code}};
const handle=await open(outputPath,'wx');
try{await handle.writeFile(JSON.stringify(report,null,2)+'\n');}finally{await handle.close();}
console.log(JSON.stringify({output:outputPath,...report.summary,sourceAfter:sourceAfter.status,targetRuntimeSource:targetRuntimeSource.targetMatch.status}));
if(!passed)process.exitCode=1;
