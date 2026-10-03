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
  ['B0091',{filter:'alice'},{filter:{$ne:'alice'}},400],
  ['B0092',{where:'this.username === "alice"'},{where:'this.username === "bob"'},400],
  ['B0093',{pipeline:[{$match:{tenant:'A'}},{$project:{_id:0,username:1,note:1}}]},{pipeline:[{$lookup:{from:'internal',localField:'join',foreignField:'join',as:'extra'}},{$unwind:'$extra'},{$project:{_id:0,secret:'$extra.value'}}]},400],
  ['B0095',{patch:{$set:{displayName:'Alice Updated'}}},{patch:{$set:{role:'admin'}}},400],
  ['B0096',{collection:'public'},{collection:'internal'},400],
  ['B0097',{pattern:'Guide'},{pattern:'.*'},200],
  ['B0098',{condition:{kind:'team',allowed:true}},{condition:{$and:[{'tags.kind':'team'},{'tags.allowed':true}]}},400]
];
for(const [variant,normal,attack,blockedStatus] of cases)for(const mode of ['V','F','N']){
  const root='R'+variant.slice(1),manifest=await ctl('/reset',{root,variant,mode,seed:'mongo-engine-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normalResponse=await send('/mongo-workbook',normal);
  assert.equal(normalResponse.status,200,`${variant} ${mode} normal`);
  const normalBody=await normalResponse.json();assert.ok(normalBody.rows.length>0);assert.equal(normalBody.exposed,false);
  const attackResponse=await send('/mongo-workbook',attack);
  assert.equal(attackResponse.status,mode==='V'?200:blockedStatus,`${variant} ${mode} attack`);
  const body=attackResponse.status===200?await attackResponse.json():null;
  const state=(await ctl('/oracle')).caseState.batch6Mongo;
  if(variant==='B0095'){
    assert.equal(state.aliceRole,mode==='V'?'admin':'user');
    assert.equal(state.records.at(-1).roleChanged,mode==='V');
  }else{
    if(body)assert.equal(body.exposed,mode==='V');
    assert.equal(state.records.at(-1).exposed,mode==='V');
  }
  console.log(JSON.stringify({variant,mode,result:'passed',exposed:state.records.at(-1).exposed,aliceRole:state.aliceRole}));
}
