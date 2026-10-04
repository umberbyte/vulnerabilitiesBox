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
async function query(base,cookie,value){
  const response=await fetch(target+base+'/v4-sql',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({value})});
  return {status:response.status,body:await response.text()};
}
for(const mode of ['V','F','N']){
  const root='R0003',variant='B0016';
  const manifest=await ctl('/reset',{root,variant,mode,seed:'priority-sql-update-acceptance-v1'});
  const before=await ctl('/oracle');
  assert.equal(before.root,root);assert.equal(before.variant,variant);assert.equal(before.mode,mode);
  assert.equal(before.caseState.batch4Sql.aliceRole,'user',`${mode} normal account role`);
  const login=await fetch(target+manifest.login,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'alice',password:'Fixture-alice-2026!'})});
  assert.equal(login.status,200,`${mode} normal login`);
  const cookie=login.headers.getSetCookie().map(header=>header.split(';',1)[0]).find(pair=>pair.startsWith('sid='));
  assert.ok(cookie,`${mode} session cookie`);
  const normal=await query(manifest.base,cookie,'contact');
  assert.equal(normal.status,200,`${mode} normal contact update`);
  const afterNormal=await ctl('/oracle');
  assert.equal(afterNormal.caseState.batch4Sql.aliceRole,'user',`${mode} normal update does not change role`);
  assert.equal(afterNormal.users.find(user=>user.name==='alice').contact,'alice.updated@example.test',`${mode} normal update persists`);
  const attack=await query(manifest.base,cookie,'role');
  assert.equal(attack.status,mode==='V'?200:400,`${mode} role column boundary`);
  const afterAttack=await ctl('/oracle');
  assert.equal(afterAttack.caseState.batch4Sql.aliceRole,mode==='V'?'admin':'user',`${mode} persisted role boundary`);
  if(mode==='N')assert.equal((await query(manifest.base,cookie,'contact')).status,200,'Hard-negative normal contact update');
  console.log(JSON.stringify({root,variant,mode,result:'passed'}));
}
