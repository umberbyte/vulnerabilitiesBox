import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const base='dc=benchmark,dc=test';
const cases=[
  ['B0099','R0099',{uid:'alice'},{uid:'alice)(uid=bob'},200,'hasBob'],
  ['B0100','R0100',{attribute:'uid',value:'alice'},{attribute:'description',value:'private'},400,'hasBob'],
  ['B0101','R0101',{rdn:'alice'},{rdn:'bob,ou=teamB'},200,'hasBob'],
  ['B0102','R0102',{base:'ou=teamA,'+base},{base:'ou=teamB,'+base},400,'hasBob'],
  ['B0103','R0102',{scope:'one'},{scope:'sub'},400,'hasBob'],
  ['B0104','R0094',{attributes:['uid','cn']},{attributes:['uid','postalAddress']},400,'exposed']
];
for(const [variant,root,normal,attack,blockedStatus,proof] of cases)for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root,variant,mode,seed:'ldap-engine-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normalResponse=await send('/ldap-workbook',normal);
  assert.equal(normalResponse.status,200,`${variant} ${mode} normal`);
  assert.ok((await normalResponse.json()).rows.length>0);
  const attackResponse=await send('/ldap-workbook',attack);
  assert.equal(attackResponse.status,mode==='V'?200:blockedStatus,`${variant} ${mode} attack`);
  const state=(await ctl('/oracle')).caseState.batch6Ldap;
  assert.equal(state.records.at(-1)[proof],mode==='V');
  console.log(JSON.stringify({variant,mode,result:'passed',proof:state.records.at(-1)[proof]}));
}
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0181',variant:'B0181',mode,seed:'ldap-empty-bind-acceptance-v1'});
  assert.equal((await fetch(target+manifest.base+'/ldap-login')).status,200);
  async function login(password){
    const response=await fetch(target+manifest.base+'/ldap-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'alice',password})});
    return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const normal=await login('Alice-ldap-2026!');assert.equal(normal.status,200);
  const normalPrivate=await fetch(target+manifest.base+'/ldap-private',{headers:{cookie:normal.cookie}});
  assert.equal(normalPrivate.status,200);
  const attack=await login('');assert.equal(attack.status,mode==='V'?200:403);
  if(mode==='V'){
    const response=await fetch(target+manifest.base+'/ldap-private',{headers:{cookie:attack.cookie}});
    assert.equal(response.status,200);assert.match(JSON.stringify(await response.json()),/canary_[0-9a-f]{24}/);
  }
  const state=(await ctl('/oracle')).caseState.batch6Ldap;
  assert.equal(state.sessionCount,mode==='V'?2:1);
  assert.equal(state.records.at(-1).anonymous,mode==='V');
  console.log(JSON.stringify({variant:'B0181',mode,result:'passed',anonymousSession:mode==='V'}));
}
