import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {template,classify,summarize,verifySources} from './records.mjs';
import {conditionsTemplate,importBurp,verifyBurpSources} from './burp.mjs';

const json=async name=>JSON.parse(await readFile(name,'utf8'));
const save=(name,value)=>writeFile(name,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const artifacts=async folder=>{
  const run=await json(path.join(folder,'run.json'));let alerts,settingsSnapshot=null;
  try{alerts=await json(path.join(folder,'alerts.json'));}catch(error){if(error.code!=='ENOENT'||!['failed','unsupported'].includes(run.status))throw error;alerts={alerts:[]};}
  try{settingsSnapshot=await json(path.join(folder,'scanner-settings.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
  return {run,alerts,settingsSnapshot};
};
export const verified=async name=>{
  const record=await json(name);
  if(record.run?.tool==='ZAP'){
    if(typeof record.source.artifactDirectory!=='string')throw new Error('Missing original ZAP artifact directory');
    const folder=path.resolve(path.dirname(name),record.source.artifactDirectory);
    const {run,alerts,settingsSnapshot}=await artifacts(folder);verifySources(record,run,alerts,settingsSnapshot);
  }else if(record.run?.tool==='Burp Suite Professional')await verifyBurpSources(record,name);
  else throw new Error('Unsupported review tool');
  return record;
};
export async function main(argv=process.argv.slice(2)){
const [command,...args]=argv;
if(command==='template'&&args.length===6){
  const [folder,root,arm,seed,replicate,output]=args;
  const {run,alerts,settingsSnapshot}=await artifacts(folder);const record=template(run,alerts,{root,arm,seed,replicate:Number(replicate)},settingsSnapshot);
  record.source.artifactDirectory=path.relative(path.dirname(path.resolve(output)),path.resolve(folder));
  await save(output,record);console.log('Created an unreviewed operator template: '+output);
}else if(command==='validate'&&args.length===1){
  console.log(JSON.stringify(classify(await verified(args[0])),null,2));
}else if(command==='summarize'&&args.length>=2){
  const [output,...inputs]=args;await save(output,summarize(await Promise.all(inputs.map(verified))));console.log('Saved case-level summary: '+output);
}else if(command==='capture-burp'&&args.length===5){
  const [root,arm,seed,replicate,output]=args;await save(output,conditionsTemplate({root,arm,seed,replicate:Number(replicate)}));console.log('Created unverified operator capture: '+output);
}else if(command==='import-burp'&&args.length===4){
  const [report,conditions,bundle,review]=args;await importBurp(report,conditions,bundle,review);console.log('Preserved Burp source bundle and created an unreviewed template: '+review);
}else{
  console.error('Commands:\n  template RUN_FOLDER ROOT V|F|N SEED REP OUTPUT.json\n  capture-burp ROOT V|F|N SEED REP OUTPUT.json\n  import-burp REPORT.xml CONDITIONS.json NEW_BUNDLE_DIRECTORY REVIEW.json\n  validate REVIEW.json\n  summarize OUTPUT.json REVIEW.json [REVIEW.json ...]');process.exitCode=1;
}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{await main();}catch(error){console.error(error.code?'Evaluation failed: '+error.code:error.message);process.exitCode=1;}}
