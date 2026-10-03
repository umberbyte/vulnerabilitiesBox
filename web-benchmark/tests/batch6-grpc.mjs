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
  const manifest=await ctl('/reset',{root:'R0310',variant:'B0310',mode,seed:'grpc-interceptor-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);
    return {status:response.status,body:await response.json()};
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normal=await send('/grpc-operations',{action:'read',compressed:false});
  assert.equal(normal.status,200);assert.equal(normal.body.grpcStatus,0);
  const malicious=await send('/grpc-operations',{action:'archive',compressed:true});
  assert.equal(malicious.status,mode==='V'?200:403);
  assert.equal(malicious.body.grpcStatus,mode==='V'?0:7);
  const state=(await ctl('/oracle')).caseState.batch6Grpc;
  assert.equal(state.archived,mode==='V'?1:0);
  assert.deepEqual(state.events.map(item=>item.decoded),['read','archive']);
  assert.equal(state.events.at(-1).checked,mode==='V'?'read':'archive');
  if(mode==='N'){
    cookies.length=0;
    assert.equal((await send('/login',{username:'admin',password:'Fixture-admin-2026!'})).status,200);
    const permitted=await send('/grpc-operations',{action:'archive',compressed:true});
    assert.equal(permitted.status,200);assert.equal(permitted.body.grpcStatus,0);
    const adminState=(await ctl('/oracle')).caseState.batch6Grpc;
    assert.equal(adminState.archived,1);
    assert.equal(adminState.events.at(-1).role,'admin');
  }
  console.log(JSON.stringify({variant:'B0310',mode,result:'passed',archived:state.archived,checked:state.events.at(-1).checked}));
}
