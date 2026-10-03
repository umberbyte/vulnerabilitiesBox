import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';

export async function unitTestFiles(directory='.'){
  return (await readdir(join(directory,'tests'))).filter(name=>name==='measurement.mjs'||/^runner-.*\.mjs$/.test(name)||/^evaluation.*\.mjs$/.test(name)||['batch4-variants.mjs','batch5-cases.mjs'].includes(name)).sort().map(name=>'tests/'+name);
}

export async function runNode(args,{cwd='.',timeoutMs=180000,maxOutputBytes=8*1024*1024}={}){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1)throw Error('Invalid subprocess limits');
  const env={...process.env};
  for(const name of ['BENCHMARK_CONTROL_KEY','ZAP_API_KEY','CONTROL_URL','ZAP_URL','TARGET_URL','ATTACKER_URL'])delete env[name];
  return new Promise(resolve=>{
    const child=spawn(process.execPath,args,{cwd,env,stdio:['ignore','pipe','pipe']});
    let output='',error='',bytes=0,stopReason=null,finished=false;
    const timer=setTimeout(()=>{stopReason='timeout';child.kill('SIGKILL');},timeoutMs);
    function finish(result){if(finished)return;finished=true;clearTimeout(timer);resolve({...result,output,error,stopReason});}
    function collect(part,stderr){bytes+=part.length;if(bytes>maxOutputBytes){stopReason='output_limit';child.kill('SIGKILL');return;}if(stderr)error+=part.toString();else output+=part.toString();}
    child.stdout.on('data',part=>collect(part,false));child.stderr.on('data',part=>collect(part,true));
    child.on('error',e=>{error=e.message;finish({exitCode:127});});
    child.on('close',(code,signal)=>finish({exitCode:code,signal}));
  });
}

export function tapSummary(output){
  const value=name=>Number(output.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]);
  const summary={tests:value('tests'),passed:value('pass'),failed:value('fail'),skipped:value('skipped'),cancelled:value('cancelled')};
  if(!Number.isSafeInteger(summary.tests)||summary.tests<1||Object.values(summary).some(v=>!Number.isSafeInteger(v)))throw Error('Missing TAP summary');
  if(summary.tests!==summary.passed+summary.failed+summary.skipped+summary.cancelled)throw Error('Inconsistent TAP summary');
  return summary;
}
