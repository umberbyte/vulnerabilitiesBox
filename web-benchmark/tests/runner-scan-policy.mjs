import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanel} from '../src/runner/panel.mjs';
import {configurationFingerprint} from '../src/runner/configuration.mjs';
import {LOW_SCAN_POLICY,LOW_POLICY_VERSION,createLowScanPolicy,validateLowPolicySnapshot,lowPolicyDescription,activeScanParameters,cleanupLowScanPolicy} from '../src/runner/policy.mjs';

const workspace='/w/123456abcdef';
const baseRules=[
  {id:'40018',name:'SQL injection',enabled:'true',attackStrength:'DEFAULT',alertThreshold:'DEFAULT',allDependenciesAvailable:'true',dependencies:[]},
  {id:'40012',name:'Reflected XSS',enabled:'true',attackStrength:'HIGH',alertThreshold:'HIGH',allDependenciesAvailable:'true',dependencies:[]},
  {id:'90001',name:'Optional installed rule',enabled:'false',attackStrength:'DEFAULT',alertThreshold:'OFF',allDependenciesAvailable:'false',dependencies:['90002']}
];
const rejectCode=code=>error=>error.code===code;
const zapError=code=>Object.assign(new Error('Mock ZAP API error.'),{zapCode:code});
function mock(options={}) {
  const calls=[];
  const policies=new Map([['Default Policy',{scanners:structuredClone(baseRules)}]]);
  if(options.collision)policies.set(LOW_SCAN_POLICY,{scanners:structuredClone(baseRules)});
  let orphan=null;
  const state={calls,policies,scans:options.scans||[{id:'0',state:'FINISHED'}]};
  state.api=async(component,kind,name,params={})=>{
    assert.equal(component,'ascan');calls.push({kind,name,params:structuredClone(params)});
    if(options.before)await options.before({kind,name,params,state});
    let result;
    if(kind==='view'&&name==='scanPolicyNames')result={scanPolicyNames:[...policies.keys()]};
    else if(kind==='view'&&name==='scans')result={scans:structuredClone(state.scans)};
    else if(kind==='view'&&name==='scanners') {
      const key=params.scanPolicyName||'Default Policy';
      const policy=policies.get(key)||(key===LOW_SCAN_POLICY?orphan:null);
      if(!policy)throw zapError(options.missingCode||'does_not_exist');
      result=structuredClone(policy);
    }else if(kind==='action'&&name==='addScanPolicy') {
      if(policies.has(params.scanPolicyName))throw zapError('already_exists');
      policies.set(params.scanPolicyName,{scanners:baseRules.map(rule=>({...structuredClone(rule),enabled:'false',attackStrength:'DEFAULT',alertThreshold:'DEFAULT'}))});
      result={Result:'OK'};
    }else if(kind==='action'&&name==='removeScanPolicy') {
      if(options.orphanAfterRemove)orphan=structuredClone(policies.get(params.scanPolicyName));
      policies.delete(params.scanPolicyName);result={Result:'OK'};
    }else if(kind==='action') {
      assert.equal(params.scanPolicyName,LOW_SCAN_POLICY,'Every rule mutation must be explicitly scoped to the owned policy');
      const policy=policies.get(params.scanPolicyName);assert.ok(policy);
      if(name==='enableAllScanners')for(const rule of policy.scanners)rule.enabled='true';
      else {
        const rule=policy.scanners.find(rule=>rule.id===params.id);assert.ok(rule);
        if(name==='setScannerAttackStrength')rule.attackStrength=params.attackStrength;
        else if(name==='setScannerAlertThreshold')rule.alertThreshold=params.alertThreshold;
        else assert.fail('Unexpected action '+name);
      }
      result={Result:'OK'};
    }else assert.fail('Unexpected API '+kind+'/'+name);
    return options.after?await options.after({kind,name,params,state,result}):result;
  };
  return state;
}
const cleanup=(api,policy,extra={})=>cleanupLowScanPolicy(api,policy,{snapshotSaved:true,isTrafficSettled:async()=>true,timeoutMs:0,...extra});
const settings=(scanners,policy)=>({installedAddons:{installedAddons:[{id:'ascanrules',version:'83.0.0'}]},activeScanners:scanners,...(policy?{activeScanPolicy:lowPolicyDescription(policy)}:{})});

