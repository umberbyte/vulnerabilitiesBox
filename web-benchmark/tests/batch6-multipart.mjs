import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const boundary='multipart-lab-boundary';
const part=(name,value)=>`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const normal=part('description','Public note')+part('action','save')+`--${boundary}--\r\n`;
const attack=part('description',`Public note --${boundary}-- is literal text`)+part('action','publish_private')+`--${boundary}--\r\n`;
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0150',variant:'B0369',mode,seed:'multipart-parser-acceptance-v1'});
  const cookieJar=[];
  async function send(path,method='GET',body,multipart=false){
    const response=await fetch(target+manifest.base+path,{method,headers:{'content-type':multipart?`multipart/form-data; boundary=${boundary}`:'application/json',...(cookieJar.length?{cookie:cookieJar.join('; ')}:{})},...(body?{body:multipart?body:JSON.stringify(body)}:{})});
    const set=response.headers.get('set-cookie');if(set)cookieJar.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login','POST',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  assert.equal((await send('/multipart-document')).status,200);
  assert.equal((await send('/multipart-document','POST',normal,true)).status,200);
  assert.equal((await ctl('/oracle')).caseState.batch6Multipart.privatePublished,false);
  const response=await send('/multipart-document','POST',attack,true);
  assert.equal(response.status,mode==='V'?200:403);
  const state=(await ctl('/oracle')).caseState.batch6Multipart;
  assert.deepEqual(state.lastFields,['description','action']);
  assert.equal(state.privatePublished,mode==='V');
  console.log(JSON.stringify({variant:'B0369',mode,result:'passed',privatePublished:state.privatePublished,parsedFields:state.lastFields}));
}
