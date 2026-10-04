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
  {root:'R0001',variant:'B0002',normal:'1',attack:'1 OR secret=true --'},
  {root:'R0003',variant:'B0004',normal:'v4_public_items',attack:'items WHERE secret=true --'},
  {root:'R0001',variant:'B0007',normal:'1,2',attack:'1) OR secret=true --'},
  {root:'R0001',variant:'B0008',normal:'2',attack:'2; SELECT title FROM items WHERE secret=true'},
  {root:'R0001',variant:'B0009',normal:'label',attack:"label')='Apple' OR secret=true --"},
  {root:'R0001',variant:'B0010',normal:'apple',attack:"apple') OR secret=true --"},
  {root:'R0003',variant:'B0014',normal:'title',attack:'title, (SELECT title FROM items WHERE secret=true LIMIT 1)'},
  {root:'R0003',variant:'B0017',normal:'text',attack:'text, (SELECT title FROM items WHERE secret=true LIMIT 1)'},
  {root:'R0003',variant:'B0018',normal:'"C"',attack:'"C"; SELECT title FROM items WHERE secret=true'},
  {root:'R0005',variant:'B0019',normal:'title',attack:'title FROM items WHERE secret=true --'},
  {root:'R0006',variant:'B0020',normal:'@>',attack:`@> '{"label":"Apple"}'::jsonb OR secret=true --`}
];
for(const item of cases)for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:item.root,variant:item.variant,mode,seed:'priority-sql-more-acceptance-v1'});
  const before=await ctl('/oracle');
  assert.equal(before.root,item.root);assert.equal(before.variant,item.variant);assert.equal(before.mode,mode);
  const normal=await query(manifest.base,item.normal);
  assert.equal(normal.status,200,`${item.variant} ${mode} normal request`);
  assert.equal(normal.body.includes('Apple'),true,`${item.variant} ${mode} normal public row`);
  assert.equal(normal.body.includes(before.canary),false,`${item.variant} ${mode} normal input exposes protected row`);
  const attack=await query(manifest.base,item.attack);
  assert.equal(attack.body.includes(before.canary),mode==='V',`${item.variant} ${mode} protected row exposure`);
  if(mode==='N'){
    const benign=await query(manifest.base,item.normal);
    assert.equal(benign.status,200,`${item.variant} hard-negative normal operation`);
    assert.equal(benign.body.includes(before.canary),false,`${item.variant} hard-negative protected row`);
  }
  console.log(JSON.stringify({root:item.root,variant:item.variant,mode,result:'passed'}));
}
