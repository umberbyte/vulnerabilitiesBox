import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw new Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const app='https://app.benchmark.test:8443';
const evil='https://evil.benchmark.test:8443';
async function reset(mode){
  const response=await fetch(control+'/reset',{method:'POST',headers:{'x-benchmark-key':key,'content-type':'application/json'},body:JSON.stringify({root:'R0235',variant:'B0236',mode,seed:'cookie-shadow-acceptance-v1'})});
  assert.equal(response.status,200);return response.json();
}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  for(const mode of ['V','F','N']){
    const manifest=await reset(mode);
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    try{
      const login=await context.request.post(app+manifest.base+'/b2-cookie-signin',{data:{username:'alice',password:'Fixture-alice-2026!'}});
      assert.equal(login.status(),200);
      const account=app+manifest.base+'/b2-cookie-account';
      assert.equal((await (await context.request.get(account)).json()).username,'alice');
      const attackerLogin=await context.request.post(evil+manifest.base+'/login',{data:{username:'bob',password:'Fixture-bob-2026!'}});
      assert.equal(attackerLogin.status(),200);
      const planted=await context.request.get(evil+manifest.base+'/b2-cookie-shadow');
      assert.equal(planted.status(),200);
      assert.equal((await planted.json()).issuedFor,'bob');
      const page=await context.newPage();await page.goto(account);
      const observed=JSON.parse(await page.locator('body').textContent());
      assert.equal(observed.username,mode==='V'?'bob':'alice');
      const cookies=await context.cookies(account);
      assert.ok(cookies.some(cookie=>cookie.name==='memberSession'&&cookie.domain.replace(/^\./,'')==='benchmark.test'));
      if(mode!=='V')assert.ok(cookies.some(cookie=>cookie.name==='__Host-memberSession'&&cookie.domain==='app.benchmark.test'&&cookie.path==='/'&&cookie.secure));
      console.log(JSON.stringify({variant:'B0236',mode,result:'passed',browserIdentity:observed.username,memberCookies:cookies.filter(cookie=>cookie.name==='memberSession').length}));
    }finally{await context.close();}
  }
}finally{await browser.close();}
