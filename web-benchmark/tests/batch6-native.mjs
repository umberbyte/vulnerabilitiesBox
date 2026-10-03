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
  ['B0491',{amount:4,secondary:0},{amount:32,secondary:0}],
  ['B0492',{amount:2,secondary:2},{amount:65536,secondary:65536}],
  ['B0493',{amount:4,secondary:0},{amount:-1,secondary:0}],
  ['B0494',{amount:0,secondary:6},{amount:16,secondary:31}],
  ['B0495',{amount:0,secondary:0},{amount:1,secondary:0}],
  ['B0496',{amount:0,secondary:0},{amount:1,secondary:0}]
];
for(const [variant,normal,attack] of cases)for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R'+variant.slice(1),variant,mode,seed:'native-addon-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normalResponse=await send('/native-workbook',normal);
  assert.equal(normalResponse.status,200,`${variant} ${mode} normal`);
  assert.ok((await normalResponse.json()).output);
  const attackResponse=await send('/native-workbook',attack);
  const expected=mode==='V'?(variant==='B0494'?200:503):400;
  assert.equal(attackResponse.status,expected,`${variant} ${mode} attack status`);
  if(mode==='V'&&variant==='B0494')assert.match((await attackResponse.json()).output,/canary_[0-9a-f]{24}/);
  const records=(await ctl('/oracle')).caseState.batch6Native.records;
  const actual=records.at(-1);
  assert.equal(actual.asanViolation,mode==='V'&&variant!=='B0494',`${variant} ${mode} asan`);
  assert.equal(actual.exposed,mode==='V'&&variant==='B0494',`${variant} ${mode} disclosure`);
  console.log(JSON.stringify({variant,mode,result:'passed',asanViolation:actual.asanViolation,exposed:actual.exposed}));
}
