import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const ordinary='POST /public HTTP/1.1\r\nHost: public.lab\r\nContent-Length: 5\r\n\r\nGuide';
const smuggled='GET /admin HTTP/1.1\r\nHost: public.lab\r\n\r\n';
const body='0\r\n\r\n'+smuggled;
const attack=`POST /public HTTP/1.1\r\nHost: public.lab\r\nContent-Length: ${Buffer.byteLength(body)}\r\nTransfer-Encoding: chunked;legacy\r\n\r\n${body}`;
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0351',variant:'B0353',mode,seed:'te-grammar-acceptance-v1'});
  const cookieJar=[];
  async function send(path,method='GET',body){
    const response=await fetch(target+manifest.base+path,{method,headers:{'content-type':'application/json',...(cookieJar.length?{cookie:cookieJar.join('; ')}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const set=response.headers.get('set-cookie');if(set)cookieJar.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login','POST',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const regular=await (await send('/b3-wire','POST',{raw:ordinary})).json();
  assert.equal(regular.trace.filter(event=>event.stage==='backend').length,1);
  const malicious=await (await send('/b3-wire','POST',{raw:attack})).json();
  const admin=malicious.trace.some(event=>event.stage==='backend'&&event.target==='/admin');
  assert.equal(admin,mode==='V');
  assert.equal(malicious.rawResponse.includes('canary_'),mode==='V');
  const events=(await ctl('/oracle')).caseState.protocolBatch.events;
  assert.equal(events.some(event=>event.kind==='wire-admin'),mode==='V');
  console.log(JSON.stringify({variant:'B0353',mode,result:'passed',smuggledAdmin:admin}));
}
