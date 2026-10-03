import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const files=(await readdir('tests')).filter(name=>/^batch6-.*\.mjs$/.test(name)).sort();
const report={schema:'benchmark-extended-regression-0.1',startedAt:new Date().toISOString(),scope:'sequential batch6 Docker V/F/N tests; legacy representative acceptance and full 500-variant acceptance are separate',results:[]};
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
  const cells=result.output.split(/\r?\n/).filter(line=>{try{return JSON.parse(line).result==='passed';}catch{return false;}}).length;
  const entry={file,status:result.code===0?'passed':'failed',cells,durationMs:Date.now()-start};
  if(result.code!==0)entry.error=(result.error||result.output).slice(-3000);
  report.results.push(entry);
  console.log(`${entry.status.toUpperCase()} ${file} ${cells} cells ${entry.durationMs} ms`);
}
report.finishedAt=new Date().toISOString();
report.summary={files:files.length,passed:report.results.filter(entry=>entry.status==='passed').length,failed:report.results.filter(entry=>entry.status==='failed').length,reportedCells:report.results.reduce((sum,entry)=>sum+entry.cells,0)};
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/extended-regression.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
if(report.summary.failed)process.exitCode=1;
