import {readFile,writeFile,mkdir,lstat,realpath,open} from 'node:fs/promises';
import path from 'node:path';
import {cases} from '../catalog.mjs';
import {SCHEMA} from './records.mjs';
import {parseBurpXml,sha256,XML_LIMITS,auxiliaryRoutes} from './burp-xml.mjs';

export const BURP_CONDITIONS='benchmark-burp-conditions-0.1';
export const BURP_BUNDLE='benchmark-burp-bundle-0.1';
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const signature=value=>JSON.stringify(canonical(value));
const jsonFingerprint=value=>sha256(JSON.stringify(value));
const expectedWorkspace=spec=>'/w/'+sha256(spec.seed+spec.root).slice(0,12);
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
function jsonBytes(bytes,label){
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('Invalid '+label+' JSON');}
  let nodes=0;const visit=(item,depth)=>{check(++nodes<=100000&&depth<=40,'JSON structural limit exceeded');if(item&&typeof item==='object')for(const key of Object.keys(item)){check(!['__proto__','prototype','constructor'].includes(key),'Unsafe JSON key');visit(item[key],depth+1);}};visit(value,0);return value;
}
export function conditionsTemplate({root,arm,seed,replicate=1}){
  const item=cases.find(entry=>entry.root===root);check(item,'Unknown implemented root');check(['V','F','N'].includes(arm),'Invalid arm');check(nonempty(seed)&&seed.length<=256,'Invalid seed');check(Number.isSafeInteger(replicate)&&replicate>0&&replicate<=1000,'Invalid replicate');
  const spec={root,variant:item.variant,arm,seed,replicate};
  return {schema:BURP_CONDITIONS,case:spec,runId:null,workspace:expectedWorkspace(spec),scopeOrigins:[],toolVersion:null,profile:null,status:'unknown',budgets:{wallSeconds:null,requestedHttpRequests:null,requestedConcurrency:null},auth:{configuredAuthentication:'unknown',subject:null,identityVerified:false,protectedOperationVerified:false},errorCount:null,traffic:{settled:false,actualRequests:null},inputFiles:{publicManifest:null,originalOpenapi:null},settingsFile:null,evidenceFiles:{initialization:null,execution:null,normalOperation:null,authentication:null,measurement:null,environment:null,reportSelection:null},capture:{verified:false,operator:null,startedAt:null,finishedAt:null,reportSelection:'unverified',httpMessages:'unverified',allPublicTrafficMeasured:false},notes:'Operator-only capture. Populate from this run, never from the XML issue count or titles. Unknown conditions remain unverified.'};
}

