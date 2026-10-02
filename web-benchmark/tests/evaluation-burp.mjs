// Every XML/condition below is a synthetic parser fixture, not a Burp product run.
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import {conditionsTemplate,validateConditions,importBurp,verifyBurpSources} from '../src/evaluation/burp.mjs';
import {parseBurpXml,sha256} from '../src/evaluation/burp-xml.mjs';
import {classify,summarize,validate} from '../src/evaluation/records.mjs';
import {verified,main} from '../src/evaluation/cli.mjs';

const workspace='/w/'+sha256('parser-onlyR0001').slice(0,12),origin='https://fixture.invalid:8443',scope={workspace,origins:[origin]};
const request=Buffer.from(`GET ${workspace}/search?q=normal HTTP/1.1\r\nHost: fixture.invalid:8443\r\n\r\n`);
const response=Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\n\r\n'),Buffer.from([0,255,10,128])]);
const dtd='<!DOCTYPE issues [<!ELEMENT issues (issue*)><!ATTLIST issues burpVersion CDATA #REQUIRED exportTime CDATA #REQUIRED><!ELEMENT request (#PCDATA)><!ATTLIST request base64 (true|false) "false">]>';
function issue({id='9223372036854775807',host=origin,url=workspace+'/search',req=request,resp=response,base64=true,detail='<script>alert("untrusted fixture")</script>'}={}){
  const encode=bytes=>base64?bytes.toString('base64'):'<![CDATA['+bytes.toString('utf8')+']]>';
  return `<issue><serialNumber>${id}</serialNumber><type>12345</type><name>Untrusted &amp; fixture</name><host ip="127.0.0.1">${host}</host><path>${url}</path><location>query parameter</location><severity>High</severity><confidence>Certain</confidence><issueDetail><![CDATA[${detail}]]></issueDetail><requestresponse><request base64="${base64}">${encode(req)}</request><response base64="${base64}">${encode(resp)}</response></requestresponse></issue>`;
}
const xml=(body=issue(),decl='<?xml version="1.0" encoding="UTF-8"?>',doctype=dtd)=>Buffer.from(`${decl}${doctype}<issues burpVersion="synthetic-parser-fixture" exportTime="fixture-only">${body}</issues>`);
async function area(t){const dir=await mkdtemp(path.join(os.tmpdir(),'benchmark-burp-parser-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function fixture(t,{confirmed=false,body=issue()}={}){
  const dir=await area(t),conditions=conditionsTemplate({root:'R0001',arm:'V',seed:'parser-only'});conditions.scopeOrigins=[origin];
  if(confirmed){
    Object.assign(conditions,{runId:'synthetic-parser-run',toolVersion:'synthetic-parser-fixture',profile:'parser-only-active',status:'completed',budgets:{wallSeconds:30,requestedHttpRequests:100,requestedConcurrency:2},errorCount:0,traffic:{settled:true,actualRequests:12},auth:{configuredAuthentication:'none',subject:null,identityVerified:false,protectedOperationVerified:true},inputFiles:{publicManifest:'manifest.json',originalOpenapi:'openapi.json'},settingsFile:'settings.json'});
    conditions.capture={verified:true,operator:'synthetic-parser-test',startedAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:00:10Z',reportSelection:'all_issues_for_this_run',httpMessages:'full_untruncated',allPublicTrafficMeasured:true};
    conditions.evidenceFiles={initialization:'initialization.txt',execution:'execution.txt',normalOperation:'normal.txt',authentication:null,measurement:'measurement.json',environment:'environment.txt',reportSelection:'selection.txt'};
    const files={'manifest.json':JSON.stringify({base:workspace}),'openapi.json':JSON.stringify({openapi:'3.1.0',paths:{[workspace+'/search']:{get:{}}}}),'settings.json':JSON.stringify({syntheticParserFixture:true,scan:{checks:['synthetic']}}),'measurement.json':JSON.stringify({workspace,active:false,count:12,activeRequests:0,openRequests:0,pendingHandlers:0}),'initialization.txt':'SYNTHETIC PARSER TEST ONLY: private initialization','execution.txt':'SYNTHETIC PARSER TEST ONLY: completion evidence','normal.txt':'SYNTHETIC PARSER TEST ONLY: normal operation','environment.txt':'SYNTHETIC PARSER TEST ONLY: resources','selection.txt':'SYNTHETIC PARSER TEST ONLY: export selection'};
    for(const [name,value] of Object.entries(files))await writeFile(path.join(dir,name),value);
  }
  const report=path.join(dir,'source.xml'),capture=path.join(dir,'conditions.json'),bundle=path.join(dir,'bundle'),review=path.join(dir,'review.json');
  await writeFile(report,xml(body));await writeFile(capture,JSON.stringify(conditions,null,2));const record=await importBurp(report,capture,bundle,review);return {dir,report,capture,bundle,review,record,conditions};
}
const complete=record=>{record.protocol={id:'synthetic-parser-protocol',configurationId:'synthetic-parser-settings',hardwareId:'synthetic-parser-pc',authMode:'anonymous',subject:null};record.eligibility={status:'eligible',evidence:['SYNTHETIC fixture normal operation'],reason:''};record.review={complete:true,reviewer:'synthetic-parser-reviewer',noTargetFindingEvidence:['SYNTHETIC fixture complete output']};for(const finding of record.findings){finding.verdict='detected';finding.evidence=['SYNTHETIC fixture request/response'];finding.reason='Parser pipeline test only';}return record;};
const cli=(...args)=>promisify(execFile)(process.execPath,[fileURLToPath(new URL('../src/evaluation/cli.mjs',import.meta.url)),...args],{maxBuffer:1024*1024});

test('Burp internal DTD, base64 binary evidence, large IDs and CDATA remain inert',()=>{
  const parsed=parseBurpXml(xml(),scope);assert.equal(parsed.findings[0].id,'9223372036854775807');assert.equal(parsed.findings[0].name,'Untrusted & fixture');
  assert.equal(parsed.findings[0].details.issueDetail,'<script>alert("untrusted fixture")</script>');assert.deepEqual(parsed.messages[1].bytes,response);assert.equal(parsed.messages[1].sha256,sha256(response));assert.equal(parsed.findings[0].verdict,'pending');
});
test('Multiple issue instances remain separate candidates and exchanges preserve references',()=>{
  const body=issue({id:'1'})+issue({id:'2'}).replace('</requestresponse>','</requestresponse><requestresponse><request base64="true">'+request.toString('base64')+'</request></requestresponse>');
  const parsed=parseBurpXml(xml(body),scope);assert.equal(parsed.findings.length,2);assert.equal(parsed.messages.length,5);assert.equal(parsed.findings[1].sourceEvidence[2].reference,'issue[1]/requestresponse[1]/request');
  assert.throws(()=>parseBurpXml(xml(issue({id:'1'})+issue({id:'1'})),scope),/duplicate/);
  for(const id of ['01','-0','9223372036854775808'])assert.throws(()=>parseBurpXml(xml(issue({id})),scope),/serialNumber/);
});
test('Non-base64 CDATA HTTP is recorded as XML-normalized UTF-8 evidence',()=>{
  const parsed=parseBurpXml(xml(issue({base64:false,resp:Buffer.from('HTTP/1.1 200 OK\r\n\r\n日本語')})),scope);assert.equal(parsed.messages[0].base64,false);assert.match(parsed.messages[1].bytes.toString('utf8'),/日本語/);
});
test('UTF-8 BOM and UTF-16 LE/BE are decoded without losing raw-byte fingerprints',()=>{
  const text=xml(issue(), '<?xml version="1.0" encoding="UTF-16"?>').toString('utf8'),le=Buffer.from(text,'utf16le'),be=Buffer.from(le).swap16();
  const inputs=[Buffer.concat([Buffer.from([255,254]),le]),Buffer.concat([Buffer.from([254,255]),be]),Buffer.concat([Buffer.from([239,187,191]),xml()])];
  for(const bytes of inputs){const parsed=parseBurpXml(bytes,scope);assert.equal(parsed.reportSha256,sha256(bytes));assert.equal(parsed.findings[0].id,'9223372036854775807');}
  assert.notEqual(sha256(inputs[0]),sha256(inputs[1]));
});
test('Malformed bytes, unsupported declarations and XML 1.1 are rejected',()=>{
  assert.throws(()=>parseBurpXml(Buffer.concat([xml(),Buffer.from([255])]),scope),/encoding/);
  assert.throws(()=>parseBurpXml(xml(issue(),'<?xml version="1.0" encoding="ISO-8859-1"?>'),scope),/encoding/);
  assert.throws(()=>parseBurpXml(xml(issue(),'<?xml version="1.1"?>'),scope),/XML 1.0/);
  assert.throws(()=>parseBurpXml(Buffer.from('<issues><issue></issues>'),scope),/Malformed/);
});
test('Entity definitions, external subsets, instructions and namespaces cannot be consumed',()=>{
  for(const doct of ['<!DOCTYPE issues SYSTEM "file:///private">','<!DOCTYPE issues [<!ENTITY x "expanded">]>','<!DOCTYPE issues [<!ENTITY % x SYSTEM "https://fixture.invalid/"> %x;]>','<!DOCTYPE issues [<!NOTATION image SYSTEM "file:///private">]>'])assert.throws(()=>parseBurpXml(xml('', '',doct),scope),/DTD|declarations/);
  assert.throws(()=>parseBurpXml(Buffer.from('<?xml-stylesheet href="https://fixture.invalid/x"?><issues/>'),scope),/instructions/);
  assert.throws(()=>parseBurpXml(Buffer.from('<issues xmlns="urn:x"/>'),scope),/namespaces/);
  assert.throws(()=>parseBurpXml(xml(issue({detail:'x'}).replace('Untrusted &amp; fixture','&unknown;')),scope),/Malformed/);
});
test('Report, depth, node, issue, individual message and total decoded limits fail closed',()=>{
  for(const limit of [{bytes:10},{depth:2},{nodes:3},{issues:0},{messageBytes:10},{decodedBytes:10},{doctypeBytes:10},{messagesPerIssue:0}])assert.throws(()=>parseBurpXml(xml(),scope,limit),/limit/);
  assert.throws(()=>parseBurpXml(xml().toString().replace(request.toString('base64'),'AAAA='),scope),/base64/);
});
test('Issue URL and HTTP request targets must remain in captured origin/workspace',()=>{
  for(const options of [{host:'https://attacker.invalid'},{url:'/control'},{url:workspace+'x/search'},{url:workspace+'/%2e%2e/private'},{url:workspace+'/%252fprivate'},{req:Buffer.from('GET /control HTTP/1.1\r\nHost: fixture.invalid:8443\r\n\r\n')},{req:Buffer.from('GET https://attacker.invalid/private HTTP/1.1\r\nHost: fixture.invalid:8443\r\n\r\n')}])assert.throws(()=>parseBurpXml(xml(issue(options)),scope),/scope|workspace|origin|path/);
});
test('Diagnostic Host mutations are preserved as evidence rather than mistaken for connection scope',()=>{
  for(const headers of ['Host: attacker.invalid\r\n','Host: fixture.invalid:8443\r\nHost: attacker.invalid\r\n']){const req=Buffer.from(`GET ${workspace}/search HTTP/1.1\r\n${headers}\r\n`);assert.deepEqual(parseBurpXml(xml(issue({req})),scope).messages[0].bytes,req);}
});
test('DOM issue fragments stay recorded while network scope uses the unchanged pathname',()=>{
  const finding=parseBurpXml(xml(issue({url:workspace+'/search#dom-input'})),scope).findings[0];assert.equal(finding.url,origin+workspace+'/search#dom-input');
});
test('Only public-contract auxiliary origin/exact paths extend scope; audit method mutations remain evidence',()=>{
  const collector='https://fixture.invalid:8444',extraRoutes=[{method:'POST',origin:collector,path:'/collect-events'}],extended={...scope,origins:[origin,collector],extraRoutes};
  const req=Buffer.from('POST /collect-events HTTP/1.1\r\nHost: fixture.invalid:8444\r\nContent-Type: application/json\r\n\r\n{"kind":"synthetic-parser-only"}');
  const body=issue({host:collector,url:'/collect-events',req});const parsed=parseBurpXml(xml(body),extended);assert.equal(parsed.findings[0].url,collector+'/collect-events');assert.equal(parsed.findings[0].method,'POST');assert.deepEqual(parsed.messages[0].bytes,req);
  assert.throws(()=>parseBurpXml(xml(body),{...extended,extraRoutes:[]}),/workspace/);
  assert.throws(()=>parseBurpXml(xml(body),scope),/origin/);
  for(const url of ['/collect-events-other',workspace+'/search','/control'])assert.throws(()=>parseBurpXml(xml(issue({host:collector,url,req})),extended),/workspace/);
  let mixed=body;
  for(const method of ['OPTIONS','GET','PATCH','HEAD']){
    const mutated=Buffer.from(`${method} /collect-events HTTP/1.1\r\nHost: fixture.invalid:8444\r\n\r\n`),response=Buffer.from('HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n');
    const captured=parseBurpXml(xml(issue({host:collector,url:'/collect-events',req:mutated,resp:response})),extended);assert.equal(captured.findings[0].method,method);assert.equal(captured.messages[0].method,method);assert.deepEqual(captured.messages[0].bytes,mutated);assert.deepEqual(captured.messages[1].bytes,response);
    mixed=mixed.replace('</issue>',`<requestresponse><request base64="true">${mutated.toString('base64')}</request><response base64="true">${response.toString('base64')}</response></requestresponse></issue>`);
  }
  const multiple=parseBurpXml(xml(mixed),extended);assert.equal(multiple.findings[0].method,'POST');assert.deepEqual(multiple.messages.filter(entry=>entry.kind==='request').map(entry=>entry.method),['POST','OPTIONS','GET','PATCH','HEAD']);assert.equal(multiple.findings[0].sourceEvidence[2].reference,'issue[0]/requestresponse[1]/request');
});
test('Auxiliary declarations cannot authorize control, duplicate, malformed or traversal routes',()=>{
  for(const route of [{method:'POST',origin:'http://fixture.invalid:8099',path:'/collect-events'},{method:'POST',origin, path:'/oracle'},{method:'POST',origin,path:'/measurement/stop'},{method:'POST',origin,path:'/a/../collect-events'},{method:'POST',origin,path:'//outside.invalid/'},{method:'POST',origin,path:'/collect-events?x=y'},{method:'CONNECT',origin,path:'/collect-events'}])assert.throws(()=>parseBurpXml(xml(),{...scope,extraRoutes:[route]}),/auxiliary|control|Private/);
  assert.throws(()=>parseBurpXml(xml(),{...scope,extraRoutes:[{method:'POST',origin,path:'/collect-events'},{method:'POST',origin,path:'/collect-events'}]}),/Duplicate/);
});
test('Missing or duplicate scalar fields and HTML input are not silently interpreted as issues',()=>{
  assert.throws(()=>parseBurpXml(xml(issue().replace('<type>12345</type>','')),scope),/Missing/);
  assert.throws(()=>parseBurpXml(xml(issue().replace('<type>12345</type>','<type>1</type><type>2</type>')),scope),/Duplicate/);
  assert.throws(()=>parseBurpXml(Buffer.from('<html><body>report</body></html>'),scope),/issues/);
});
test('Unknown XML conditions stay excluded; XML version and issue count cannot fill them',async t=>{
  const f=await fixture(t);assert.equal(f.record.run.version,'');assert.equal(f.record.run.status,'unknown');assert.equal(f.record.run.budgets.wallSeconds,null);assert.equal(f.record.run.inputFingerprints.publicManifestSha256,undefined);assert.equal(classify(f.record).outcome,'conditions_pending');
  assert.equal(f.record.source.exportedVersion,'synthetic-parser-fixture');assert.equal(f.record.review.complete,false);assert.equal(f.record.findings[0].verdict,'pending');
  const claimed=structuredClone(f.record);claimed.run.status='completed';claimed.run.trafficSettled=true;assert.equal(classify(claimed).outcome,'conditions_pending');
  assert.throws(()=>validate(complete(structuredClone(f.record))),/verified operator/);
  assert.equal(summarize([f.record]).groups[0].excluded.conditions_pending,1);
});
test('Raw XML, conditions and binary HTTP copies are preserved exactly and verified',async t=>{
  const f=await fixture(t);assert.deepEqual(await readFile(path.join(f.bundle,'report.xml')),await readFile(f.report));assert.deepEqual(await readFile(path.join(f.bundle,'operator-conditions.json')),await readFile(f.capture));assert.deepEqual(await readFile(path.join(f.bundle,'http','1.bin')),response);await verified(f.review);
});
test('Verified synthetic capture remains unreviewed until observed-operation and human review',async t=>{
  const f=await fixture(t,{confirmed:true});assert.equal(classify(f.record).outcome,'reachability_pending');f.record.eligibility={status:'eligible',evidence:['SYNTHETIC normal evidence'],reason:''};assert.equal(classify(f.record).outcome,'unreviewed');
  complete(f.record);assert.equal(classify(f.record).outcome,'TP');await verifyBurpSources(f.record,f.review);
});
test('Authenticated synthetic captures require preserved identity/normal-operation attestations',async t=>{
  const f=await fixture(t,{confirmed:true});f.conditions.auth={configuredAuthentication:'session',subject:'alice',identityVerified:true,protectedOperationVerified:true};f.conditions.evidenceFiles.authentication='authentication.txt';await writeFile(path.join(f.dir,'authentication.txt'),'SYNTHETIC PARSER TEST ONLY: alice identity and protected operation');await writeFile(f.capture,JSON.stringify(f.conditions));
  const record=await importBurp(f.report,f.capture,path.join(f.dir,'session-bundle'),path.join(f.dir,'session-review.json'));complete(record);record.protocol.authMode='session';record.protocol.subject='alice';assert.equal(classify(record).outcome,'TP');await verifyBurpSources(record,path.join(f.dir,'session-review.json'));
  record.protocol.subject='bob';assert.throws(()=>validate(record),/subject differs/);
});
test('Synthetic stopped, failed, unsettled and error captures stay excluded from case rates',async t=>{
  const f=await fixture(t,{confirmed:true});
  for(const [status,settled,errorCount,outcome] of [['budget_stopped',true,0,'incomplete'],['failed',true,1,'incomplete'],['incomplete_drain',false,0,'incomplete'],['completed',true,1,'invalid_run']]){
    const c=structuredClone(f.conditions);c.status=status;c.traffic.settled=settled;c.errorCount=errorCount;await writeFile(f.capture,JSON.stringify(c));const record=await importBurp(f.report,f.capture,path.join(f.dir,status+'-bundle'),path.join(f.dir,status+'-review.json'));complete(record);assert.equal(classify(record).outcome,outcome);assert.deepEqual(summarize([record]).groups[0].counts,{TP:0,FN:0,FP:0,TN:0});
  }
});
test('Verified operator tool version is checked against XML without being inferred from it',async t=>{
  const f=await fixture(t,{confirmed:true});f.conditions.toolVersion='different-synthetic-version';await writeFile(f.capture,JSON.stringify(f.conditions));await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'wrong-version'),path.join(f.dir,'wrong-version.json')),/version contradicts/);
});
test('Multiple synthetic candidates collapse to one reviewed cell; duplicates stay rejected',async t=>{
  const f=await fixture(t,{confirmed:true,body:issue({id:'1'})+issue({id:'2'})});complete(f.record);assert.equal(summarize([f.record]).groups[0].counts.TP,1);assert.throws(()=>summarize([f.record,structuredClone(f.record)]),/Duplicate/);
});
test('Verified capture cannot lack settings, budgets, selection, identity or measurement',async t=>{
  const f=await fixture(t,{confirmed:true});
  for(const change of [v=>v.settingsFile=null,v=>v.budgets.wallSeconds=null,v=>v.capture.reportSelection='unverified',v=>{v.auth.configuredAuthentication='session';v.auth.subject='alice';},v=>v.traffic.settled=false]){const c=structuredClone(f.conditions);change(c);assert.throws(()=>validateConditions(c),/Verified|Completed/);}
  const bad=JSON.parse(await readFile(path.join(f.dir,'measurement.json'),'utf8'));bad.pendingHandlers=1;await writeFile(path.join(f.dir,'measurement.json'),JSON.stringify(bad));await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'bad-bundle'),path.join(f.dir,'bad-review.json')),/pending counters/);
});
test('Verified report requires nonempty request/response envelopes for every issue instance',async t=>{
  for(const body of [issue().replace(/<requestresponse>[\s\S]*<\/requestresponse>/,''),issue({req:Buffer.alloc(0)}),issue({resp:Buffer.alloc(0)}),issue({resp:Buffer.from('HTTP/1.1 200 OK\r\ntruncated header')}),issue({id:'1'})+issue({id:'2'}).replace(/<requestresponse>[\s\S]*<\/requestresponse>/,'')]){
    const f=await fixture(t,{confirmed:true});await writeFile(f.report,xml(body));await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'incomplete'),path.join(f.dir,'incomplete.json')),/incomplete HTTP evidence/);
  }
});
test('Verified evidence files cannot be empty, and all-public-traffic coverage requires attestation',async t=>{
  const f=await fixture(t,{confirmed:true});await writeFile(path.join(f.dir,'execution.txt'),'');await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'empty-evidence'),path.join(f.dir,'empty-evidence.json')),/empty preserved evidence/);
  const capture=structuredClone(f.conditions);capture.capture.allPublicTrafficMeasured=false;assert.throws(()=>validateConditions(capture),/public traffic/);
});
test('Required public target origins cannot be omitted from a verified capture',async t=>{
  const f=await fixture(t,{confirmed:true});await writeFile(path.join(f.dir,'manifest.json'),JSON.stringify({base:workspace,requiredTargetOrigins:['http://benchmark.test:8080',origin]}));
  await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'https-only'),path.join(f.dir,'https-only.json')),/required public target origin/);
  f.conditions.scopeOrigins.push('http://benchmark.test:8080');await writeFile(f.capture,JSON.stringify(f.conditions));const record=await importBurp(f.report,f.capture,path.join(f.dir,'both-origins'),path.join(f.dir,'both-origins.json'));assert.equal(record.run.conditionsVerified,true);
});
test('Importer derives auxiliary scope exclusively from the preserved public manifest',async t=>{
  const f=await fixture(t,{confirmed:true}),collector='https://fixture.invalid:8444';f.conditions.scopeOrigins.push(collector);await writeFile(f.capture,JSON.stringify(f.conditions));
  await writeFile(path.join(f.dir,'manifest.json'),JSON.stringify({base:workspace,requiredTargetOrigins:[origin,collector],auxiliaryRequests:[{method:'POST',origin:collector,path:'/collect-events'}]}));
  const req=Buffer.from('POST /collect-events HTTP/1.1\r\nHost: fixture.invalid:8444\r\nContent-Type: application/json\r\n\r\n{"kind":"synthetic-parser-only"}');await writeFile(f.report,xml(issue({host:collector,url:'/collect-events',req})));
  const review=path.join(f.dir,'aux-review.json'),record=await importBurp(f.report,f.capture,path.join(f.dir,'aux-bundle'),review);assert.equal(record.run.conditionsVerified,true);await verifyBurpSources(record,review);
  const mutated=Buffer.from('OPTIONS /collect-events HTTP/1.1\r\nHost: fixture.invalid:8444\r\nOrigin: https://fixture.invalid:8443\r\nAccess-Control-Request-Method: POST\r\n\r\n');await writeFile(f.report,xml(issue({host:collector,url:'/collect-events',req:mutated,resp:Buffer.from('HTTP/1.1 204 No Content\r\n\r\n')})));
  const preflightReview=path.join(f.dir,'preflight-review.json'),preflightRecord=await importBurp(f.report,f.capture,path.join(f.dir,'preflight-bundle'),preflightReview);assert.equal(preflightRecord.findings[0].method,'OPTIONS');assert.equal(preflightRecord.eligibility.status,'pending');assert.equal(preflightRecord.review.complete,false);assert.equal(classify(preflightRecord).outcome,'reachability_pending');await verifyBurpSources(preflightRecord,preflightReview);
  await writeFile(path.join(f.dir,'manifest.json'),JSON.stringify({base:workspace,requiredTargetOrigins:[origin,collector]}));await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'undeclared-bundle'),path.join(f.dir,'undeclared-review.json')),/workspace/);
});
test('Captured manifest/OpenAPI affinity and local source path limits are enforced',async t=>{
  const f=await fixture(t,{confirmed:true});await writeFile(path.join(f.dir,'manifest.json'),JSON.stringify({base:'/w/other'}));await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'other-bundle'),path.join(f.dir,'other-review.json')),/different workspace/);
  await writeFile(path.join(f.dir,'manifest.json'),JSON.stringify({base:workspace}));await writeFile(path.join(f.dir,'openapi.json'),JSON.stringify({paths:{'/control':{}}}));await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'scope-bundle'),path.join(f.dir,'scope-review.json')),/outside the workspace/);
  const c=structuredClone(f.conditions);c.settingsFile='../private.json';await writeFile(f.capture,JSON.stringify(c));await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'escape'),path.join(f.dir,'escape.json')),/inside the conditions/);
});
test('validate CLI re-reads and rejects edited source XML and operator conditions',async t=>{
  const f=await fixture(t);const raw=await readFile(path.join(f.bundle,'report.xml'));await writeFile(path.join(f.bundle,'report.xml'),Buffer.concat([raw,Buffer.from(' ')]));await assert.rejects(verified(f.review),/fingerprint/);await writeFile(path.join(f.bundle,'report.xml'),raw);
  const conditions=await readFile(path.join(f.bundle,'operator-conditions.json'));await writeFile(path.join(f.bundle,'operator-conditions.json'),Buffer.concat([conditions,Buffer.from(' ')]));await assert.rejects(main(['validate',f.review]),/fingerprint/);
});
test('Review edits cannot change source metadata, conditions, case labels, findings or evidence references',async t=>{
  const f=await fixture(t,{confirmed:true});
  for(const change of [v=>v.run.status='budget_stopped',v=>v.run.budgets.requestedHttpRequests++,v=>v.run.auth.subject='mallory',v=>v.case.arm='N',v=>v.findings[0].name='Changed',v=>v.findings[0].sourceEvidence[0].sha256='0'.repeat(64),v=>v.findings.push({...v.findings[0],id:'2'}),v=>v.source.exportedVersion='Changed']){const c=structuredClone(f.record);change(c);await assert.rejects(verifyBurpSources(c,f.review),/differ|added|metadata/);}
});
test('Preserved settings, measurement and extracted HTTP tampering are detected',async t=>{
  for(const name of ['captures/2.bin','captures/5.bin','http/0.bin']){const f=await fixture(t,{confirmed:true});const target=path.join(f.bundle,name);await writeFile(target,Buffer.from('tampered'));await assert.rejects(verified(f.review),/fingerprint/);}
});
test('Removing Burp source bundle metadata cannot bypass CLI verification',async t=>{
  const f=await fixture(t);delete f.record.source.artifactDirectory;await writeFile(f.review,JSON.stringify(f.record));await assert.rejects(verified(f.review),/original Burp import bundle/);
});
test('An existing output/bundle is refused without changing original artifacts',async t=>{
  const f=await fixture(t);const before=await readFile(f.review);await assert.rejects(importBurp(f.report,f.capture,path.join(f.dir,'unused'),f.review),/already exists/);assert.deepEqual(await readFile(f.review),before);
  await assert.rejects(importBurp(f.report,f.capture,f.bundle,path.join(f.dir,'new.json')),error=>error.code==='EEXIST');
});
test('Empty XML reports remain condition-pending unless separately captured and reviewed',async t=>{
  const f=await fixture(t,{body:''});assert.equal(f.record.findings.length,0);assert.equal(classify(f.record).outcome,'conditions_pending');
  const verifiedFixture=await fixture(t,{confirmed:true,body:''});complete(verifiedFixture.record);assert.equal(classify(verifiedFixture.record).outcome,'FN');verifiedFixture.record.review.noTargetFindingEvidence=[];assert.throws(()=>validate(verifiedFixture.record),/negative decision/);
});
test('Actual offline CLI captures/imports/validates/summarizes and detects source edits without echoing HTTP',async t=>{
  const dir=await area(t),capture=path.join(dir,'capture.json'),report=path.join(dir,'report.xml'),review=path.join(dir,'review.json'),bundle=path.join(dir,'bundle'),summary=path.join(dir,'summary.json');
  await cli('capture-burp','R0001','V','parser-only','1',capture);const conditions=JSON.parse(await readFile(capture,'utf8'));conditions.scopeOrigins=[origin];await writeFile(capture,JSON.stringify(conditions));
  const secret='synthetic-cookie-do-not-echo',req=Buffer.from(`GET ${workspace}/search HTTP/1.1\r\nHost: fixture.invalid:8443\r\nCookie: sid=${secret}\r\n\r\n`);await writeFile(report,xml(issue({req})));
  const imported=await cli('import-burp',report,capture,bundle,review);assert.ok(!imported.stdout.includes(secret));assert.equal(JSON.parse((await cli('validate',review)).stdout).outcome,'conditions_pending');
  await cli('summarize',summary,review);const scores=JSON.parse(await readFile(summary,'utf8'));assert.deepEqual(scores.groups[0].counts,{TP:0,FN:0,FP:0,TN:0});assert.equal(scores.groups[0].excluded.conditions_pending,1);
  await assert.rejects(cli('import-burp',report,capture,bundle,review),error=>error.code===1&&!error.stderr.includes(secret));await writeFile(path.join(bundle,'report.xml'),xml(issue({id:'2',req})));
  await assert.rejects(cli('validate',review),error=>error.code===1&&/fingerprint/.test(error.stderr)&&!error.stderr.includes(secret));await assert.rejects(cli('summarize',path.join(dir,'invalid-summary.json'),review),error=>error.code===1&&/fingerprint/.test(error.stderr));
});
