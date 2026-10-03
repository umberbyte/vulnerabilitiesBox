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
const attackStylesheet='<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0"><xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="document(\'file:///tmp/execution-fixture/private.xml\')/secret"/></xsl:template></xsl:stylesheet>';
const safeInclude='<root xmlns:xi="http://www.w3.org/2001/XInclude" xml:base="file:///tmp/execution-fixture/public/"><xi:include href="public.xml" parse="xml"/></root>';
const attackInclude='<root xmlns:xi="http://www.w3.org/2001/XInclude" xml:base="file:///tmp/execution-fixture/"><xi:include href="private.xml" parse="xml"/></root>';
const cases=[
  ['B0106','R0105',{position:'1'},{position:'1 or position()=2'},/Public member/],
  ['B0115','R0113',{stylesheet:safeStylesheet},{stylesheet:attackStylesheet},/Public XML resource/],
  ['B0119','R0113',{xml:safeInclude},{xml:attackInclude},/Public XML resource/]
];
for(const [variant,root,normal,attack,normalProof] of cases)for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root,variant,mode,seed:'xml-engine-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);
    return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normalResponse=await send('/xml-workbook',normal);
  assert.equal(normalResponse.status,200,`${variant} ${mode} normal`);
  assert.match((await normalResponse.json()).output,normalProof);
  const attackResponse=await send('/xml-workbook',attack);
  assert.equal(attackResponse.status,mode==='V'?200:400,`${variant} ${mode} attack`);
  if(mode==='V')assert.match((await attackResponse.json()).output,/canary_[0-9a-f]{24}/);
  const records=(await ctl('/oracle')).caseState.batch6Xml.records;
  assert.equal(records.at(-1).exposed,mode==='V');
  console.log(JSON.stringify({variant,mode,result:'passed',exposed:records.at(-1).exposed}));
}
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0105',variant:'B0110',mode,seed:'stored-xml-acceptance-v1'});
  const cookies=[];
  async function send(path,method='GET',body){
    const response=await fetch(target+manifest.base+path,{method,headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);
    return response;
  }
  assert.equal((await send('/login','POST',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  assert.equal((await send('/xml-workbook/saved','POST',{name:'alice'})).status,200);
  assert.match((await (await send('/xml-workbook/result')).json()).output,/Public member/);
  const attack=await send('/xml-workbook/saved','POST',{name:"alice' or @name='bob"});
  assert.equal(attack.status,mode==='V'?200:400);
  const result=await (await send('/xml-workbook/result')).json();
  assert.equal(result.output.includes('canary_'),mode==='V');
  const records=(await ctl('/oracle')).caseState.batch6Xml.records;
  assert.equal(records.at(-1).exposed,mode==='V');
  console.log(JSON.stringify({variant:'B0110',mode,result:'passed',exposed:records.at(-1).exposed}));
}
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0111',variant:'B0112',mode,seed:'parameter-entity-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const normal=await send('/xml-workbook',{xml:'<root>Guide</root>'});
  assert.equal(normal.status,200);assert.equal((await normal.json()).callback,false);
  const xml='<!DOCTYPE root [<!ENTITY % ext SYSTEM "http://127.0.0.1:8091/dtd">%ext;]><root>Guide</root>';
  const attack=await send('/xml-workbook',{xml});
  assert.equal(attack.status,mode==='V'?200:400);
  if(mode==='V')assert.equal((await attack.json()).callback,true);
  const records=(await ctl('/oracle')).caseState.batch6Xml.records;
  assert.equal(records.at(-1).callback,mode==='V');
  console.log(JSON.stringify({variant:'B0112',mode,result:'passed',callback:records.at(-1).callback}));
}
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0113',variant:'B0114',mode,seed:'schema-location-acceptance-v1'});
  const cookies=[];
  async function send(path,body){
    const response=await fetch(target+manifest.base+path,{method:'POST',headers:{'content-type':'application/json',...(cookies.length?{cookie:cookies.join('; ')}:{})},body:JSON.stringify(body)});
    const set=response.headers.get('set-cookie');if(set)cookies.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  const xml=url=>`<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="${url}">Guide</root>`;
  const normal=await send('/xml-workbook',{xml:xml('http://127.0.0.1:8091/schema-public')});
  assert.equal(normal.status,200);assert.equal((await normal.json()).callback,false);
  const attack=await send('/xml-workbook',{xml:xml('http://127.0.0.1:8091/schema-private')});
  assert.equal(attack.status,mode==='V'?200:400);
  if(mode==='V')assert.equal((await attack.json()).callback,true);
  const records=(await ctl('/oracle')).caseState.batch6Xml.records;
  assert.equal(records.at(-1).callback,mode==='V');
  console.log(JSON.stringify({variant:'B0114',mode,result:'passed',callback:records.at(-1).callback}));
}
