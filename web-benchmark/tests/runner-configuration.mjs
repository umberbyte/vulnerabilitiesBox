import test from 'node:test';
import assert from 'node:assert/strict';
import {configurationFingerprint,CONFIGURATION_NORMALIZATION} from '../src/runner/configuration.mjs';

const workspaceA='/w/123456abcdef';
const workspaceB='/w/abcdef123456';
function snapshot(workspace=workspaceA) {
  return {
    installedAddons:{installedAddons:[{id:'ascanrules',version:'83.0.0'},{id:'scripts',version:'45.20.0'}]},
    activeScanners:{scanners:[{id:'40018',enabled:true,alertThreshold:'MEDIUM',attackStrength:'MEDIUM'},{id:'40012',enabled:true,alertThreshold:'MEDIUM',attackStrength:'MEDIUM'}]},
    passiveScanners:{scanners:[{id:'10020',enabled:true}]},
    spiderThreads:{ThreadCount:'2'},activeThreads:{ThreadPerHost:'2'},
    authPolicy:{
      configuredAuthentication:'session',subject:'alice',
      headerPolicy:'add only when absent; preserve present diagnostic header values',
      engine:'Graal.js',templateVersion:'benchmark-auth-missing-headers-0.1',
      excludedOperations:['/login','/logout','/signin','/signout','/connect','/callback','/idp/authorize'].map(path=>workspace+path)
    }
  };
}
const fingerprint=value=>configurationFingerprint(value,workspaceA);
function reverseObjectKeys(value) {
  if(Array.isArray(value))return value.map(reverseObjectKeys);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reverseObjectKeys(value[key])]));
  return value;
}

test('Normalization contract is versioned and returns a deterministic SHA256',()=>{
  assert.equal(CONFIGURATION_NORMALIZATION,'workspace-paths-0.1');
  const value=snapshot();const first=fingerprint(value);
  assert.match(first,/^[a-f0-9]{64}$/);
  assert.equal(fingerprint(value),first);
});

test('Identical scanner configuration across root/seed workspaces belongs to one configuration series',()=>{
  assert.equal(configurationFingerprint(snapshot(workspaceA),workspaceA),configurationFingerprint(snapshot(workspaceB),workspaceB));
});

test('Only authentication exclusion ordering is irrelevant, and object keys are deeply canonical',()=>{
  const value=snapshot();const reordered=reverseObjectKeys(value);
  reordered.authPolicy.excludedOperations.reverse();
  assert.equal(fingerprint(reordered),fingerprint(value));
});

test('Changes to rules, versions, authentication, subject or header policy remain distinct configurations',()=>{
  const original=fingerprint(snapshot());
  const changes=[
    value=>{value.activeScanners.scanners[0].enabled=false;},
    value=>{value.activeScanners.scanners[0].alertThreshold='HIGH';},
    value=>{value.activeScanners.scanners[0].attackStrength='HIGH';},
    value=>{value.installedAddons.installedAddons[0].version='84.0.0';},
    value=>{value.passiveScanners.scanners[0].enabled=false;},
    value=>{value.authPolicy.configuredAuthentication='bearer';},
    value=>{value.authPolicy.subject='bob';},
    value=>{value.authPolicy.headerPolicy='overwrite';},
    value=>{value.authPolicy.engine='OtherEngine';},
    value=>{value.authPolicy.templateVersion='benchmark-auth-missing-headers-0.2';},
    value=>{value.authPolicy.excludedOperations.push(workspaceA+'/another-identity-operation');},
    value=>{value.spiderThreads.ThreadCount='3';}
  ];
  for(const change of changes) {
    const modified=snapshot();change(modified);
    assert.notEqual(fingerprint(modified),original);
  }
});

test('Ordering of addon and scanner arrays is preserved rather than globally sorted',()=>{
  for(const change of [
    value=>value.installedAddons.installedAddons.reverse(),
    value=>value.activeScanners.scanners.reverse()
  ]) {
    const modified=snapshot();change(modified);
    assert.notEqual(fingerprint(modified),fingerprint(snapshot()));
  }
});

test('Fingerprinting neither mutates the input nor changes exclusion ordering',()=>{
  const value=snapshot();value.authPolicy.excludedOperations.reverse();
  const original=structuredClone(value);
  fingerprint(value);
  assert.deepEqual(value,original);
});

