import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {template,classify,summarize,validate,verifySources} from '../src/evaluation/records.mjs';

const fixture=(arm='V',id='run-1')=>{
  const record=template({tool:'ZAP',toolVersion:'fixture',runId:id,profile:'anonymous-active',status:'completed',trafficSettled:true,errors:[],scannerConfigurationSha256:'d'.repeat(64),measurement:{workspace:'/w/'+createHash('sha256').update('testR0001').digest('hex').slice(0,12)},budgets:{wallSeconds:120,requestedHttpRequests:300,requestedConcurrency:2},authReachability:{configuredAuthentication:'none'},inputFingerprints:{publicManifestSha256:'a'.repeat(64),originalOpenapiSha256:'b'.repeat(64)}},{alerts:[{id:'1',name:'Untrusted alert name',pluginId:'100',url:'https://fixture.test/'}]},{root:'R0001',arm,seed:'test',replicate:1});
  return record;
};
const review=(record,verdict='rejected')=>{
  record.protocol={id:'provided-input-v1',configurationId:'fixture-settings',hardwareId:'fixture-pc',authMode:'anonymous',subject:null};
  record.eligibility={status:'eligible',evidence:['message 10: normal input reached'],reason:''};
  record.review={complete:true,reviewer:'fixture-reviewer',noTargetFindingEvidence:['Reviewed all source alerts']};
  record.findings[0].verdict=verdict;record.findings[0].evidence=['message 11 and fixture outcome'];record.findings[0].reason='Reviewed the actual behavior';return record;
};
test('Templates remain unreviewed and cannot infer detection from alert title',()=>{
  const record=fixture();assert.equal(record.findings[0].verdict,'pending');assert.equal(classify(record).outcome,'reachability_pending');
  record.eligibility={status:'eligible',evidence:['normal request'],reason:''};assert.equal(classify(record).outcome,'unreviewed');
});
test('Duplicates collapse within a case; V/F/N yield case-level outcomes',()=>{
  const v=review(fixture('V','v'),'detected');v.findings.push({...v.findings[0],id:'2'});
  const f=review(fixture('F','f'),'false_positive'),n=review(fixture('N','n'));
  const score=summarize([v,f,n]).groups[0];assert.deepEqual(score.counts,{TP:1,FN:0,FP:1,TN:1});
  assert.equal(score.metrics.caseRecall,1);assert.equal(score.metrics.controlFalsePositiveRate,0.5);
});
test('Unreviewed, interrupted, failed and unreachable runs never turn into FN',()=>{
  for(const status of ['budget_stopped','failed','incomplete_drain']){const record=review(fixture());record.run.status=status;assert.equal(classify(record).outcome,'incomplete');}
  const record=review(fixture());record.eligibility.status='unreachable';assert.equal(classify(record).outcome,'unreachable');
  record.eligibility.status='eligible';record.run.trafficSettled=false;assert.equal(classify(record).outcome,'invalid_run');
});
test('Unsupported or startup failures before measurement remain excluded',()=>{
  const source={tool:'ZAP',toolVersion:'fixture',runId:'not-started',profile:'session-active',status:'unsupported',errors:[],budgets:{wallSeconds:30,requestedHttpRequests:100,requestedConcurrency:2}};
  const unsupported=template(source,{alerts:[]},{root:'R0184',arm:'V',seed:'test'});assert.equal(classify(unsupported).outcome,'unsupported');
  source.status='failed';source.toolVersion='';const failed=template(source,{alerts:[]},{root:'R0001',arm:'V',seed:'test'});assert.equal(classify(failed).outcome,'incomplete');
});
test('Review completion requires root consistency, evidence and all decisions',()=>{
  const missing=review(fixture(),'detected');missing.findings[0].evidence=[];assert.throws(()=>validate(missing),/evidence/);
  const pending=review(fixture());pending.findings[0].verdict='pending';assert.throws(()=>validate(pending),/pending/);
  assert.throws(()=>validate(review(fixture('F'),'detected')),/vulnerable arm/);
  const unknown=fixture();unknown.case.root='R9999';assert.throws(()=>validate(unknown),/Unknown/);
});
test('Repeated source run or duplicate case is rejected',()=>{
  const record=review(fixture());assert.throws(()=>summarize([record,structuredClone(record)]),/Duplicate/);
  const another=structuredClone(record);another.case.arm='N';assert.throws(()=>summarize([record,another]),/source run/);
});
test('Compared runs need matching budgets, hardware and public inputs',()=>{
  const a=review(fixture('V','zap'));
  for(const change of ['budget','hardware','schema']){
    const b=structuredClone(a);b.source.runId='burp';b.run.tool='Burp Suite Professional';
    // Synthetic common-record comparison fixture; never an actual Burp result.
    b.source.format='benchmark-burp-bundle-0.1';b.run.conditionsVerified=true;
    if(change==='budget')b.run.budgets.requestedHttpRequests++;
    if(change==='hardware')b.protocol.hardwareId='different';
    if(change==='schema')b.run.inputFingerprints.originalOpenapiSha256='c'.repeat(64);
    assert.throws(()=>summarize([a,b]),/Mismatched/);
  }
});
test('Non-anonymous runs require observed identity verification',()=>{
  const record=review(fixture(),'detected');record.protocol.authMode='session';record.protocol.subject='alice';
  record.run.auth={configuredAuthentication:'session',subject:'alice',identityVerified:false};
  assert.equal(classify(record).outcome,'auth_unverified');record.run.auth.identityVerified=true;assert.equal(classify(record).outcome,'TP');
});
test('Case labels and declared authentication cannot contradict source conditions',()=>{
  const label=fixture();label.case.seed='another';assert.throws(()=>validate(label),/workspace/);
  const auth=review(fixture());auth.protocol.authMode='session';auth.protocol.subject='alice';assert.throws(()=>validate(auth),/authentication differs/);
});
test('Unequal case panels and distinct configurations are kept visible',()=>{
  const v=review(fixture('V','one'),'detected'),n=review(fixture('N','two'));
  n.protocol.configurationId='second-config';const report=summarize([v,n]);assert.equal(report.groups.length,2);assert.equal(report.matchedScoredPanel,false);
});
test('Original run status cannot be edited to turn an interruption into FN',()=>{
  const run={tool:'ZAP',toolVersion:'fixture',runId:'source',profile:'anonymous-active',status:'budget_stopped',trafficSettled:true,errors:[],measurement:{workspace:'/w/'+createHash('sha256').update('testR0001').digest('hex').slice(0,12)}};
  const alerts={alerts:[]};const record=template(run,alerts,{root:'R0001',arm:'V',seed:'test'});
  verifySources(record,run,alerts);record.run.status='completed';assert.throws(()=>verifySources(record,run,alerts),/conditions differ/);
});
test('Different case workspaces share a configuration series while real rule changes do not',()=>{
  const make=(root,seed,runId,version='1')=>{
    const workspace='/w/'+createHash('sha256').update(seed+root).digest('hex').slice(0,12);
    const snapshot={activeScanners:{scanners:[{id:'fixture',version}]},authPolicy:{configuredAuthentication:'session',subject:'alice',excludedOperations:[workspace+'/login',workspace+'/logout']}};
    const source={tool:'ZAP',toolVersion:'fixture',runId,profile:'session-baseline',status:'completed',trafficSettled:true,errors:[],workspace,budgets:{wallSeconds:120,requestedHttpRequests:300,requestedConcurrency:2},authReachability:{configuredAuthentication:'session',subject:'alice',identityVerified:true},inputFingerprints:{publicManifestSha256:'a'.repeat(64),originalOpenapiSha256:'b'.repeat(64)}};
    const record=review(template(source,{alerts:[{id:'1'}]},{root,arm:'V',seed},snapshot),'detected');
    record.protocol.authMode='session';record.protocol.subject='alice';return record;
  };
  const a=make('R0001','test','first'),b=make('R0005','other','second');
  assert.notEqual(a.run.settingsSnapshotSha256,b.run.settingsSnapshotSha256);
  assert.equal(a.run.configurationSha256,b.run.configurationSha256);
  const result=summarize([a,b]);assert.equal(result.groups.length,1);assert.equal(result.groups[0].counts.TP,2);
  const changed=make('R0021','another','third','2');assert.equal(summarize([a,changed]).groups.length,2);
  const otherHardware=make('R0021','another','fourth');otherHardware.protocol.hardwareId='another-pc';assert.equal(summarize([a,otherHardware]).groups.length,2);
});
test('Settings snapshot changes cannot reuse the original configuration evidence',()=>{
  const workspace='/w/'+createHash('sha256').update('testR0001').digest('hex').slice(0,12);
  const snapshot={activeScanners:{scanners:[{id:'fixture',version:'1'}]},authPolicy:{excludedOperations:[workspace+'/login']}};
  const run={tool:'ZAP',toolVersion:'fixture',runId:'settings',profile:'session-baseline',status:'completed',workspace,scannerSettingsSha256:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')};
  const alerts={alerts:[]},record=template(run,alerts,{root:'R0001',arm:'V',seed:'test'},snapshot);
  verifySources(record,run,alerts,snapshot);
  const changed=structuredClone(snapshot);changed.activeScanners.scanners[0].version='2';
  assert.throws(()=>verifySources(record,run,alerts,changed),/audit fingerprint/);
  assert.throws(()=>verifySources(record,run,alerts),/fingerprint mismatch/);
  const noConfig=review(fixture());noConfig.run.configurationSha256=null;assert.throws(()=>validate(noConfig),/configuration fingerprint/);
});
