import {createHash} from 'node:crypto';
import {cases} from '../catalog.mjs';
import {configurationFingerprint,CONFIGURATION_NORMALIZATION} from '../runner/configuration.mjs';

export const SCHEMA='benchmark-review-0.2';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const signature=value=>JSON.stringify(canonical(value));
const digest=value=>createHash('sha256').update(signature(value)).digest('hex');
const requireValue=(condition,message)=>{if(!condition)throw new Error(message);};
const evidence=value=>Array.isArray(value)&&value.length>0&&value.every(item=>typeof item==='string'&&item.trim().length>0);
const expectedWorkspace=spec=>'/w/'+createHash('sha256').update(spec.seed+spec.root).digest('hex').slice(0,12);
const authentication=run=>({none:'anonymous',anonymous:'anonymous',session:'session',bearer:'bearer'}[run.auth?.configuredAuthentication]);

export function template(run,alerts,{root,arm,seed,replicate=1},settingsSnapshot=null){
  const item=cases.find(entry=>entry.root===root);requireValue(item,'Unknown implemented root');
  requireValue(['V','F','N'].includes(arm),'Arm must be V, F or N');
  requireValue(typeof seed==='string'&&seed.trim(),'A seed is required');
  requireValue(Number.isSafeInteger(replicate)&&replicate>0,'Replicate must be a positive integer');
  requireValue(run.tool==='ZAP'&&typeof run.runId==='string','Expected a ZAP runner record');
  const workspace=run.measurement?.workspace||run.workspace||null;
  requireValue(workspace===expectedWorkspace({root,seed})||workspace===null&&['failed','unsupported'].includes(run.status),'Root/seed does not match the measured workspace');
  const settingsHash=settingsSnapshot?createHash('sha256').update(JSON.stringify(settingsSnapshot)).digest('hex'):null;
  if(settingsSnapshot&&run.scannerSettingsSha256)requireValue(settingsHash===run.scannerSettingsSha256,'Settings snapshot differs from the recorded audit fingerprint');
  const configurationHash=settingsSnapshot?configurationFingerprint(settingsSnapshot,workspace):run.scannerConfigurationSha256||null;
  if(settingsSnapshot&&run.scannerConfigurationSha256)requireValue(configurationHash===run.scannerConfigurationSha256&&run.normalizationVersion===CONFIGURATION_NORMALIZATION,'Settings snapshot differs from the recorded comparison fingerprint');
  requireValue(Array.isArray(alerts.alerts),'Expected alerts.json with an alerts array');
  const ids=new Set();
  const findings=alerts.alerts.map((alert,index)=>{
    const id=String(alert.id??index);requireValue(!ids.has(id),'Duplicate source alert ID');ids.add(id);
    return {id,rule:String(alert.alertRef||alert.pluginId||''),name:String(alert.name||alert.alert||''),url:String(alert.url||''),method:String(alert.method||''),parameter:String(alert.param||''),messageId:String(alert.messageId||alert.sourceMessageId||''),risk:String(alert.risk||''),verdict:'pending',evidence:[],reason:''};
  });
  return {schema:SCHEMA,case:{root,variant:item.variant,arm,seed,replicate},source:{runId:run.runId,runSha256:digest(run),alertsSha256:digest(alerts),settingsSha256:settingsSnapshot?digest(settingsSnapshot):null},run:{tool:run.tool,version:run.toolVersion||'',profile:run.profile||'',configurationSha256:configurationHash,configurationNormalization:settingsSnapshot?CONFIGURATION_NORMALIZATION:run.normalizationVersion||null,settingsSnapshotSha256:run.scannerSettingsSha256||settingsHash,workspace,status:run.status,trafficSettled:run.trafficSettled===true,errorCount:Array.isArray(run.errors)?run.errors.length:1,budgets:run.budgets,auth:run.authReachability||{},inputFingerprints:run.inputFingerprints||{},runtime:run.controllerRuntime||{},actualRequests:run.measurement?.count,stopReason:run.stopReason},protocol:{id:null,configurationId:null,hardwareId:null,authMode:null,subject:null},eligibility:{status:'pending',evidence:[],reason:''},review:{complete:false,reviewer:null,noTargetFindingEvidence:[]},findings};
}