export function validateConditions(value){
  check(value?.schema===BURP_CONDITIONS,'Unsupported Burp conditions schema');
  const spec=value.case,item=cases.find(entry=>entry.root===spec?.root);check(item&&item.variant===spec.variant,'Unknown root/representative variant pair');
  check(['V','F','N'].includes(spec.arm)&&nonempty(spec.seed)&&spec.seed.length<=256&&Number.isSafeInteger(spec.replicate)&&spec.replicate>0&&spec.replicate<=1000,'Invalid Burp case conditions');
  check(value.workspace===expectedWorkspace(spec),'Burp root/seed does not match captured workspace');
  check(Array.isArray(value.scopeOrigins)&&value.scopeOrigins.length>0&&value.scopeOrigins.length<=4,'Capture one to four explicit target origins');
  const origins=new Set();for(const origin of value.scopeOrigins){let url;try{url=new URL(origin);}catch{throw new Error('Invalid captured target origin');}check(['http:','https:'].includes(url.protocol)&&url.origin===origin&&!url.username&&!url.password&&url.port!=='8099','Captured origins must be canonical public HTTP(S) origins');check(!origins.has(origin),'Duplicate captured target origin');origins.add(origin);}
  check(value.runId===null||nonempty(value.runId)&&value.runId.length<=128,'Invalid captured run ID');
  check(['unknown','completed','budget_stopped','failed','unsupported','incomplete_drain','starting','running'].includes(value.status),'Invalid captured execution status');
  check(typeof value.capture?.verified==='boolean','Missing explicit condition verification state');
  check(['unknown','none','anonymous','session','bearer'].includes(value.auth?.configuredAuthentication),'Invalid captured authentication mode');
  for(const field of ['identityVerified','protectedOperationVerified'])check(typeof value.auth[field]==='boolean','Invalid captured authentication evidence state');
  check(value.auth.subject===null||nonempty(value.auth.subject),'Invalid captured subject');
  check(typeof value.traffic?.settled==='boolean','Missing captured traffic state');
  for(const field of ['wallSeconds','requestedHttpRequests','requestedConcurrency'])check(value.budgets?.[field]===null||Number.isSafeInteger(value.budgets?.[field])&&value.budgets[field]>0,'Invalid captured requested budget: '+field);
  check(value.errorCount===null||Number.isSafeInteger(value.errorCount)&&value.errorCount>=0,'Invalid captured error count');
  check(value.traffic.actualRequests===null||Number.isSafeInteger(value.traffic.actualRequests)&&value.traffic.actualRequests>=0,'Invalid captured HTTP count');
  check(value.inputFiles&&value.evidenceFiles&&typeof value.inputFiles==='object'&&typeof value.evidenceFiles==='object','Missing capture file references');
  if(value.capture.verified){
    check(nonempty(value.runId)&&nonempty(value.toolVersion)&&nonempty(value.profile)&&nonempty(value.capture.operator),'Verified capture needs operator, run ID, tool version and profile');
    check(value.status!=='unknown','Verified capture cannot have unknown execution status');
    for(const field of ['wallSeconds','requestedHttpRequests','requestedConcurrency'])check(Number.isSafeInteger(value.budgets[field])&&value.budgets[field]>0,'Verified capture needs requested budget: '+field);
    check(value.auth.configuredAuthentication!=='unknown','Verified capture needs authentication conditions');
    if(['none','anonymous'].includes(value.auth.configuredAuthentication))check(value.auth.subject===null,'Anonymous capture cannot declare a subject');
    else check(nonempty(value.auth.subject)&&value.auth.identityVerified&&value.auth.protectedOperationVerified&&nonempty(value.evidenceFiles.authentication),'Verified authenticated capture needs identity and protected-operation evidence');
    for(const field of ['publicManifest','originalOpenapi'])check(nonempty(value.inputFiles[field]),'Verified capture needs original public input: '+field);
    check(nonempty(value.settingsFile),'Verified capture needs scanner settings');
    for(const field of ['initialization','execution','normalOperation','measurement','environment','reportSelection'])check(nonempty(value.evidenceFiles[field]),'Verified capture needs evidence: '+field);
    check(value.capture.reportSelection==='all_issues_for_this_run'&&value.capture.httpMessages==='full_untruncated','Verified capture needs complete export-selection and full-message attestations');
    check(value.capture.allPublicTrafficMeasured===true,'Verified capture needs an explicit attestation that all public traffic was measured');
    const start=Date.parse(value.capture.startedAt),finish=Date.parse(value.capture.finishedAt);check(Number.isFinite(start)&&Number.isFinite(finish)&&finish>=start,'Verified capture needs ordered start/end timestamps');
    check(Number.isSafeInteger(value.errorCount)&&Number.isSafeInteger(value.traffic.actualRequests),'Verified capture needs errors and actual HTTP count');
    if(value.status==='completed')check(value.traffic.settled,'Completed capture needs settled processing');
  }
  return value;
}