test('The fresh named policy enables every installed rule and sets explicit LOW/MEDIUM uniformly',async()=>{
  const m=mock();const before=structuredClone(m.policies.get('Default Policy'));
  let owned;const policy=await createLowScanPolicy(m.api,{onOwned:value=>{owned=value;assert.equal(value.verified,false);}});
  assert.equal(policy,owned);assert.equal(policy.name,LOW_SCAN_POLICY);assert.equal(policy.verified,true);
  assert.deepEqual(policy.installedIds,baseRules.map(rule=>rule.id));
  assert.deepEqual(m.policies.get('Default Policy'),before);
  assert.ok(policy.configuredScanners.scanners.every(rule=>rule.enabled==='true'&&rule.attackStrength==='LOW'&&rule.alertThreshold==='MEDIUM'));
  assert.equal(policy.configuredScanners.scanners[2].allDependenciesAvailable,'false','Dependency availability is evidence, not silently hidden or used for target-specific rule selection');
  for(const name of ['setScannerAttackStrength','setScannerAlertThreshold'])assert.deepEqual(m.calls.filter(call=>call.name===name).map(call=>call.params.id),baseRules.map(rule=>rule.id));
  assert.deepEqual(m.calls.find(call=>call.name==='addScanPolicy').params,{scanPolicyName:LOW_SCAN_POLICY,alertThreshold:'MEDIUM',attackStrength:'LOW'});
  assert.equal(lowPolicyDescription(policy).version,LOW_POLICY_VERSION);
});

test('A pre-existing low policy is never reused, altered or deleted',async()=>{
  const m=mock({collision:true});const before=structuredClone([...m.policies]);let owned=false;
  await assert.rejects(()=>createLowScanPolicy(m.api,{onOwned:()=>{owned=true;}}),rejectCode('low_policy_already_exists'));
  assert.equal(owned,false);assert.deepEqual([...m.policies],before);assert.equal(m.calls.filter(call=>call.kind==='action').length,0);
});

test('An add race/error does not claim ownership of another policy',async()=>{
  const m=mock({before:({name,state})=>{if(name==='addScanPolicy'){state.policies.set(LOW_SCAN_POLICY,{scanners:structuredClone(baseRules)});throw zapError('already_exists');}}});
  let owned=false;
  await assert.rejects(()=>createLowScanPolicy(m.api,{onOwned:()=>{owned=true;}}));
  assert.equal(owned,false);assert.equal(m.calls.some(call=>call.name==='removeScanPolicy'),false);
});

test('Ownership survives a setup failure and only the new policy is removed',async()=>{
  const m=mock({before:({name})=>{if(name==='setScannerAttackStrength')throw new Error('Mock setup failure.');}});let policy;
  await assert.rejects(()=>createLowScanPolicy(m.api,{onOwned:value=>{policy=value;}}));
  assert.equal(policy.owned,true);assert.equal(policy.verified,false);
  const proof=await cleanup(m.api,policy);
  assert.equal(proof.removed,true);assert.equal(proof.defaultScannersUnchanged,true);assert.deepEqual([...m.policies.keys()],['Default Policy']);
});

test('Non-OK or missing acknowledgements fail setup while retaining cleanup ownership',async()=>{
  for(const operation of ['enableAllScanners','setScannerAttackStrength','setScannerAlertThreshold'])for(const reply of [{},null,{Result:'ERROR'}]) {
    const m=mock({after:({name,result})=>name===operation?reply:result});let owned;
    await assert.rejects(()=>createLowScanPolicy(m.api,{onOwned:value=>{owned=value;}}),rejectCode('low_policy_api_unconfirmed'));
    assert.equal(owned.owned,true);assert.equal(owned.verified,false);
  }
});

test('Empty, duplicate and malformed installed scanner inventories fail before any mutation',async()=>{
  for(const scanners of [[],[{id:'1'},{id:'1'}],[{id:'bad'}],[{id:1}],null]) {
    const m=mock({after:({name,params,result})=>name==='scanners'&&!params.scanPolicyName?{scanners}:result});
    await assert.rejects(()=>createLowScanPolicy(m.api),rejectCode('invalid_scanner_inventory'));
    assert.equal(m.calls.some(call=>call.kind==='action'),false);
  }
});

