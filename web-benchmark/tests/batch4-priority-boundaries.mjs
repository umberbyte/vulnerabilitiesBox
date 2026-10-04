import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const target=process.env.TARGET_URL||'https://app:8443';
const attacker=process.env.ATTACKER_URL||'https://app:8444';
const control=process.env.CONTROL_URL||'http://app:8099';
const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');

async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200,'Private control request failed');
  return response.json();
}
const cases=[
  {root:'R0061',variant:'B0061',kind:'engine',normal:{template:'Guide: {{2+2}}'},attack:{template:'Message: {{secret}}'}},
  {root:'R0064',variant:'B0064',kind:'engine',normal:{template:'{{name}}',environmentOptions:{}},attack:{template:'{{secret}}',environmentOptions:{exposeEnvironment:true}}},
  {root:'R0065',variant:'B0065',kind:'engine',normal:{evalText:'7'},attack:{evalText:'mark()'}},
  {root:'R0121',variant:'B0122',kind:'file',attack:{name:'/opt/benchmark/fixtures/v4-files/private/report.txt'}},
  {root:'R0121',variant:'B0134',kind:'file-search',attack:{name:'../private/*.txt'}},
  {root:'R0123',variant:'B0136',kind:'file',attack:{name:'．．/private/report.txt'}},
  {root:'R0126',variant:'B0139',kind:'file-write',attack:{name:'current.txt'}},
  {root:'R0331',variant:'B0339',kind:'cors'}
];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  for(const item of cases)for(const mode of ['V','F','N']){
    const manifest=await ctl('/reset',{root:item.root,variant:item.variant,mode,seed:'priority-boundaries-acceptance-v1'});
    const before=await ctl('/oracle');
    assert.equal(before.root,item.root);assert.equal(before.variant,item.variant);assert.equal(before.mode,mode);
    const base=target+manifest.base;
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    try{
      if(item.kind==='engine'){
        const login=await context.request.post(target+manifest.login,{data:{username:'alice',password:'Fixture-alice-2026!'}});
        assert.equal(login.status(),200,`${item.variant} login`);
        const endpoint=base+'/r3e-'+item.root.slice(1);
        const normal=await context.request.post(endpoint,{data:{operation:'normal',...item.normal}});
        assert.equal(normal.status(),200,`${item.variant} normal engine`);
        assert.equal((await normal.text()).includes(before.canary),false,`${item.variant} normal secrecy`);
        const attack=await context.request.post(endpoint,{data:{operation:'boundary',...item.attack}});
        assert.equal(attack.status(),200,`${item.variant} boundary status`);
        assert.equal((await attack.text()).includes(before.canary),mode==='V',`${item.variant} ${mode} engine marker`);
        const after=await ctl('/oracle');
        assert.ok(after.caseState?.enginesBatch?.records?.length>=2,`${item.variant} normal and boundary operations recorded`);
      }else if(item.kind.startsWith('file')){
        const endpoint=base+'/v4-files';
        const normalName=item.kind==='file-search'?'*.txt':item.kind==='file-write'?'new.txt':'guide.txt';
        const normal=await context.request.post(endpoint,{data:{name:normalName}});
        assert.equal(normal.status(),200,`${item.variant} normal file`);
        if(item.kind==='file-write')assert.equal((await normal.json()).written,true,`${item.variant} normal draft write`);
        else assert.equal((await normal.text()).includes('Public user guide'),true,`${item.variant} public file intact`);
        const attack=await context.request.post(endpoint,{data:item.attack});
        if(item.kind==='file-write'){
          assert.equal(attack.status(),mode==='V'?200:403,`${item.variant} ${mode} symlink overwrite status`);
          const after=await ctl('/oracle');
          assert.equal(after.caseState?.batch4Files?.privateReportIntact,mode!=='V',`${item.variant} ${mode} private file integrity`);
        }else assert.equal((await attack.text()).includes(before.canary),mode==='V',`${item.variant} ${mode} private file exposure`);
        if(mode==='N'){
          const benign=await context.request.post(endpoint,{data:{name:item.kind==='file-write'?'another.txt':normalName}});
          assert.equal(benign.status(),200,`${item.variant} hard-negative public file`);
        }
      }else{
        const page=await context.newPage();
        const normal=await page.goto(base+'/v5-transport');
        assert.equal(normal.status(),200,`${item.variant} normal page`);
        const sameOrigin=await page.evaluate(async url=>{const response=await fetch(url);return response.json();},base+'/v5-transport/local');
        assert.equal(sameOrigin.localOnlySecret,before.canary,`${item.variant} same-origin access`);
        const preflight=await context.request.fetch(base+'/v5-transport/local',{method:'OPTIONS',headers:{origin:attacker,'access-control-request-method':'GET','access-control-request-private-network':'true'}});
        assert.equal(preflight.headers()['access-control-allow-private-network']==='true',mode==='V',`${item.variant} ${mode} private-network preflight`);
        await page.goto(attacker+'/cors');
        const crossOrigin=await page.evaluate(async url=>{try{const response=await fetch(url);return {readable:true,body:await response.json()};}catch{return {readable:false};}},base+'/v5-transport/local');
        assert.equal(crossOrigin.readable,mode==='V',`${item.variant} ${mode} browser cross-origin read`);
        if(mode==='V')assert.equal(crossOrigin.body.localOnlySecret,before.canary,`${item.variant} cross-origin secret`);
      }
      console.log(JSON.stringify({root:item.root,variant:item.variant,mode,result:'passed'}));
    }finally{await context.close();}
  }
}finally{await browser.close();}
