import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const table=Array.from({length:256},(_,initial)=>{let value=initial;for(let n=0;n<8;n++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=((crc>>>8)^table[(crc^byte)&255])>>>0;return (crc^0xffffffff)>>>0;};
function zip(entries){
  const locals=[],centrals=[];let offset=0;
  for(const [name,text]of entries){
    const filename=Buffer.from(name),data=Buffer.from(text),crc=crc32(data),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    locals.push(local,filename,data);centrals.push(central,filename);offset+=local.length+filename.length+data.length;
  }
  const centralBytes=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,centralBytes,end]).toString('base64');
}
function docx(html){return zip([
  ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="html" ContentType="text/html"/></Types>'],
  ['word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:altChunk r:id="htmlChunk"/></w:body></w:document>'],
  ['word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.html"/></Relationships>'],
  ['word/afchunk.html',html]
]);}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  for(const mode of ['V','F','N']){
    const manifest=await ctl('/reset',{root:'R0034',variant:'B0147',mode,seed:'docx-html-acceptance-v1'});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    try{
      const base=target+manifest.base;
      assert.equal((await context.request.post(base+'/login',{data:{username:'alice',password:'Fixture-alice-2026!'}})).status(),200);
      assert.equal((await context.request.get(base+'/document-import')).status(),200);
      assert.equal((await context.request.post(base+'/document-import',{data:{docx:docx('<p>Public guide</p>')}})).status(),201);
      const normal=await context.request.get(base+'/document-preview');assert.match(await normal.text(),/<p>Public guide<\/p>/);
      const script=`<script>fetch(${JSON.stringify(manifest.base+'/document-script-marker')},{method:'POST'})</script>`;
      assert.equal((await context.request.post(base+'/document-import',{data:{docx:docx(`<p>Public guide</p>${script}`)}})).status(),201);
      const page=await context.newPage();await page.goto(base+'/document-preview');
      let state;
      for(let attempt=0;attempt<20;attempt++){
        state=(await ctl('/oracle')).caseState.batch6Docx;
        if(mode!=='V'||state.scriptReceipts===1)break;
        await page.waitForTimeout(100);
      }
      assert.equal(state.sourcePart,'word/afchunk.html');
      assert.equal(state.scriptReceipts,mode==='V'?1:0);
      console.log(JSON.stringify({variant:'B0147',mode,result:'passed',scriptReceipts:state.scriptReceipts}));
    }finally{await context.close();}
  }
}finally{await browser.close();}
