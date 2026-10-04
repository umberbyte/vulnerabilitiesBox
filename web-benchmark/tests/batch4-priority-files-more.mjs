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
async function query(base,name){
  const response=await fetch(target+base+'/v4-files',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
  return {status:response.status,body:await response.text()};
}
const cases=[
  {root:'R0121',variant:'B0125',normal:'guide.txt',normalMarker:'Public user guide',attack:'../public-extra/secret.txt',oracle:'read'},
  {root:'R0121',variant:'B0128',normal:'help',normalMarker:'Help page',attack:'../private/report',oracle:'read'},
  {root:'R0121',variant:'B0129',normal:'own.txt',normalMarker:'"saved":true',attack:'../public/guide.txt',oracle:'protectedOverwrite'},
  {root:'R0121',variant:'B0130',normal:'own.txt',normalMarker:'"deleted":true',attack:'../private/report.txt',oracle:'privateDelete'},
  {root:'R0121',variant:'B0131',normal:'own-copy.txt',normalMarker:'"copied":true',attack:'../public/leak.txt',oracle:'publicLeak'},
  {root:'R0121',variant:'B0140',normal:'guide.txt',normalMarker:'Public user guide',attack:'../private/report.txt',oracle:'read'}
];
for(const item of cases)for(const mode of ['V','F','N']){
  const seed='priority-files-more-acceptance-v1';
  const manifest=await ctl('/reset',{root:item.root,variant:item.variant,mode,seed});
  const before=await ctl('/oracle');
  assert.equal(before.root,item.root);assert.equal(before.variant,item.variant);assert.equal(before.mode,mode);
  assert.equal(before.caseState.batch4Files.privateReportIntact,true,`${item.variant} ${mode} initial private file`);
  assert.equal(before.caseState.batch4Files.publicLeakExists,false,`${item.variant} ${mode} initial public leak`);
  const normal=await query(manifest.base,item.normal);
  assert.equal(normal.status,200,`${item.variant} ${mode} normal request`);
  assert.equal(normal.body.includes(item.normalMarker),true,`${item.variant} ${mode} normal operation`);
  const afterNormal=await ctl('/oracle');
  assert.equal(afterNormal.caseState.batch4Files.privateReportIntact,true,`${item.variant} ${mode} normal operation preserves private file`);
  assert.equal(afterNormal.caseState.batch4Files.publicLeakExists,false,`${item.variant} ${mode} normal operation preserves public boundary`);
  const attack=await query(manifest.base,item.attack);
  assert.equal(attack.status,mode==='V'?200:403,`${item.variant} ${mode} boundary status`);
  const after=await ctl('/oracle');
  if(item.oracle==='read')assert.equal(attack.body.includes(before.canary),mode==='V',`${item.variant} ${mode} private content exposure`);
  if(item.oracle==='protectedOverwrite'){
    const guide=await fetch(target+manifest.base+'/v4-files/public/guide.txt');
    assert.equal(guide.status,200,`${item.variant} public guide reachable`);
    assert.equal(await guide.text(),mode==='V'?'Saved draft':'Public user guide',`${item.variant} ${mode} protected guide content`);
  }
  if(item.oracle==='publicLeak'){
    assert.equal(after.caseState.batch4Files.publicLeakExists,mode==='V',`${item.variant} ${mode} public file created`);
    if(mode==='V'){
      const leak=await fetch(target+manifest.base+'/v4-files/public/leak.txt');
      assert.equal(leak.status,200,`${item.variant} public leak reachable`);
      assert.equal((await leak.text()).includes(before.canary),item.variant!=='B0129',`${item.variant} public content`);
    }
  }
  if(item.oracle==='privateDelete')assert.equal(after.caseState.batch4Files.privateReportExists,mode!=='V',`${item.variant} ${mode} private file integrity`);
  if(mode==='N'){
    await ctl('/reset',{root:item.root,variant:item.variant,mode,seed});
    const benign=await query(manifest.base,item.normal);
    assert.equal(benign.status,200,`${item.variant} hard-negative normal request`);
    assert.equal(benign.body.includes(item.normalMarker),true,`${item.variant} hard-negative normal operation`);
  }
  console.log(JSON.stringify({root:item.root,variant:item.variant,mode,result:'passed'}));
}
