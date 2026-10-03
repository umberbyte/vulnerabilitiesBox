import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {chromium} from 'playwright-core';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw new Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const png=new PNG({width:1,height:1});png.data.set([40,120,200,255]);const normalPng=PNG.sync.write(png);
const normalSvg='<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="blue"/></svg>';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  for(const variant of ['B0144','B0160'])for(const mode of ['V','F','N']){
    const manifest=await ctl('/reset',{root:'R0142',variant,mode,seed:'image-upload-acceptance-v1'});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    try{
      const base=target+manifest.base;
      const login=await context.request.post(base+'/login',{data:{username:'alice',password:'Fixture-alice-2026!'}});
      assert.equal(login.status(),200);
      const normal=variant==='B0144'?{filename:'shape.svg',content:Buffer.from(normalSvg).toString('base64')}:{filename:'pixel.png',content:normalPng.toString('base64')};
      assert.equal((await context.request.post(base+'/image-library',{data:normal})).status(),201);
      const preview=await context.request.get(base+'/image-preview');
      assert.equal(preview.status(),200);
      assert.match(preview.headers()['content-type'],variant==='B0144'?/image\/svg\+xml/:/image\/png/);
      const marker=manifest.base+'/image-script-marker';
      const script=`<script>fetch(${JSON.stringify(marker)},{method:'POST'})</script>`;
      const malicious=variant==='B0144'
        ?Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">${script}<rect width="1" height="1" fill="blue"/></svg>`)
        :Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from(`<!doctype html><html>${script}</html>`)]);
      const uploaded=await context.request.post(base+'/image-library',{data:{filename:'polyglot.html',content:malicious.toString('base64')}});
      assert.equal(uploaded.status(),mode==='V'?201:400);
      const page=await context.newPage();
      await page.goto(base+'/image-preview');
      let state;
      for(let attempt=0;attempt<20;attempt++){
        state=(await ctl('/oracle')).caseState.batch6Uploads;
        if(mode!=='V'||state.scriptReceipts===1)break;
        await page.waitForTimeout(100);
      }
      assert.equal(state.scriptReceipts,mode==='V'?1:0);
      assert.equal(state.storedType,mode==='V'?'text/html':variant==='B0144'?'image/svg+xml':'image/png');
      console.log(JSON.stringify({variant,mode,result:'passed',scriptReceipts:state.scriptReceipts,storedType:state.storedType}));
    }finally{await context.close();}
  }
}finally{await browser.close();}
