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
  ['B0077','R0076','-colorspace Gray','-write /tmp/execution-fixture/private/image-marker.png','imageMarker'],
  ['B0082','R0082','file:///tmp/execution-fixture/public.txt','file:///tmp/execution-fixture/private-canary.txt','exposed']
];
for(const [variant,root,normal,attack,proof] of cases)for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root,variant,mode,seed:'cli-media-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);
    return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normalResponse=await send('/cli-workbook',{value:normal});
  assert.equal(normalResponse.status,200,`${variant} ${mode} normal`);
  const normalBody=await normalResponse.json();
  if(variant==='B0082')assert.match(normalBody.output,/Public search guide/);
  if(proof==='imageMarker')assert.equal(normalBody.imageMarker,false);
  else assert.doesNotMatch(normalBody.output,/canary_[0-9a-f]{24}/);
  const attackResponse=await send('/cli-workbook',{value:attack});
  assert.equal(attackResponse.status,mode==='V'?200:400,`${variant} ${mode} attack`);
  if(mode==='V'){
    const body=await attackResponse.json();
    if(proof==='imageMarker')assert.equal(body.imageMarker,true);
    else assert.match(body.output,/canary_[0-9a-f]{24}/);
  }
  const records=(await ctl('/oracle')).caseState.batch6Cli.records;
  assert.equal(records.at(-1)[proof],mode==='V');
  console.log(JSON.stringify({variant,mode,result:'passed',proof:records.at(-1)[proof]}));
}