export function verifySources(record,run,alerts,settingsSnapshot=null){
  const original=template(run,alerts,{...record.case},settingsSnapshot);
  requireValue(record.source.runId===original.source.runId&&record.source.runSha256===original.source.runSha256&&record.source.alertsSha256===original.source.alertsSha256&&record.source.settingsSha256===original.source.settingsSha256,'Source artifact fingerprint mismatch');
  requireValue(signature(record.run)===signature(original.run),'Recorded execution conditions differ from the original run');
  requireValue(record.findings.length===original.findings.length,'Source findings were added or removed');
  for(let i=0;i<record.findings.length;i++)for(const field of ['id','rule','name','url','method','parameter','messageId','risk'])requireValue(record.findings[i][field]===original.findings[i][field],'Source finding field changed: '+field);
  return record;
}

export function validate(record){
  requireValue(record.schema===SCHEMA,'Unsupported review schema');
  const spec=record.case,item=cases.find(entry=>entry.root===spec?.root);
  requireValue(item&&item.variant===spec.variant,'Unknown root/representative variant pair');
  requireValue(['V','F','N'].includes(spec.arm),'Invalid arm');
  requireValue(typeof spec.seed==='string'&&spec.seed.trim(),'Missing seed');
  requireValue(Number.isSafeInteger(spec.replicate)&&spec.replicate>0,'Invalid replicate');
  const run=record.run;
  requireValue(run&&['ZAP','Burp Suite Professional'].includes(run.tool),'Unsupported tool');
  const burp=run.tool==='Burp Suite Professional',pendingConditions=burp&&run.conditionsVerified!==true;
  if(burp)requireValue(record.source?.format==='benchmark-burp-bundle-0.1'&&typeof run.conditionsVerified==='boolean','Burp review requires an imported source bundle and explicit capture state');
  requireValue(typeof record.source?.runId==='string'&&record.source.runId.trim(),'Missing run ID');
  requireValue(typeof run.version==='string'&&(run.version.trim()||run.status==='failed'||pendingConditions),'Missing tool version');
  requireValue(typeof run.profile==='string'&&run.profile.trim(),'Missing profile');
  requireValue(run.workspace===expectedWorkspace(spec)||run.workspace===null&&['failed','unsupported'].includes(run.status),'Case label does not match the workspace');
  requireValue(['completed','budget_stopped','failed','unsupported','incomplete_drain','starting','running',...(pendingConditions?['unknown']:[])].includes(run.status),'Invalid execution status');
  for(const field of ['wallSeconds','requestedHttpRequests','requestedConcurrency'])requireValue(pendingConditions&&run.budgets?.[field]===null||Number.isSafeInteger(run.budgets?.[field])&&run.budgets[field]>0,'Missing bounded requested budget: '+field);
  requireValue(['pending','eligible','unreachable','unsupported'].includes(record.eligibility?.status),'Invalid eligibility');
  if(record.eligibility.status!=='pending')requireValue(evidence(record.eligibility.evidence),'Eligibility needs observed-operation evidence');
  requireValue(typeof record.review?.complete==='boolean','Missing review completion');
  requireValue(Array.isArray(record.findings),'Missing findings');
  const ids=new Set();
  for(const finding of record.findings){
    requireValue(typeof finding.id==='string'&&!ids.has(finding.id),'Missing or duplicate finding ID');ids.add(finding.id);
    requireValue(['pending','detected','false_positive','unrelated','rejected'].includes(finding.verdict),'Invalid finding verdict');
    if(finding.verdict==='detected')requireValue(spec.arm==='V','Detection verdict requires a vulnerable arm');
    if(finding.verdict==='false_positive')requireValue(spec.arm!=='V','Control false-positive verdict requires F or N');
    if(finding.verdict!=='pending')requireValue(evidence(finding.evidence)&&typeof finding.reason==='string'&&finding.reason.trim(),'Every reviewed finding needs evidence and a reason');
  }
  if(record.review.complete){
    requireValue(!pendingConditions,'Completed Burp review requires verified operator conditions and preserved evidence');
    requireValue(typeof record.review.reviewer==='string'&&record.review.reviewer.trim(),'Completed review needs a reviewer');
    requireValue(record.findings.every(finding=>finding.verdict!=='pending'),'Completed review still has pending findings');
    requireValue(typeof record.protocol?.id==='string'&&record.protocol.id.trim()&&typeof record.protocol.hardwareId==='string'&&record.protocol.hardwareId.trim()&&typeof record.protocol.configurationId==='string'&&record.protocol.configurationId.trim(),'Completed review needs protocol, configuration and hardware IDs');
    requireValue(/^[a-f0-9]{64}$/.test(run.configurationSha256||''),'Completed review needs a comparison configuration fingerprint');
    requireValue(['anonymous','session','bearer'].includes(record.protocol.authMode),'Missing authentication condition');
    requireValue(record.protocol.authMode==='anonymous'?record.protocol.subject===null:typeof record.protocol.subject==='string'&&record.protocol.subject.trim(),'Invalid authentication subject');
    requireValue(authentication(run)===record.protocol.authMode,'Declared authentication differs from the recorded run');
    if(record.protocol.authMode!=='anonymous')requireValue(run.auth.subject===record.protocol.subject,'Declared subject differs from the recorded identity');
    for(const field of ['publicManifestSha256','originalOpenapiSha256'])requireValue(/^[a-f0-9]{64}$/.test(run.inputFingerprints[field]||''),'Completed review needs public input fingerprints');
    if(!record.findings.some(finding=>['detected','false_positive'].includes(finding.verdict)))requireValue(evidence(record.review.noTargetFindingEvidence),'A negative decision needs evidence of the reviewed output');
  }
  return record;
}

