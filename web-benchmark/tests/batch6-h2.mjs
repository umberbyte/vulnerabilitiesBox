import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const injected='GuideGET /admin HTTP/1.1\r\nHost: public.lab\r\n\r\n';
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0351',variant:'B0354',mode,seed:'h2-length-acceptance-v1'});
  const cookieJar=[];
  async function send(path,method='GET',body){
    const response=await fetch(target+manifest.base+path,{method,headers:{'content-type':'application/json',...(cookieJar.length?{cookie:cookieJar.join('; ')}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const set=response.headers.get('set-cookie');if(set)cookieJar.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login','POST',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normal=await (await send('/h2-transfer','POST',{body:'Guide',downstreamLength:5})).json();
  assert.deepEqual(normal.trace.map(item=>item.target),['/public']);
  assert.equal(normal.h2BodyBytes,5);assert.equal(normal.h1ContentLength,5);
  const malicious=await (await send('/h2-transfer','POST',{body:injected,downstreamLength:5})).json();
  const admin=malicious.trace.some(item=>item.target==='/admin');
  assert.equal(admin,mode==='V');
  assert.equal(malicious.rawResponse.includes('canary_'),mode==='V');
  assert.equal(malicious.h2BodyBytes,Buffer.byteLength(injected));
  assert.equal(malicious.h1ContentLength,mode==='V'?5:Buffer.byteLength(injected));
  const records=(await ctl('/oracle')).caseState.batch6H2.records;
  assert.equal(records.at(-1).adminReached,mode==='V');
  console.log(JSON.stringify({variant:'B0354',mode,result:'passed',adminReached:admin,h2Bytes:malicious.h2BodyBytes,h1Length:malicious.h1ContentLength}));
}
