import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {sourceSnapshot,compareSources} from '../src/reporting/source.mjs';
import {designCases} from '../src/reporting/coverage.mjs';

const rawPath='artifacts/docker-smoke-selected-vfn.json';
const outputPath='artifacts/extended-regression-saved-selected-vfn-20261004.json';
const selected=['B0378','B0379','B0361','B0329','B0200','B0127','B0482','B0342','B0339','B0462'];
const design=designCases(JSON.parse(await readFile('../benchmark-design-v2.json','utf8')));
const source=await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'});
const startedAt=new Date().toISOString();
const exitCode=await new Promise(resolve=>{
  const child=spawn(process.execPath,['tests/docker-smoke-selected.mjs'],{env:{...process.env,BENCHMARK_SMOKE_ARMS:'V,F,N',BENCHMARK_SMOKE_REPORT:rawPath},stdio:'inherit'});
  child.on('error',()=>resolve(127));child.on('close',code=>resolve(code??127));
});
let raw,invalid=false;
try{raw=JSON.parse(await readFile(rawPath,'utf8'));if(raw.schema!=='benchmark-docker-smoke-selected-0.1'||!Array.isArray(raw.results)||raw.results.length!==selected.length*3)invalid=true;}
catch{invalid=true;raw={results:[]};}
const evidence=new Map(),seen=new Set();
for(const cell of raw.results){
  const item=design.get(cell?.variant),key=cell?.variant+':'+cell?.mode;
  if(!item||item.root!==cell.root||!selected.includes(cell.variant)||!['V','F','N'].includes(cell.mode)||!['passed','failed'].includes(cell.status)||seen.has(key)){invalid=true;continue;}
  seen.add(key);if(!evidence.has(cell.variant))evidence.set(cell.variant,[]);evidence.get(cell.variant).push(cell);
}
const results=selected.map(variant=>{
  const cells=evidence.get(variant)||[],complete=['V','F','N'].every(arm=>cells.some(cell=>cell.mode===arm&&cell.status==='passed'));
  return {file:'tests/docker-smoke-selected.mjs',variant,status:!invalid&&complete?'passed':'failed',cells:complete?3:0,cellResults:!invalid&&complete?cells.map(cell=>({root:cell.root,variant,mode:cell.mode,passed:true})):[],...(!invalid&&complete?{}:{error:'Selected V/F/N acceptance incomplete; inspect raw report'})};
});
if(exitCode!==0&&results.every(result=>result.status==='passed')){invalid=true;for(const result of results){result.status='failed';result.cells=0;result.cellResults=[];result.error='Child process failed despite reported cells';}}
const sourceAfter=compareSources(source,await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'}));
const summary={files:1,variants:selected.length,passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,reportedCells:results.reduce((sum,result)=>sum+result.cells,0),childExitCode:exitCode};
const report={schema:'benchmark-extended-regression-0.2',startedAt,finishedAt:new Date().toISOString(),scope:'Selected Docker V/F/N acceptance with individual variant and arm records; not full 500-variant acceptance or scanner measurement',source,sourceAfter,results,summary,rawReport:rawPath};
await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:outputPath,...summary,sourceSha256:source.sha256,sourceAfter:sourceAfter.status}));
if(invalid||summary.failed||sourceAfter.status!=='matched')process.exitCode=1;
