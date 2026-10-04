import assert from 'node:assert/strict';

const target=process.env.TARGET_URL||'https://app:8443';
const control=process.env.CONTROL_URL||'http://app:8099';
const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');

async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200,'Private control request failed');
  return response.json();
}
async function query(base,value){
  const response=await fetch(target+base+'/v4-sql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({value})});
  return {status:response.status,body:await response.text()};
}

const cases=[
  {root:'R0001',variant:'B0011',normal:'Apple',attack:"' OR secret=true --"},
  {root:'R0001',variant:'B0012',normal:'Apple',attack:"' OR secret=true --"},
  {root:'R0005',variant:'B0013',normal:"title ILIKE '%Apple%' AND secret=false",attack:'secret=true'},
  {root:'R0001',variant:'B0015',normal:'0',attack:'0 OR secret=true --'}
];
for(const item of cases)for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:item.root,variant:item.variant,mode,seed:'priority-sql-acceptance-v1'});
  const before=await ctl('/oracle');
  assert.equal(before.root,item.root);assert.equal(before.variant,item.variant);assert.equal(before.mode,mode);
  const normal=await query(manifest.base,item.normal);
  assert.equal(normal.status,200,`${item.variant} ${mode} normal request`);
  assert.equal(normal.body.includes(before.canary),false,`${item.variant} ${mode} normal input exposes a protected row`);
  const attack=await query(manifest.base,item.attack);
  assert.equal(attack.body.includes(before.canary),mode==='V',`${item.variant} ${mode} protected row exposure`);
  if(mode==='N'){
    const benign=await query(manifest.base,item.normal);
    assert.equal(benign.status,200,`${item.variant} hard-negative normal operation`);
  }
  console.log(JSON.stringify({root:item.root,variant:item.variant,mode,result:'passed'}));
}
