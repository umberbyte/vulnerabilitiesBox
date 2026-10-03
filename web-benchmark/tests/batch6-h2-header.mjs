import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0355',variant:'B0355',mode,seed:'h2-header-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);
    return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normalResponse=await send('/h2-header',{note:'Guide'});
  assert.equal(normalResponse.status,200);
  const normal=await normalResponse.json();
  assert.equal(normal.converted,true);assert.equal(normal.adminReached,false);
  assert.match(normal.response,/Public downstream response/);
  const attackResponse=await send('/h2-header',{note:'Guide\r\nX-Admin: yes'});
  assert.equal(attackResponse.status,mode==='V'?200:400);
  const attack=await attackResponse.json();
  assert.equal(attack.converted,mode==='V');assert.equal(attack.adminReached,mode==='V');
  if(mode==='V')assert.match(attack.response,/canary_[0-9a-f]{24}/);
  const records=(await ctl('/oracle')).caseState.batch6H2Header.records;
  assert.equal(records.length,2);
  assert.equal(records.at(-1).adminReached,mode==='V');
  console.log(JSON.stringify({variant:'B0355',mode,result:'passed',adminReached:attack.adminReached,h2Bytes:attack.h2Bytes}));
}