export function classify(record){
  validate(record);
  if(record.run.tool==='Burp Suite Professional'&&record.run.conditionsVerified!==true)return {outcome:'conditions_pending',reason:'Operator execution conditions remain unverified'};
  if(record.run.status==='unsupported')return {outcome:'unsupported',reason:'Unsupported scanner/authentication contract'};
  if(record.run.status!=='completed')return {outcome:'incomplete',reason:record.run.status};
  if(!record.run.trafficSettled||record.run.errorCount!==0)return {outcome:'invalid_run',reason:'Errors or unsettled processing'};
  if(record.eligibility.status==='unreachable'||record.eligibility.status==='unsupported')return {outcome:record.eligibility.status,reason:record.eligibility.reason};
  if(record.eligibility.status!=='eligible')return {outcome:'reachability_pending'};
  if(!record.review.complete)return {outcome:'unreviewed'};
  const auth=record.run.auth;
  if(record.protocol.authMode!=='anonymous'&&auth.identityVerified!==true)return {outcome:'auth_unverified'};
  const positive=record.findings.some(finding=>finding.verdict===(record.case.arm==='V'?'detected':'false_positive'));
  return {outcome:record.case.arm==='V'?(positive?'TP':'FN'):(positive?'FP':'TN')};
}

const cellKey=record=>signature([record.case.root,record.case.variant,record.case.arm,record.case.seed,record.case.replicate]);
const seriesKey=record=>signature([record.run.tool,record.run.version,record.run.profile,record.protocol?.configurationId,record.run.configurationSha256,record.protocol?.id,record.protocol?.hardwareId,record.protocol?.authMode,record.protocol?.subject]);
const condition=record=>signature([record.protocol?.id,record.protocol?.hardwareId,record.protocol?.authMode,record.protocol?.subject,record.run.budgets.wallSeconds,record.run.budgets.requestedHttpRequests,record.run.budgets.requestedConcurrency,record.run.inputFingerprints.publicManifestSha256,record.run.inputFingerprints.originalOpenapiSha256]);
export function summarize(records){
  requireValue(Array.isArray(records)&&records.length>0,'At least one review record is required');
  const groups=new Map(),seen=new Set(),conditions=new Map(),runIds=new Set();
  for(const record of records){
    const decision=classify(record),series=seriesKey(record),cell=cellKey(record),key=series+'|'+cell;
    requireValue(!seen.has(key),'Duplicate case/arm/replicate in one tool series');seen.add(key);
    const sourceKey=record.run.tool+'|'+record.source.runId;requireValue(!runIds.has(sourceKey),'One source run cannot score multiple cases');runIds.add(sourceKey);
    // Check matched experimental inputs for the same case/arm/replicate.
    if(record.review.complete&&record.eligibility.status==='eligible'){
      const comparisonKey=signature([record.protocol.id,record.protocol.authMode,record.protocol.subject,cell]);
      const current=condition(record);requireValue(!conditions.has(comparisonKey)||conditions.get(comparisonKey)===current,'Mismatched budgets, hardware or public inputs in compared runs');conditions.set(comparisonKey,current);
    }
    if(!groups.has(series))groups.set(series,{tool:record.run.tool,version:record.run.version,profile:record.run.profile,configurationSha256:record.run.configurationSha256,protocol:record.protocol,counts:{TP:0,FN:0,FP:0,TN:0},excluded:{},controls:{F:{FP:0,TN:0},N:{FP:0,TN:0}},cells:[]});
    const group=groups.get(series),outcome=decision.outcome;
    if(Object.hasOwn(group.counts,outcome)){group.counts[outcome]++;if(record.case.arm!=='V')group.controls[record.case.arm][outcome]++;}
    else group.excluded[outcome]=(group.excluded[outcome]||0)+1;
    group.cells.push({case:record.case,runId:record.source.runId,...decision});
  }
  const ratio=(a,b)=>b?a/b:null;
  for(const group of groups.values()){
    const {TP,FN,FP,TN}=group.counts;group.metrics={caseRecall:ratio(TP,TP+FN),controlFalsePositiveRate:ratio(FP,FP+TN),controlSpecificity:ratio(TN,FP+TN)};
  }
  const panelSets=[...groups.values()].map(group=>new Set(group.cells.filter(cell=>['TP','FN','FP','TN'].includes(cell.outcome)).map(cell=>signature(cell.case))));
  const protocols=[...groups.values()].map(group=>signature([group.protocol?.id,group.protocol?.hardwareId,group.protocol?.authMode,group.protocol?.subject]));
  const matchedScoredPanel=panelSets.length>1&&protocols.every(value=>value===protocols[0])&&panelSets.every(set=>set.size>0&&set.size===panelSets[0].size&&[...set].every(key=>panelSets[0].has(key)));
  return {schema:'benchmark-case-scores-0.2',unit:'representative variant / arm / seed / replicate; findings are collapsed within each cell',matchedScoredPanel,groups:[...groups.values()],limitations:['Explicit operator review is required; no title/CWE/severity matching is used to infer detection.','Budget-stopped, failed, unreachable, unsupported, authentication-unverified, condition-unverified and unreviewed runs are excluded from TP/FN/FP/TN.','Groups may contain different scored panels; check matchedScoredPanel and excluded cells before comparing rates.','Rates describe this selected corpus; no non-inferiority or production-readiness conclusion is computed.','Burp XML supplies candidate issues and HTTP evidence; completion, budgets, authentication, export selection and public inputs require separately preserved operator captures.']};
}
