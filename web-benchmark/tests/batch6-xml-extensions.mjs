import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const safeStylesheet='<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0"><xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="/root/public"/></xsl:template></xsl:stylesheet>';
const attackStylesheet='<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:ext="urn:benchmark-extension" version="1.0"><xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="ext:marker()"/></xsl:template></xsl:stylesheet>';
for(const [variant,normal,attack] of [
  ['B0109',{expression:'string(/root/public)'},{expression:'ext:marker()'}],
  ['B0116',{stylesheet:safeStylesheet},{stylesheet:attackStylesheet}]
])for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R'+variant.slice(1),variant,mode,seed:'xml-extension-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normalResponse=await send('/xml-workbook',normal);
  assert.equal(normalResponse.status,200,`${variant} ${mode} normal`);
  assert.match((await normalResponse.json()).output,/Public XML resource/);
  const attackResponse=await send('/xml-workbook',attack);
  assert.equal(attackResponse.status,mode==='V'?200:400,`${variant} ${mode} attack`);
  if(mode==='V'){
    const result=await attackResponse.json();
    assert.equal(result.marker,true);
    assert.match(result.output,/extension-marker-called/);
  }
  const records=(await ctl('/oracle')).caseState.batch6Xml.records;
  assert.equal(records.at(-1).marker,mode==='V');
  console.log(JSON.stringify({variant,mode,result:'passed',marker:records.at(-1).marker}));
}