async function boundedFile(filename,maximum){
  const stat=await lstat(filename);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=maximum,'Artifact is not a bounded regular file');
  const handle=await open(filename,'r');try{const out=Buffer.alloc(Math.min(stat.size,maximum)+1);let used=0;while(used<out.length){const {bytesRead}=await handle.read(out,used,out.length-used,null);if(!bytesRead)break;used+=bytesRead;}check(used<=maximum,'Artifact byte limit exceeded');return out.subarray(0,used);}finally{await handle.close();}
}
const roles=Object.freeze(['input.publicManifest','input.originalOpenapi','settings','evidence.initialization','evidence.execution','evidence.normalOperation','evidence.authentication','evidence.measurement','evidence.environment','evidence.reportSelection']);
function captureName(conditions,role){const [kind,key]=role.split('.');return kind==='input'?conditions.inputFiles[key]:kind==='evidence'?conditions.evidenceFiles[key]:conditions.settingsFile;}
async function captureFiles(conditions,directory){
  const base=await realpath(directory),result=[];let total=0;
  for(const role of roles){const name=captureName(conditions,role);if(name===null||name===undefined)continue;check(nonempty(name)&&!path.isAbsolute(name)&&!name.split(/[\\/]/).includes('..'),'Capture file paths must remain inside the conditions directory');
    const filename=path.resolve(base,name),resolved=await realpath(filename);check(resolved.startsWith(base+path.sep),'Capture file escapes conditions directory');
    const bytes=await boundedFile(filename,4*1024*1024);total+=bytes.length;check(total<=20*1024*1024,'Total capture file limit exceeded');result.push({role,bytes});
  }
  return result;
}
function validateCaptures(conditions,captures){
  const byRole=new Map(captures.map(entry=>[entry.role,entry.bytes]));
  for(const role of roles)if(nonempty(captureName(conditions,role)))check(byRole.has(role),'Missing preserved capture file: '+role);
  const manifest=byRole.has('input.publicManifest')?jsonBytes(byRole.get('input.publicManifest'),'public manifest'):null;
  const schema=byRole.has('input.originalOpenapi')?jsonBytes(byRole.get('input.originalOpenapi'),'OpenAPI'):null;
  const settings=byRole.has('settings')?jsonBytes(byRole.get('settings'),'scanner settings'):null;
  if(manifest)check(manifest.base===conditions.workspace,'Captured public manifest belongs to a different workspace');
  const extraRoutes=auxiliaryRoutes(manifest?.auxiliaryRequests||[]);
  if(schema)check(schema.paths&&Object.keys(schema.paths).every(key=>key===conditions.workspace||key.startsWith(conditions.workspace+'/')),'Captured OpenAPI contains paths outside the workspace');
  if(conditions.capture.verified){
    for(const entry of captures)check(entry.bytes.length>0,'Verified capture contains an empty preserved evidence file: '+entry.role);
    if(manifest.requiredTargetOrigins!==undefined){
      check(Array.isArray(manifest.requiredTargetOrigins)&&manifest.requiredTargetOrigins.length>0&&manifest.requiredTargetOrigins.length<=4,'Invalid manifest required-target-origin contract');
      for(const origin of manifest.requiredTargetOrigins){let url;try{url=new URL(origin);}catch{throw new Error('Invalid manifest required target origin');}check(url.origin===origin&&['http:','https:'].includes(url.protocol),'Invalid manifest required target origin');check(conditions.scopeOrigins.includes(origin),'Verified capture does not cover a required public target origin');}
    }
    for(const route of extraRoutes)check(conditions.scopeOrigins.includes(route.origin),'Verified capture does not cover a required auxiliary target origin');
    const meter=jsonBytes(byRole.get('evidence.measurement'),'measurement');
    check(meter.workspace===conditions.workspace&&meter.count===conditions.traffic.actualRequests,'Measurement differs from captured workspace/request count');
    if(conditions.traffic.settled)check(meter.active===false&&['activeRequests','openRequests','pendingHandlers'].every(field=>meter[field]===0),'Settled capture needs an inactive measurement with all pending counters zero');
  }
  return {manifest,schema,settings,extraRoutes};
}

