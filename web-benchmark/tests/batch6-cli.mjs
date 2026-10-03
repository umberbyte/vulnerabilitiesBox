import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const cases=[
  ['B0072','2+3','5','2+3; system("cat private-canary.txt")'],
  ['B0073','s/Guide/Welcome/p','Welcome','1e cat private-canary.txt'],
  ['B0078','-name public.txt','public.txt','-exec cat private-canary.txt ;']
];
for(const [variant,normal,expected,attack] of cases)for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0072',variant,mode,seed:'cli-expression-acceptance-v1'});
  const cookieJar=[];
  async function send(path,method='GET',body){
    const response=await fetch(target+manifest.base+path,{method,headers:{'content-type':'application/json',...(cookieJar.length?{cookie:cookieJar.join('; ')}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const set=response.headers.get('set-cookie');if(set)cookieJar.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login','POST',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  assert.equal((await send('/cli-workbook')).status,200);
  const normalResponse=await send('/cli-workbook','POST',{expression:normal});
  assert.equal(normalResponse.status,200);
  assert.ok((await normalResponse.json()).output.includes(expected));
  const attackResponse=await send('/cli-workbook','POST',{expression:attack});
  assert.equal(attackResponse.status,mode==='V'?200:400);
  const body=attackResponse.status===200?await attackResponse.json():null;
  if(body)assert.match(body.output,/canary_[0-9a-f]{24}/);
  const records=(await ctl('/oracle')).caseState.batch6Cli.records;
  assert.equal(records.length,mode==='V'?2:1);
  assert.equal(records.at(-1).exposed,mode==='V');
  console.log(JSON.stringify({variant,mode,result:'passed',exposed:records.at(-1).exposed}));
}
