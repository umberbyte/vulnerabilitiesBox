import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0117',variant:'B0176',mode,seed:'pdf-resource-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);
    return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normal=await send('/pdf-document',{document:'<resource href="http://public.fixture.test/asset"/>'});
  assert.equal(normal.status,200);
  assert.match(normal.headers.get('content-type'),/application\/pdf/);
  const normalPdf=Buffer.from(await normal.arrayBuffer()).toString('latin1');
  assert.ok(normalPdf.startsWith('%PDF-1.4'));
  assert.match(normalPdf,/Public PDF resource/);
  const attack=await send('/pdf-document',{document:'<resource href="http://internal.fixture.test/asset"/>'});
  assert.equal(attack.status,mode==='V'?200:403);
  if(mode==='V'){
    const privatePdf=Buffer.from(await attack.arrayBuffer()).toString('latin1');
    assert.match(privatePdf,/canary_[0-9a-f]{24}/);
  }
  const records=(await ctl('/oracle')).caseState.batch6Pdf.records;
  assert.deepEqual(records.map(item=>item.target),mode==='V'?['public','private']:['public']);
  console.log(JSON.stringify({variant:'B0176',mode,result:'passed',privateCallback:records.some(item=>item.target==='private')}));
}