function reviewTemplate(report,conditions,captures,bundle){
  const {manifest,schema,settings,extraRoutes}=validateCaptures(conditions,captures),verified=conditions.capture.verified;
  if(verified&&report.exportedVersion)check(report.exportedVersion===conditions.toolVersion,'XML exported version contradicts the operator-captured tool version');
  const byReference=new Map(report.messages.map(entry=>[entry.reference,entry]));
  if(verified)for(const finding of report.findings){
    const matching=finding.sourceEvidence.map(ref=>byReference.get(ref.reference));
    const requests=new Set(matching.filter(entry=>entry.kind==='request'&&entry.byteLength>0&&entry.httpEnvelopePresent).map(entry=>entry.reference.replace(/\/request$/,'')));
    check(matching.some(entry=>entry.kind==='response'&&entry.byteLength>0&&entry.httpEnvelopePresent&&requests.has(entry.reference.replace(/\/response$/,''))),'Verified capture has incomplete HTTP evidence for an issue instance');
  }
  // Exported XML version is informational only: it never fills operator conditions.
  const inputFingerprints={};if(manifest)inputFingerprints.publicManifestSha256=jsonFingerprint(manifest);if(schema)inputFingerprints.originalOpenapiSha256=jsonFingerprint(schema);
  return {schema:SCHEMA,case:{...conditions.case},source:{format:BURP_BUNDLE,runId:conditions.runId||'burp-unverified-'+report.reportSha256.slice(0,24),rawReportSha256:report.reportSha256,conditionsSha256:sha256(bundle.conditionsBytes),bundleManifestSha256:sha256(bundle.manifestBytes),exportedVersion:report.exportedVersion,exportTime:report.exportTime,xmlEncoding:report.encoding},run:{tool:'Burp Suite Professional',version:conditions.toolVersion||'',profile:conditions.profile||'unverified',configurationSha256:settings?sha256(signature(settings)):null,configurationNormalization:'burp-settings-object-keys-0.1',settingsSnapshotSha256:settings?jsonFingerprint(settings):null,workspace:conditions.workspace,status:conditions.status,trafficSettled:conditions.traffic.settled,errorCount:conditions.errorCount,budgets:{...conditions.budgets},auth:{...conditions.auth},inputFingerprints,runtime:{operatorCaptured:true,scopeOrigins:[...conditions.scopeOrigins]},actualRequests:conditions.traffic.actualRequests,stopReason:null,conditionsVerified:verified,conditionCapture:{operator:conditions.capture.operator,startedAt:conditions.capture.startedAt,finishedAt:conditions.capture.finishedAt,reportSelection:conditions.capture.reportSelection,httpMessages:conditions.capture.httpMessages,allPublicTrafficMeasured:conditions.capture.allPublicTrafficMeasured===true,machineChecks:['source fingerprints','case/workspace affinity','declared issue/request URL scope','preserved HTTP envelopes for verified issue instances','final measurement state for verified captures'],operatorAttestations:['execution completion/errors/version/profile','export selection/body truncation','initial arm and seed','authentication and normal-operation reachability','all public traffic measured and requested budget policy'],evidence:bundle.manifest.captures.filter(entry=>entry.role.startsWith('evidence.')).map(entry=>({role:entry.role,path:entry.path,sha256:entry.sha256}))}},protocol:{id:null,configurationId:null,hardwareId:null,authMode:null,subject:null},eligibility:{status:'pending',evidence:[],reason:''},review:{complete:false,reviewer:null,noTargetFindingEvidence:[]},findings:report.findings};
}

export async function importBurp(reportPath,conditionsPath,bundleDirectory,reviewPath){
  const reportBytes=await boundedFile(reportPath,XML_LIMITS.bytes),conditionsBytes=await boundedFile(conditionsPath,256*1024),conditions=validateConditions(jsonBytes(conditionsBytes,'conditions'));
  const captures=await captureFiles(conditions,path.dirname(path.resolve(conditionsPath))),{extraRoutes}=validateCaptures(conditions,captures);
  const parsed=parseBurpXml(reportBytes,{workspace:conditions.workspace,origins:conditions.scopeOrigins,extraRoutes});
  try{await lstat(reviewPath);throw new Error('Review output already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  const manifest={schema:BURP_BUNDLE,rawReport:{path:'report.xml',sha256:sha256(reportBytes)},conditions:{path:'operator-conditions.json',sha256:sha256(conditionsBytes)},captures:captures.map((entry,index)=>({role:entry.role,path:`captures/${index}.bin`,sha256:sha256(entry.bytes),byteLength:entry.bytes.length})),messages:parsed.messages.map((entry,index)=>({reference:entry.reference,path:`http/${index}.bin`,sha256:entry.sha256,byteLength:entry.byteLength,kind:entry.kind,base64:entry.base64}))};
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),record=reviewTemplate(parsed,conditions,captures,{manifest,manifestBytes,conditionsBytes});
  const dir=path.resolve(bundleDirectory);await mkdir(dir,{mode:0o700});
  await mkdir(path.join(dir,'captures'),{mode:0o700});await mkdir(path.join(dir,'http'),{mode:0o700});
  const save=(name,bytes)=>writeFile(path.join(dir,name),bytes,{flag:'wx',mode:0o600});
  await save('report.xml',reportBytes);await save('operator-conditions.json',conditionsBytes);
  for(let i=0;i<captures.length;i++)await save(manifest.captures[i].path,captures[i].bytes);
  for(let i=0;i<parsed.messages.length;i++)await save(manifest.messages[i].path,parsed.messages[i].bytes);
  await save('bundle.json',manifestBytes);record.source.artifactDirectory=path.relative(path.dirname(path.resolve(reviewPath)),dir);
  await writeFile(reviewPath,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});return record;
}