test('Named policy inventories cannot omit, duplicate or add active rules',async()=>{
  for(const change of [rules=>rules.slice(1),rules=>[...rules,rules[0]],rules=>[...rules,{id:'777'}]]) {
    const m=mock({after:({name,params,result})=>name==='scanners'&&params.scanPolicyName?{scanners:change(result.scanners)}:result});let owned;
    await assert.rejects(()=>createLowScanPolicy(m.api,{onOwned:value=>{owned=value;}}));
    assert.equal(owned.verified,false);
  }
});

test('Read-back rejects inherited strengths, weakened thresholds or disabled rules',()=>{
  const valid={scanners:baseRules.map(rule=>({...rule,enabled:'true',attackStrength:'LOW',alertThreshold:'MEDIUM'}))};
  assert.equal(validateLowPolicySnapshot(valid,baseRules.map(rule=>rule.id)),valid);
  for(const change of [rule=>{rule.attackStrength='DEFAULT';},rule=>{rule.attackStrength='MEDIUM';},rule=>{rule.alertThreshold='LOW';},rule=>{rule.alertThreshold='DEFAULT';},rule=>{rule.enabled='false';}]) {
    const modified=structuredClone(valid);change(modified.scanners[0]);
    assert.throws(()=>validateLowPolicySnapshot(modified,baseRules.map(rule=>rule.id)),rejectCode('low_policy_settings_mismatch'));
  }
});

test('Actual active-low scans select the verified named policy and legacy active keeps default selection',async()=>{
  const parameters={url:'https://app:8443'+workspace,recurse:true,inScopeOnly:true,contextId:'1'};
  const before=structuredClone(parameters);const policy=await createLowScanPolicy(mock().api);
  assert.deepEqual(activeScanParameters('active-low',parameters,policy),{...parameters,scanPolicyName:LOW_SCAN_POLICY});
  assert.deepEqual(activeScanParameters('active',parameters),parameters);assert.deepEqual(parameters,before);
  for(const value of [undefined,{name:LOW_SCAN_POLICY,owned:true,verified:false},{name:'other',owned:true,verified:true},{name:LOW_SCAN_POLICY,owned:false,verified:true}])assert.throws(()=>activeScanParameters('active-low',parameters,value),rejectCode('low_policy_not_verified'));
  assert.throws(()=>activeScanParameters('baseline',parameters),rejectCode('invalid_active_profile'));
});

test('Successful cleanup verifies FINISHED, independent public drain, named absence and unchanged defaults',async()=>{
  const m=mock();const policy=await createLowScanPolicy(m.api);let probes=0;
  const proof=await cleanup(m.api,policy,{isTrafficSettled:async()=>{probes++;return true;}});
  assert.equal(probes,1);assert.equal(policy.owned,false);
  assert.deepEqual(proof,{name:LOW_SCAN_POLICY,removed:true,absenceVerified:true,originalPolicyInventoryVerified:true,defaultScannersUnchanged:true,activeScansFinished:true,publicTrafficSettled:true});
  assert.deepEqual([...m.policies.keys()],['Default Policy']);
});

test('Missing or unfinished scan state and undrained public traffic prohibit deletion',async()=>{
  for(const state of [{scans:[{state:'RUNNING'}],traffic:true},{scans:[{}],traffic:true},{scans:[{state:'FINISHED'}],traffic:false}]) {
    const m=mock({scans:state.scans});const policy=await createLowScanPolicy(m.api);
    await assert.rejects(()=>cleanup(m.api,policy,{isTrafficSettled:async()=>state.traffic}),rejectCode('low_policy_cleanup_not_idle'));
    assert.equal(m.calls.some(call=>call.name==='removeScanPolicy'),false);assert.equal(policy.owned,true);
  }
  const m=mock({after:({name,result})=>name==='scans'?{}:result});const policy=await createLowScanPolicy(m.api);
  await assert.rejects(()=>cleanup(m.api,policy),rejectCode('invalid_active_scan_state'));
});

