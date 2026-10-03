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
  ['B0079','R0076','public.txt','', '--checkpoint-action=exec=cat private-canary.txt','leak'],
  ['B0081','R0071','public/report.txt','','public/report.txt; printf unauthorized > private/proof.txt','write'],
  ['B0083','R0071','Public guide','Public guide','Public guide\ncat private-canary.txt','leak'],
  ['B0085','R0084','trusted','Trusted tool','uploaded','path'],
  ['B0087','R0071','Guide','Guide','Guide; cat private-canary.txt','arg'],
  ['B0088','R0071','Guide','Guide','Guide\ncat private-canary.txt','leak'],
  ['B0090','R0076','public.txt','','"--checkpoint-action=exec=cat private-canary.txt" public.txt','leak']
];
for(const [variant,root,normal,expected,attack,kind] of cases)for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root,variant,mode,seed:'cli-boundary-acceptance-v1'});
  const cookieJar=[];
  async function send(path,method='GET',body){
    const response=await fetch(target+manifest.base+path,{method,headers:{'content-type':'application/json',...(cookieJar.length?{cookie:cookieJar.join('; ')}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const set=response.headers.get('set-cookie');if(set)cookieJar.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login','POST',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  assert.equal((await send('/cli-workbook')).status,200);
  const normalResponse=await send('/cli-workbook','POST',{value:normal});
  assert.equal(normalResponse.status,200,`${variant} ${mode} normal`);
  const normalBody=await normalResponse.json();
  assert.ok(normalBody.output.includes(expected));
  if(variant==='B0081')assert.match(await (await send('/cli-report?name=report.txt')).text(),/Public report/);
  assert.equal(normalBody.protectedWrite,false);
  const attackResponse=await send('/cli-workbook','POST',{value:attack});
  assert.equal(attackResponse.status,mode==='V'||['path','arg'].includes(kind)?200:400,`${variant} ${mode} attack`);
  const body=attackResponse.status===200?await attackResponse.json():null;
  if(mode==='V'&&['leak','arg'].includes(kind))assert.match(body.output,/canary_[0-9a-f]{24}/);
  if(mode==='V'&&kind==='write')assert.equal(body.protectedWrite,true);
  if(kind==='path'&&mode!=='V')assert.match(body.output,/Trusted tool/);
  const records=(await ctl('/oracle')).caseState.batch6Cli.records;
  assert.equal(records.length,mode==='V'||['path','arg'].includes(kind)?2:1);
  assert.equal(records.at(-1).exposed,mode==='V'&&kind!=='write');
  assert.equal(records.at(-1).protectedWrite,mode==='V'&&kind==='write');
  console.log(JSON.stringify({variant,mode,result:'passed',exposed:records.at(-1).exposed,protectedWrite:records.at(-1).protectedWrite}));
}