export async function verifyBurpSources(record,reviewPath){
  check(record.source?.format===BURP_BUNDLE&&nonempty(record.source.artifactDirectory),'Missing original Burp import bundle');
  const directory=path.resolve(path.dirname(path.resolve(reviewPath)),record.source.artifactDirectory),base=await realpath(directory);
  const file=async(name,max=4*1024*1024)=>{check(/^(?:report\.xml|operator-conditions\.json|bundle\.json|captures\/\d+\.bin|http\/\d+\.bin)$/.test(name),'Invalid import-bundle path');const filename=path.join(base,name),resolved=await realpath(filename);check(resolved.startsWith(base+path.sep),'Import artifact escapes bundle');return boundedFile(filename,max);};
  const manifestBytes=await file('bundle.json',4*1024*1024);check(sha256(manifestBytes)===record.source.bundleManifestSha256,'Burp bundle manifest fingerprint mismatch');
  const manifest=jsonBytes(manifestBytes,'bundle');check(manifest.schema===BURP_BUNDLE&&manifest.rawReport?.path==='report.xml'&&manifest.conditions?.path==='operator-conditions.json'&&Array.isArray(manifest.captures)&&Array.isArray(manifest.messages),'Invalid Burp bundle');
  check(manifest.captures.length<=roles.length&&manifest.messages.length<=XML_LIMITS.issues*XML_LIMITS.messagesPerIssue*2,'Burp bundle structural limit exceeded');
  const reportBytes=await file('report.xml',XML_LIMITS.bytes),conditionsBytes=await file('operator-conditions.json',256*1024);
  check(sha256(reportBytes)===manifest.rawReport.sha256&&sha256(reportBytes)===record.source.rawReportSha256&&sha256(conditionsBytes)===manifest.conditions.sha256&&sha256(conditionsBytes)===record.source.conditionsSha256,'Burp source artifact fingerprint mismatch');
  const conditions=validateConditions(jsonBytes(conditionsBytes,'conditions'));check(signature(record.case)===signature(conditions.case),'Burp case labels differ from captured conditions');
  const captures=[],captureRoles=new Set();let capturedBytes=0;
  for(const entry of manifest.captures){check(roles.includes(entry.role)&&!captureRoles.has(entry.role),'Invalid/duplicate capture role');captureRoles.add(entry.role);const bytes=await file(entry.path);capturedBytes+=bytes.length;check(capturedBytes<=20*1024*1024,'Total capture file limit exceeded');check(bytes.length===entry.byteLength&&sha256(bytes)===entry.sha256,'Burp captured artifact fingerprint mismatch');captures.push({role:entry.role,bytes});}
  const {extraRoutes}=validateCaptures(conditions,captures);
  const parsed=parseBurpXml(reportBytes,{workspace:conditions.workspace,origins:conditions.scopeOrigins,extraRoutes});
  check(parsed.messages.length===manifest.messages.length,'Burp HTTP evidence count mismatch');
  for(let i=0;i<parsed.messages.length;i++){const original=parsed.messages[i],entry=manifest.messages[i];check(entry.reference===original.reference&&entry.sha256===original.sha256&&entry.byteLength===original.byteLength&&entry.kind===original.kind&&entry.base64===original.base64,'Burp HTTP reference differs from original XML');const bytes=await file(entry.path,XML_LIMITS.messageBytes);check(sha256(bytes)===entry.sha256&&bytes.length===entry.byteLength,'Burp preserved HTTP evidence fingerprint mismatch');}
  const original=reviewTemplate(parsed,conditions,captures,{manifest,manifestBytes,conditionsBytes});
  for(const field of Object.keys(original.source))check(signature(record.source[field])===signature(original.source[field]),'Burp source metadata differs: '+field);
  check(signature(record.run)===signature(original.run),'Burp recorded execution conditions differ from original capture');
  check(Array.isArray(record.findings)&&record.findings.length===original.findings.length,'Burp source findings were added or removed');
  for(let i=0;i<record.findings.length;i++){const immutable=({verdict,evidence,reason,...fields})=>fields;check(signature(immutable(record.findings[i]))===signature(immutable(original.findings[i])),'Burp source finding fields differ from original XML');}
  return record;
}
