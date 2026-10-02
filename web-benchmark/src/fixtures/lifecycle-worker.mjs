import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
const input=JSON.parse(readFileSync(0,'utf8'));
if(input.kind==='regex'){
  if(typeof input.value!=='string'||input.value.length>27)process.exit(2);
  const started=performance.now(),matched=(input.fixed?/^a+$/:/^(a+)+$/).test(input.value);
  console.log(JSON.stringify({matched,durationMs:performance.now()-started}));
}else if(input.kind==='worker-host'){
  for(const fail of [input.fail===true,false]){
    const child=new Worker('const {parentPort,workerData}=require("node:worker_threads");if(workerData)throw new Error("Fixture job failed");parentPort.postMessage("completed");',{eval:true,workerData:fail});
    const result=await new Promise(resolve=>{child.once('message',()=>resolve('completed'));if(input.fixed)child.once('error',()=>resolve('failed'));});
    console.log(JSON.stringify({result}));await child.terminate();
  }
}else process.exit(2);