test('Workspace text outside excludedOperations remains literal',()=>{
  const first=snapshot(workspaceA);
  first.otherConfiguration={literalPath:workspaceA+'/login',literalArray:[workspaceA],message:'path '+workspaceA};
  first.authPolicy.comment='literal '+workspaceA;
  const second=structuredClone(first);
  second.authPolicy.excludedOperations=snapshot(workspaceB).authPolicy.excludedOperations;
  assert.equal(configurationFingerprint(first,workspaceA),configurationFingerprint(second,workspaceB));
  second.otherConfiguration.literalPath=workspaceB+'/login';
  assert.notEqual(configurationFingerprint(first,workspaceA),configurationFingerprint(second,workspaceB));
});

test('Only a leading workspace segment is normalized, leaving later identical text intact',()=>{
  const first=snapshot(workspaceA);
  first.authPolicy.excludedOperations=[workspaceA+'/routes'+workspaceA+'/login'];
  const second=snapshot(workspaceB);
  second.authPolicy.excludedOperations=[workspaceB+'/routes'+workspaceA+'/login'];
  assert.equal(configurationFingerprint(first,workspaceA),configurationFingerprint(second,workspaceB));
  second.authPolicy.excludedOperations=[workspaceB+'/routes'+workspaceB+'/login'];
  assert.notEqual(configurationFingerprint(first,workspaceA),configurationFingerprint(second,workspaceB));
});

test('Exclusions outside the workspace, partial prefix matches and absolute URLs fail closed',()=>{
  for(const path of [
    '/login',workspaceB+'/login',workspaceA+'extra/login',workspaceA+'0/login',
    'https://app:8443'+workspaceA+'/login','http://app:8099/oracle',
    '/prefix'+workspaceA+'/login',' '+workspaceA+'/login'
  ]) {
    const value=snapshot();value.authPolicy.excludedOperations=[path];
    assert.throws(()=>fingerprint(value),'Must reject exclusion '+path);
  }
});

test('Traversal escaping the selected workspace cannot masquerade as a valid exclusion',()=>{
  for(const path of [workspaceA+'/../escape',workspaceA+'/folder/../../escape',workspaceA+'/%2e%2e/escape']) {
    const value=snapshot();value.authPolicy.excludedOperations=[path];
    assert.throws(()=>fingerprint(value),'Must reject traversal '+path);
  }
});

test('Workspace identity must have the exact lowercase hexadecimal segment format',()=>{
  for(const workspace of [undefined,null,123,'','/w/123456abcde','/w/123456abcdef0','/w/123456ABCDEF','/w/123456abcdeg','/w/123456abcdef/','https://app:8443'+workspaceA,workspaceA+'?x=1']) {
    assert.throws(()=>configurationFingerprint(snapshot(),workspace));
  }
});

test('Legacy snapshots without authPolicy are accepted and keep their own configuration semantics',()=>{
  const value=snapshot();delete value.authPolicy;
  const original=structuredClone(value);
  const hash=configurationFingerprint(value,workspaceA);
  assert.match(hash,/^[a-f0-9]{64}$/);
  assert.equal(configurationFingerprint(value,workspaceB),hash);
  assert.equal(configurationFingerprint(reverseObjectKeys(value),workspaceA),hash);
  assert.deepEqual(value,original);
  const modified=structuredClone(value);modified.activeScanners.scanners[0].enabled=false;
  assert.notEqual(configurationFingerprint(modified,workspaceA),hash);
});

test('Selected named-policy identity and actual rule settings stay in the comparison fingerprint',()=>{
  const value=snapshot();value.activeScanPolicy={name:'benchmark-active-low-v1',version:'benchmark-active-low-0.1',attackStrength:'LOW',alertThreshold:'MEDIUM',enabledRules:'all installed active rules; no case-specific selection',configurationVerified:true};
  for(const rule of value.activeScanners.scanners){rule.attackStrength='LOW';rule.enabled='true';}
  const paired=structuredClone(value);paired.authPolicy.excludedOperations=snapshot(workspaceB).authPolicy.excludedOperations;
  assert.equal(configurationFingerprint(value,workspaceA),configurationFingerprint(paired,workspaceB));
  for(const change of [item=>{item.activeScanPolicy.name='other';},item=>{item.activeScanPolicy.version='benchmark-active-low-0.2';},item=>{item.activeScanPolicy.alertThreshold='LOW';},item=>{item.activeScanPolicy.configurationVerified=false;},item=>{item.activeScanners.scanners[0].attackStrength='MEDIUM';}]) {
    const changed=structuredClone(value);change(changed);assert.notEqual(fingerprint(value),fingerprint(changed));
  }
});
