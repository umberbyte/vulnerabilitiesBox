import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const target=process.env.TARGET_URL||'https://app:8443';
const control=process.env.CONTROL_URL||'http://app:8099';
const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');

async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200,'Private control request failed');
  return response.json();
}

const marker="window.__benchmarkExecuted=1";
const image=`<img src=x onerror="${marker}">`;
const cases=[
  {root:'R0022',variant:'B0024',payload:`x onmouseover="${marker}"`,action:page=>page.locator('#entry').hover()},
  {root:'R0027',variant:'B0028',payload:'${'+marker+'}'},
  {root:'R0027',variant:'B0030',payload:`');${marker};//`,action:page=>page.locator('#entry').click()},
  {root:'R0021',variant:'B0032',payload:'</textarea>'+image},
  {root:'R0021',variant:'B0033',payload:'-->'+image},
  {root:'R0034',variant:'B0035',payload:image},
  {root:'R0034',variant:'B0036',payload:image},
  {root:'R0021',variant:'B0037',payload:image,stored:true,login:true},
  {root:'R0034',variant:'B0038',payload:image,stored:true},
  {root:'R0021',variant:'B0040',payload:image}
];

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  for(const item of cases)for(const mode of ['V','F','N']){
    const manifest=await ctl('/reset',{root:item.root,variant:item.variant,mode,seed:'priority-browser-acceptance-v1'});
    const before=await ctl('/oracle');
    assert.equal(before.root,item.root);assert.equal(before.variant,item.variant);assert.equal(before.mode,mode);
    const base=target+manifest.base;
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    try{
      if(item.login){
        const login=await context.request.post(target+manifest.login,{data:{username:'alice',password:'Fixture-alice-2026!'}});
        assert.equal(login.status(),200,`${item.variant} login`);
      }
      if(item.stored){
        const response=await context.request.post(base+'/v4-browser',{data:{text:'Hello'}});
        assert.equal(response.status(),200,`${item.variant} normal store`);
      }
      const page=await context.newPage();
      const normal=await page.goto(base+'/v4-browser'+(item.stored?'':'?text=Hello'));
      assert.equal(normal.status(),200,`${item.variant} normal page`);
      assert.equal((await normal.text()).includes('Hello'),true,`${item.variant} normal content`);
      if(item.stored){
        const response=await context.request.post(base+'/v4-browser',{data:{text:item.payload}});
        assert.equal(response.status(),200,`${item.variant} payload store`);
      }
      const attack=await page.goto(base+'/v4-browser'+(item.stored?'':'?text='+encodeURIComponent(item.payload)));
      assert.equal(attack.status(),200,`${item.variant} payload page`);
      if(item.action)await item.action(page);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(()=>window.__benchmarkExecuted===1),mode==='V',`${item.variant} ${mode} browser execution`);
      if(mode==='N'){
        const benign=await page.goto(base+'/v4-browser'+(item.stored?'':'?text=Hello'));
        assert.equal(benign.status(),200,`${item.variant} hard-negative normal page`);
      }
      console.log(JSON.stringify({root:item.root,variant:item.variant,mode,result:'passed'}));
    }finally{await context.close();}
  }
}finally{await browser.close();}