test('Cleanup waits only within its bounded idle window',async()=>{
  const m=mock({scans:[{state:'RUNNING'}]});const policy=await createLowScanPolicy(m.api);let time=0,waits=0;
  await cleanup(m.api,policy,{timeoutMs:500,now:()=>time,pause:async ms=>{time+=ms;waits++;m.scans=[{state:'FINISHED'}];}});
  assert.equal(waits,1);assert.equal(policy.owned,false);
  const stuck=mock({scans:[{state:'RUNNING'}]});const second=await createLowScanPolicy(stuck.api);time=0;waits=0;
  await assert.rejects(()=>cleanup(stuck.api,second,{timeoutMs:500,now:()=>time,pause:async ms=>{time+=ms;waits++;}}),rejectCode('low_policy_cleanup_not_idle'));
  assert.equal(waits,2);assert.equal(stuck.calls.some(call=>call.name==='removeScanPolicy'),false);
});

test('Only an owned policy can be cleaned',async()=>{
  const m=mock();
  for(const policy of [undefined,{name:LOW_SCAN_POLICY,owned:false},{name:'Default Policy',owned:true}])await assert.rejects(()=>cleanup(m.api,policy),rejectCode('low_policy_cleanup_not_owned'));
  assert.equal(m.calls.length,0);
});

test('Deletion is prohibited until the actual selected snapshot has been saved',async()=>{
  const m=mock();const policy=await createLowScanPolicy(m.api);
  await assert.rejects(()=>cleanup(m.api,policy,{snapshotSaved:false}),rejectCode('low_policy_snapshot_not_saved'));
  assert.equal(m.calls.some(call=>call.name==='removeScanPolicy'),false);assert.equal(policy.owned,true);
});

test('A stale policy file readable after nominal deletion is a cleanup failure',async()=>{
  const m=mock({orphanAfterRemove:true});const policy=await createLowScanPolicy(m.api);
  await assert.rejects(()=>cleanup(m.api,policy),rejectCode('low_policy_removal_not_verified'));assert.equal(policy.owned,true);
});

test('An arbitrary API failure is not accepted as proof that the named policy disappeared',async()=>{
  const m=mock({missingCode:'internal_error'});const policy=await createLowScanPolicy(m.api);
  await assert.rejects(()=>cleanup(m.api,policy),error=>error.zapCode==='internal_error');assert.equal(policy.owned,true);
});

test('Default-rule or original-policy inventory changes fail cleanup verification',async()=>{
  for(const change of [state=>{state.policies.get('Default Policy').scanners[0].attackStrength='LOW';},state=>{state.policies.set('Unexpected Policy',{scanners:structuredClone(baseRules)});}]) {
    const m=mock();const policy=await createLowScanPolicy(m.api);change(m);
    await assert.rejects(()=>cleanup(m.api,policy),error=>['default_policy_changed','low_policy_inventory_not_restored'].includes(error.code));assert.equal(policy.owned,true);
  }
});

test('Mixed baseline/active-low V/F/N cells preserve baseline hashes and never leave temporary policies',async()=>{
  const catalog=[{root:'R0101',variant:'B0101'}];
  const panel=createPanel({roots:['R0101'],seeds:['paired'],profiles:['baseline','active-low']},{catalog,createdAt:'2026-10-02T00:00:00.000Z'});
  const m=mock();const fingerprints={baseline:[],low:[]};
  for(const cell of panel.cells) {
    if(cell.condition.profile==='baseline')fingerprints.baseline.push(configurationFingerprint(settings(await m.api('ascan','view','scanners')),cell.expectedWorkspace));
    else {
      const policy=await createLowScanPolicy(m.api);
      fingerprints.low.push(configurationFingerprint(settings(await m.api('ascan','view','scanners',{scanPolicyName:policy.name}),policy),cell.expectedWorkspace));
      await cleanup(m.api,policy);
    }
    assert.deepEqual([...m.policies.keys()],['Default Policy']);
  }
  assert.equal(fingerprints.baseline.length,3);assert.equal(new Set(fingerprints.baseline).size,1);
  assert.equal(fingerprints.low.length,3);assert.equal(new Set(fingerprints.low).size,1);
  assert.notEqual(fingerprints.baseline[0],fingerprints.low[0]);
  assert.equal(m.calls.filter(call=>call.name==='addScanPolicy').length,3);assert.equal(m.calls.filter(call=>call.name==='removeScanPolicy').length,3);
});
