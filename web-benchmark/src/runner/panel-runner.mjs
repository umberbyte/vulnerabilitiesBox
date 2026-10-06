import {createHash,randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,unlink,readdir,realpath,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {cases} from '../catalog.mjs';
import {validatePanel} from './panel.mjs';
import {validateVariantPanel,VARIANT_PANEL_SCHEMA} from './variant-panel.mjs';
import {pendingState} from './drain.mjs';
import {publicScope,TARGET_ORIGIN,COLLECTOR_ORIGIN,COOKIE_HTTPS_ORIGIN,COOKIE_HTTP_ORIGIN} from './policy.mjs';
import {configurationFingerprint,CONFIGURATION_NORMALIZATION} from './configuration.mjs';

export const PANEL_LEDGER_SCHEMA='benchmark-operator-panel-ledger-0.1';
const statuses=['completed','budget_stopped','unsupported','failed','incomplete_drain'];
const continuable=new Set(['completed','budget_stopped','unsupported']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sha=value=>createHash('sha256').update(value).digest('hex');
const semanticSha=value=>sha(JSON.stringify(value));
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class ExecutionError extends Error {
  constructor(code){super(code);this.code=code;}
}
const fail=code=>{throw new ExecutionError(code);};
function meterSummary(value) {
  if(!object(value))fail('measurement_invalid');
  return {id:typeof value.id==='string'?value.id:null,workspace:typeof value.workspace==='string'?value.workspace:null,active:value.active,count:value.count??null,peakActive:value.peakActive??null,pending:pendingState(value)};
}
function idle(value) {
  const summary=meterSummary(value);
  if(summary.active!==false||!summary.pending.settled)fail('measurement_busy_or_unsettled');
  return summary;
}
function reference(result) {
  if(!object(result)||!object(result.run)||!/^zap-[A-Za-z0-9-]+$/.test(result.run.runId)||result.path!=='artifacts/'+result.run.runId+'/run.json'||!digest(result.sha256)||!Number.isSafeInteger(result.exitCode))fail('artifact_reference_invalid');
  return {path:result.path,sha256:result.sha256,runId:result.run.runId,status:result.run.status,exitCode:result.exitCode};
}
export function validateCellResult(cell,result,{manifestSha256}={}) {
  const ref=reference(result),run=result.run,c=cell.condition;
  if(run.schema!=='benchmark-scanner-run-0.2'||run.tool!=='ZAP'||run.phase!=='finished'||!statuses.includes(run.status)||!Number.isFinite(Date.parse(run.finishedAt)))fail('artifact_run_invalid');
  const cookiePair=run.targetOrigin===COOKIE_HTTPS_ORIGIN&&run.targetSurface?.adapter==='browser-cookie-transport'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(COOKIE_HTTPS_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COOKIE_HTTP_ORIGIN)&&
    Array.isArray(run.targetSurface.supportedOrigins)&&run.targetSurface.supportedOrigins.length===2&&
    run.targetSurface.supportedOrigins.includes(COOKIE_HTTPS_ORIGIN)&&run.targetSurface.supportedOrigins.includes(COOKIE_HTTP_ORIGIN);
  const collectorPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-event-collector'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN;
  const libraryPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-library-integrity'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-library.js';
  const resourcePair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-resource-switch'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-resource.js';
  const jsonpPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-jsonp-csp'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-jsonp';
  const externalWindowPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-external-window'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-linked-screen';
  const frameApprovalPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-frame-approval'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-frame';
  const messageBoundaryPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-message-boundary'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-origin-page';
  const formDestinationPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-form-destination'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-collect';
  const profileOriginPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-profile-origin'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&
    Array.isArray(run.targetSurface.observationPaths)&&run.targetSurface.observationPaths.length===2&&
    ['/b2-origin-page','/b2-form'].every(path=>run.targetSurface.observationPaths.includes(path));
  const loginOriginPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-login-origin'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-form';
  const recoveryRefererPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-recovery-referer'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b3-pixel';
  const cssCollectorPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-css-collector'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&
    run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-collect';
  const corsReportPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-cors-report'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&
    run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-origin-page';
  const corsPolicyPair=run.targetOrigin===TARGET_ORIGIN&&run.targetSurface?.adapter==='browser-cors-policy'&&
    Array.isArray(run.targetSurface.requiredOrigins)&&run.targetSurface.requiredOrigins.length===2&&
    run.targetSurface.requiredOrigins.includes(TARGET_ORIGIN)&&run.targetSurface.requiredOrigins.includes(COLLECTOR_ORIGIN)&&
    Array.isArray(run.targetSurface.scanOrigins)&&run.targetSurface.scanOrigins.length===1&&run.targetSurface.scanOrigins[0]===TARGET_ORIGIN&&
    Array.isArray(run.targetSurface.observationOrigins)&&run.targetSurface.observationOrigins.length===1&&
    run.targetSurface.observationOrigins[0]===COLLECTOR_ORIGIN&&run.targetSurface.observationPath==='/b2-origin-page';
  if(run.workspace!==cell.expectedWorkspace||run.targetOrigin!==TARGET_ORIGIN&&!cookiePair)fail('artifact_workspace_mismatch');
  if(run.profile!==c.authMode+'-'+c.profile)fail('artifact_profile_mismatch');
  for(const name of ['wallSeconds','requestedHttpRequests','requestedConcurrency'])if(run.budgets?.[name]!==c[name])fail('artifact_budget_mismatch');
  const auth=run.authReachability;
  if(!object(auth)||auth.configuredAuthentication!==(c.authMode==='anonymous'?'none':c.authMode)||auth.subject!==c.subject)fail('artifact_authentication_mismatch');
  const successful=run.status==='completed'||run.status==='budget_stopped';
  if(successful&&result.exitCode!==0||!successful&&run.status!=='incomplete_drain'&&result.exitCode!==1||run.status==='incomplete_drain'&&![0,1].includes(result.exitCode))fail('artifact_exit_status_mismatch');
  if(successful) {
    if(cookiePair&&(run.targetSurface.verified!==true||!object(run.browserCookieTransport)||!run.browserCookieTransport.httpMessageId))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-event-collector'&&(!collectorPair||run.targetSurface.verified!==true||!object(run.browserEventCollector)||!run.browserEventCollector.messageId||run.browserEventCollector.postStatus!==202||run.browserEventCollector.origin!==COLLECTOR_ORIGIN||run.browserEventCollector.path!=='/collect-events'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.complete===true&&item.savedCount>0)))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-library-integrity'&&(!libraryPair||run.targetSurface.verified!==true||!object(run.browserLibraryIntegrity)||run.browserLibraryIntegrity.normalLibraryLoaded!==true||!run.browserLibraryIntegrity.modifiedResponseMessageId||run.browserLibraryIntegrity.modifiedResponseStatus!==200||run.browserLibraryIntegrity.origin!==COLLECTOR_ORIGIN||run.browserLibraryIntegrity.path!=='/b2-library.js'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.complete===true&&item.savedCount>=2)))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-resource-switch'&&(!resourcePair||run.targetSurface.verified!==true||!object(run.browserResourceSwitch)||run.browserResourceSwitch.normalSameOriginScriptLoaded!==true||typeof run.browserResourceSwitch.foreignScriptExecuted!=='boolean'||run.browserResourceSwitch.origin!==COLLECTOR_ORIGIN||run.browserResourceSwitch.path!=='/b2-resource.js'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.complete===true&&item.savedCount>=(run.browserResourceSwitch.foreignScriptExecuted?1:0))||Boolean(run.browserResourceSwitch.foreignResponseMessageId)!==run.browserResourceSwitch.foreignScriptExecuted))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-jsonp-csp'&&(!jsonpPair||run.targetSurface.verified!==true||!object(run.browserJsonpCsp)||run.browserJsonpCsp.normalNoticeRendered!==true||typeof run.browserJsonpCsp.callbackExecuted!=='boolean'||run.browserJsonpCsp.origin!==COLLECTOR_ORIGIN||run.browserJsonpCsp.path!=='/b2-jsonp'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.complete===true&&item.savedCount>=(run.browserJsonpCsp.callbackExecuted?1:0))||Boolean(run.browserJsonpCsp.diagnosticResponseMessageId)!==run.browserJsonpCsp.callbackExecuted))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-external-window'&&(!externalWindowPair||run.targetSurface.verified!==true||!object(run.browserExternalWindow)||run.browserExternalWindow.popupResponseStatus!==200||!run.browserExternalWindow.popupResponseMessageId||typeof run.browserExternalWindow.openerPresent!=='boolean'||run.browserExternalWindow.parentNavigated!==run.browserExternalWindow.openerPresent||run.browserExternalWindow.origin!==COLLECTOR_ORIGIN||run.browserExternalWindow.path!=='/b2-linked-screen'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.complete===true&&item.savedCount>0)))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-frame-approval'&&(!frameApprovalPair||run.targetSurface.verified!==true||!object(run.browserFrameApproval)||run.browserFrameApproval.frameResponseStatus!==200||!run.browserFrameApproval.frameResponseMessageId||run.browserFrameApproval.normalApprovalStatus!==200||typeof run.browserFrameApproval.frameLoaded!=='boolean'||run.browserFrameApproval.framedApprovalStatus!==(run.browserFrameApproval.frameLoaded?200:null)||run.browserFrameApproval.origin!==COLLECTOR_ORIGIN||run.browserFrameApproval.path!=='/b2-frame'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.complete===true&&item.savedCount>0)))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-message-boundary'&&(!messageBoundaryPair||run.targetSurface.verified!==true||!object(run.browserMessageBoundary)||!['sender-origin','recipient-navigation'].includes(run.browserMessageBoundary.mode)||run.browserMessageBoundary.receiverResponseStatus!==200||!run.browserMessageBoundary.receiverResponseMessageId||run.browserMessageBoundary.normalReportReceived!==true||typeof run.browserMessageBoundary.externalReportReceived!=='boolean'||run.browserMessageBoundary.origin!==COLLECTOR_ORIGIN||run.browserMessageBoundary.path!=='/b2-origin-page'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.complete===true&&item.savedCount>0)))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-form-destination'&&(!formDestinationPair||run.targetSurface.verified!==true||!object(run.browserFormDestination)||run.browserFormDestination.normalTransferStatus!==200||typeof run.browserFormDestination.foreignFormSubmitted!=='boolean'||Boolean(run.browserFormDestination.foreignResponseMessageId)!==run.browserFormDestination.foreignFormSubmitted||run.browserFormDestination.privateFieldMatchedInHistory!==(run.browserFormDestination.foreignFormSubmitted?true:null)||run.browserFormDestination.origin!==COLLECTOR_ORIGIN||run.browserFormDestination.path!=='/b2-collect'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.complete===true&&item.savedCount>=(run.browserFormDestination.foreignFormSubmitted?1:0))))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-profile-origin'&&(!profileOriginPair||run.targetSurface.verified!==true||!object(run.browserProfileOrigin)||run.browserProfileOrigin.normalSaveStatus!==200||run.browserProfileOrigin.navigationStatus!==200||typeof run.browserProfileOrigin.navigationChanged!=='boolean'||![200,403].includes(run.browserProfileOrigin.externalFormStatus)||run.browserProfileOrigin.externalFormChanged!==(run.browserProfileOrigin.externalFormStatus===200)||run.browserProfileOrigin.identityVerified!==true||run.browserProfileOrigin.origin!==COLLECTOR_ORIGIN||!Array.isArray(run.browserProfileOrigin.auxiliaryMessageIds)||run.browserProfileOrigin.auxiliaryMessageIds.length!==2||run.browserProfileOrigin.auxiliaryMessageIds.some(id=>!id)||!['/b2-origin-page','/b2-form'].every(path=>run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.prefix===COLLECTOR_ORIGIN+path&&item.complete===true&&item.savedCount>0))))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-login-origin'&&(!loginOriginPair||run.targetSurface.verified!==true||!object(run.browserLoginOrigin)||run.browserLoginOrigin.normalLoginStatus!==200||run.browserLoginOrigin.normalIdentityVerified!==true||![200,403].includes(run.browserLoginOrigin.foreignFormStatus)||run.browserLoginOrigin.foreignIdentityChanged!==(run.browserLoginOrigin.foreignFormStatus===200)||!run.browserLoginOrigin.foreignResponseMessageId||run.browserLoginOrigin.origin!==COLLECTOR_ORIGIN||run.browserLoginOrigin.path!=='/b2-form'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.prefix===COLLECTOR_ORIGIN+'/b2-form'&&item.complete===true&&item.savedCount>0)))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-recovery-referer'&&(!recoveryRefererPair||run.targetSurface.verified!==true||!object(run.browserRecoveryReferer)||run.browserRecoveryReferer.initiationStatus!==200||run.browserRecoveryReferer.recoveryPageStatus!==200||run.browserRecoveryReferer.completionStatus!==200||typeof run.browserRecoveryReferer.tokenInReferer!=='boolean'||!digest(run.browserRecoveryReferer.tokenSha256)||run.browserRecoveryReferer.pixelHttpArchive?.path!=='browser-recovery-pixel-http.json'||!digest(run.browserRecoveryReferer.pixelHttpArchive?.sha256)||run.browserRecoveryReferer.origin!==COLLECTOR_ORIGIN||run.browserRecoveryReferer.path!=='/b3-pixel'||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.prefix===COLLECTOR_ORIGIN+'/b3-pixel'&&item.complete===true)))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-css-collector'&&(!cssCollectorPair||run.targetSurface.verified!==true||!object(run.browserCssCollector)||run.browserCssCollector.loginStatus!==200||run.browserCssCollector.normalEntryStatus!==200||run.browserCssCollector.normalStyleVerified!==true||run.browserCssCollector.diagnosticStatus!==200||run.browserCssCollector.identityVerified!==true||typeof run.browserCssCollector.imageResponseObserved!=='boolean'||run.browserCssCollector.origin!==COLLECTOR_ORIGIN||run.browserCssCollector.path!=='/b2-collect'||Boolean(run.browserCssCollector.imageHttpArchive)!==run.browserCssCollector.imageResponseObserved||(run.browserCssCollector.imageResponseObserved&&(run.browserCssCollector.imageHttpArchive?.path!=='browser-css-image-http.json'||!digest(run.browserCssCollector.imageHttpArchive?.sha256)))||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.prefix===COLLECTOR_ORIGIN+'/b2-collect'&&item.complete===true)))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-cors-report'&&(!corsReportPair||run.targetSurface.verified!==true||!object(run.browserCorsReport)||run.browserCorsReport.loginStatus!==200||run.browserCorsReport.normalReportStatus!==200||run.browserCorsReport.auxiliaryPageStatus!==200||run.browserCorsReport.identityVerified!==true||!run.browserCorsReport.auxiliaryMessageId||!run.browserCorsReport.preflightMessageId||![204,403].includes(run.browserCorsReport.preflightHttpStatus)||!run.browserCorsReport.crossOriginReportMessageId||run.browserCorsReport.origin!==COLLECTOR_ORIGIN||run.browserCorsReport.path!=='/b2-origin-page'||!['preflight','simple'].every(name=>{const value=run.browserCorsReport[name];return object(value)&&typeof value.readable==='boolean'&&(value.readable?value.status===200&&digest(value.bodySha256):value.status===null&&value.bodySha256===null);})||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.prefix===COLLECTOR_ORIGIN+'/b2-origin-page'&&item.complete===true&&item.savedCount>0)))fail('artifact_target_surface_unverified');
    if(run.targetSurface?.adapter==='browser-cors-policy'&&(!corsPolicyPair||run.targetSurface.verified!==true||!object(run.browserCorsPolicy)||run.browserCorsPolicy.identityVerified!==true||run.browserCorsPolicy.origin!==COLLECTOR_ORIGIN||run.browserCorsPolicy.path!=='/b2-origin-page'||run.browserCorsPolicy.normalPolicyStatus!==200||![200,403].includes(run.browserCorsPolicy.alicePolicyStatus)||run.browserCorsPolicy.adminPolicyStatus!==200||!['alicePolicyMessageId','adminPolicyMessageId','beforeAdminReportMessageId','afterAdminReportMessageId'].every(name=>run.browserCorsPolicy[name])||!Array.isArray(run.browserCorsPolicy.auxiliaryMessageIds)||run.browserCorsPolicy.auxiliaryMessageIds.length!==2||run.browserCorsPolicy.auxiliaryMessageIds.some(value=>!value)||!['beforeAdmin','afterAdmin'].every(name=>{const value=run.browserCorsPolicy[name];return object(value)&&typeof value.readable==='boolean'&&(value.readable?value.status===200&&digest(value.bodySha256):value.status===null&&value.bodySha256===null);})||run.browserCorsPolicy.afterAdmin.readable!==true||!run.secondaryHistoryArchives?.some(item=>item.origin===COLLECTOR_ORIGIN&&item.prefix===COLLECTOR_ORIGIN+'/b2-origin-page'&&item.complete===true&&item.savedCount>=2)))fail('artifact_target_surface_unverified');
    if(run.trafficSettled!==true||run.drainTimedOut!==false||!pendingState(run.pendingAtMeasurementStop||{}).settled||!pendingState(run.drainPendingState||{}).settled)fail('artifact_traffic_unsettled');
    if(!object(run.measurement))fail('artifact_measurement_missing');
    if(c.authMode!=='anonymous'&&(auth.identityVerified!==true||auth.postScanVerified!==true||auth.selfChecks?.presentCookiePreserved!==true))fail('artifact_authentication_unverified');
    if(c.authMode==='bearer'&&(auth.protectedOperationVerified!==true||auth.selfChecks?.presentAuthorizationPreserved!==true))fail('artifact_bearer_unverified');
  }
  if(successful||run.inputFingerprints?.publicManifestSha256!==undefined) {
    if(!digest(manifestSha256)||run.inputFingerprints?.publicManifestSha256!==manifestSha256)fail('artifact_manifest_mismatch');
  }
  if(run.measurement&&continuable.has(run.status)) {
    const measured=idle(run.measurement);
    if(!measured.id||measured.workspace!==cell.expectedWorkspace||!Number.isSafeInteger(measured.count)||measured.count<0||!Number.isSafeInteger(measured.peakActive)||measured.peakActive<0)fail('artifact_measurement_invalid');
  }
  return {...ref,summary:{workspace:run.workspace,profile:run.profile,configuredAuthentication:auth.configuredAuthentication,subject:auth.subject,identityVerified:auth.identityVerified===true,protectedOperationVerified:auth.protectedOperationVerified===true,postScanVerified:auth.postScanVerified===true,requests:run.measurement?.count??null,peakConcurrency:run.measurement?.peakActive??null,trafficSettled:run.trafficSettled===true,pending:run.measurement?pendingState(run.measurement):null,stopReason:run.stopReason??null,scannerSettingsSha256:digest(run.scannerSettingsSha256)?run.scannerSettingsSha256:null,scannerConfigurationSha256:digest(run.scannerConfigurationSha256)?run.scannerConfigurationSha256:null,normalizationVersion:run.normalizationVersion??null,errorCount:Array.isArray(run.errors)?run.errors.length:null}};
}

// All state-changing operations are injected so lifecycle ordering and fail-closed
// behavior can be tested without networking, a scanner, or fixture resets.
export async function executePanel(input,callbacks,{catalog=cases,now=()=>new Date().toISOString(),planReference=null,planSha256=null}={}) {
  const plan=input?.schema===VARIANT_PANEL_SCHEMA?validateVariantPanel(input):validatePanel(input,{catalog});
  for(const name of ['measurement','reset','newSession','scan','persist'])if(typeof callbacks?.[name]!=='function')throw new Error('Missing panel execution callback: '+name);
  const ledger={schema:PANEL_LEDGER_SCHEMA,visibility:'private operator ledger; never supply this JSON to a scanner',plan:{path:planReference,sha256:planSha256,planId:plan.planId},status:'created',startedAt:now(),finishedAt:null,currentCell:null,errors:[],limitations:['Runtime orchestration only; no alert scoring or TP/FP/FN labels are produced.','The Compose target and scanner must be used exclusively by this worker; no atomic cross-client API lease is provided.','Budgets are soft stop thresholds and may overshoot; budget_stopped is distinct from completed.','No restart/resume; retain interrupted ledgers and artifacts and use a new plan/ledger after checking the target.','newSession resets session data, not global add-on versions or scan policies.'],cells:plan.cells.map(cell=>({...structuredClone(cell),phase:'not_run',startedAt:null,finishedAt:null,errors:[]}))};
  // Exclusive creation happens before the first private API call.
  await callbacks.persist(structuredClone(ledger),{initial:true});
  const save=()=>callbacks.persist(structuredClone(ledger),{initial:false});
  let cell;
  try {
    ledger.status='running';await save();
    ledger.initialMeasurement=idle(await callbacks.measurement());await save();
    for(cell of ledger.cells) {
      ledger.currentCell=cell.cellId;cell.status='running';cell.phase='preflight';cell.startedAt=now();await save();
      cell.beforeMeasurement=idle(await callbacks.measurement());
      cell.phase='reset';await save();
      const manifest=await callbacks.reset(structuredClone(cell));
      if(!object(manifest)||manifest.base!==cell.expectedWorkspace)fail('reset_workspace_mismatch');
      try{publicScope(manifest);}catch{fail('reset_manifest_invalid');}
      const manifestSha256=semanticSha(manifest);
      cell.publicManifestSha256=manifestSha256;
      cell.phase='new_session';await save();await callbacks.newSession();
      cell.phase='scan';await save();
      // The child only receives public scan settings, never operator labels.
      const result=await callbacks.scan(structuredClone(cell.condition));
      cell.phase='validate';cell.run=reference(result);await save();
      cell.run=validateCellResult(cell,result,{manifestSha256});
      const after=await callbacks.measurement();cell.afterMeasurement=meterSummary(after);
      if(continuable.has(result.run.status)) {
        idle(after);
        if(result.run.measurement) {
          for(const name of ['id','workspace','count','peakActive'])if(after[name]!==result.run.measurement[name])fail('measurement_artifact_mismatch');
        }
      }
      cell.status=result.run.status;cell.phase='finished';cell.finishedAt=now();
      if(!continuable.has(cell.status))fail('scanner_'+cell.status);
      await save();
    }
    ledger.status='completed';ledger.currentCell=null;ledger.finishedAt=now();await save();
  } catch(error) {
    // Arbitrary child output, HTTP bodies, and exception messages are not copied
    // into metadata, interpreted as instructions, or used as artifact paths.
    const code=error instanceof ExecutionError?error.code:'execution_callback_failed';
    ledger.status='halted';ledger.errors.push({code,...(cell?{cellId:cell.cellId}:{})});ledger.finishedAt=now();
    if(cell){if(!['failed','incomplete_drain'].includes(cell.status))cell.status='failed';cell.errors.push({code});cell.finishedAt=now();}
    await save();
  }
  return ledger;
}

async function insideArtifacts(filename,artifacts,{existing=false}={}) {
  if(typeof filename!=='string'||!filename.trim()||/[\u0000-\u001f\u007f]/.test(filename))fail('operator_path_invalid');
  const resolved=path.resolve(filename),relative=path.relative(artifacts,resolved);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))fail('operator_path_outside_artifacts');
  if(existing) {
    const real=await realpath(resolved),realRelative=path.relative(artifacts,real);
    if(!realRelative||realRelative==='..'||realRelative.startsWith('..'+path.sep)||path.isAbsolute(realRelative))fail('operator_path_outside_artifacts');
    if(!(await lstat(real)).isFile())fail('operator_path_not_file');
    return real;
  }
  await mkdir(path.dirname(resolved),{recursive:true});
  const parent=await realpath(path.dirname(resolved)),parentRelative=path.relative(artifacts,parent);
  if(parentRelative==='..'||parentRelative.startsWith('..'+path.sep)||path.isAbsolute(parentRelative))fail('operator_path_outside_artifacts');
  return path.join(parent,path.basename(resolved));
}
async function limitedJson(filename) {
  const info=await lstat(filename);
  if(!info.isFile()||info.isSymbolicLink()||info.size>32*1024*1024)fail('operator_json_invalid');
  const raw=await readFile(filename);
  let value;try{value=JSON.parse(raw.toString('utf8'));}catch{fail('operator_json_invalid');}
  return {raw,value};
}
async function persistFile(filename,ledger,{initial}) {
  const content=JSON.stringify(ledger,null,2)+'\n';
  if(initial){await writeFile(filename,content,{flag:'wx',mode:0o600});return;}
  const temporary=filename+'.tmp-'+randomBytes(6).toString('hex');
  try{await writeFile(temporary,content,{flag:'wx',mode:0o600});await rename(temporary,filename);}
  finally {try{await unlink(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
}

export async function main(env=process.env) {
  const controlKey=env.BENCHMARK_CONTROL_KEY,apiKey=env.ZAP_API_KEY;
  if(!controlKey||!apiKey||controlKey===apiKey)fail('separate_api_keys_required');
  const control=env.CONTROL_URL||'http://app:8099',zap=env.ZAP_URL||'http://zap:8090';
  if(control!=='http://app:8099'||zap!=='http://zap:8090')fail('unsupported_controller_endpoints');
  const artifacts=await realpath('/opt/benchmark/artifacts');
  const planFile=await insideArtifacts(env.PANEL_PATH,artifacts,{existing:true});
  const ledgerFile=await insideArtifacts(env.PANEL_LEDGER,artifacts);
  if(planFile===ledgerFile)fail('plan_and_ledger_must_differ');
  const {raw,value:plan}=await limitedJson(planFile);
  if(plan?.schema===VARIANT_PANEL_SCHEMA)validateVariantPanel(plan);else validatePanel(plan);
  const customMode=env.SCAN_CUSTOM_MODE||'none';
  if(!['none','custom','custom-only'].includes(customMode))fail('custom_mode_invalid');
  if(customMode==='custom-only'&&plan.cells.some(cell=>cell.condition.profile!=='active'))fail('custom_only_requires_active_profile');
  const ctl=async(endpoint,body)=>{
    const response=await fetch(control+endpoint,{method:body===undefined?'GET':'POST',headers:{'x-benchmark-key':controlKey,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)fail('private_api_failed');
    try{return await response.json();}catch{fail('private_api_invalid');}
  };
  const api=async(component,kind,name,params={},timeout=10000)=>{
    const url=new URL(`/JSON/${component}/${kind}/${name}/`,zap);
    for(const [key,value]of Object.entries(params))url.searchParams.set(key,String(value));
    const response=await fetch(url,{headers:{'X-ZAP-API-Key':apiKey},signal:AbortSignal.timeout(timeout)});
    if(!response.ok)fail('scanner_api_failed');
    let value;try{value=await response.json();}catch{fail('scanner_api_invalid');}
    if(value.code)fail('scanner_api_failed');return value;
  };
  let ready=false,child=null,interrupted=false;
  const cancel=()=>{interrupted=true;if(child)child.kill('SIGKILL');};
  process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
  async function scannerIdle() {
    if(interrupted)fail('worker_interrupted');
    if(!ready) {
      const until=Date.now()+90000;
      while(true) {
        try{await api('core','view','version',{},2000);ready=true;break;}
        catch{if(Date.now()>=until||interrupted)fail('scanner_startup_failed');await sleep(1000);}
      }
    }
    for(const component of ['spider','ascan']) {
      const scans=(await api(component,'view','scans')).scans;
      if(!Array.isArray(scans)||scans.some(scan=>scan.state!=='FINISHED'))fail('scanner_busy');
    }
    const until=Date.now()+10000;let stable=0;
    while(true) {
      const count=Number((await api('pscan','view','recordsToScan')).recordsToScan);
      const tasks=(await api('pscan','view','currentTasks')).currentTasks;
      if(!Number.isSafeInteger(count)||count<0||!Array.isArray(tasks))fail('scanner_passive_state_invalid');
      stable=count===0&&tasks.length===0?stable+1:0;
      if(stable>=3)break;
      if(Date.now()>=until||interrupted)fail('scanner_passive_busy');await sleep(250);
    }
    const scripts=(await api('script','view','listScripts')).listScripts;
    if(!Array.isArray(scripts)||scripts.some(script=>script.name==='benchmark-auth-missing-headers'))fail('scanner_auth_script_residual');
  }
  const inventory=async()=>new Set((await readdir(artifacts,{withFileTypes:true})).filter(entry=>entry.isDirectory()&&/^zap-[A-Za-z0-9-]+$/.test(entry.name)).map(entry=>entry.name));
  async function scan(condition) {
    if(interrupted)fail('worker_interrupted');
    const before=await inventory();
    const childEnv={CONTROL_URL:control,BENCHMARK_CONTROL_KEY:controlKey,ZAP_URL:zap,ZAP_API_KEY:apiKey,ZAP_IMAGE:env.ZAP_IMAGE||'',SCAN_PROFILE:condition.profile,SCAN_AUTH:condition.authMode,SCAN_USER:condition.subject||'alice',SCAN_SECONDS:String(condition.wallSeconds),SCAN_REQUEST_BUDGET:String(condition.requestedHttpRequests),SCAN_CONCURRENCY:String(condition.requestedConcurrency),SCAN_CUSTOM_MODE:env.SCAN_CUSTOM_MODE||'none'};
    const exitCode=await new Promise((resolve,reject)=>{
      child=spawn(process.execPath,['src/runner/scan-zap.mjs'],{cwd:'/opt/benchmark',env:childEnv,stdio:['ignore','ignore','ignore'],windowsHide:true});
      let timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;child?.kill('SIGKILL');},(condition.wallSeconds+180)*1000);
      child.once('error',()=>{clearTimeout(timer);child=null;reject(new ExecutionError('scanner_child_failed'));});
      child.once('close',(code,signal)=>{clearTimeout(timer);child=null;if(interrupted)reject(new ExecutionError('worker_interrupted'));else if(timedOut)reject(new ExecutionError('scanner_child_timeout'));else if(signal||!Number.isSafeInteger(code))reject(new ExecutionError('scanner_child_crashed'));else resolve(code);});
    });
    const added=[...await inventory()].filter(name=>!before.has(name));
    if(added.length!==1)fail('scanner_artifact_ambiguous');
    const filename=await insideArtifacts(path.join(artifacts,added[0],'run.json'),artifacts,{existing:true});
    const {raw,value:run}=await limitedJson(filename);
    if(run.runId!==added[0])fail('scanner_artifact_identity_mismatch');
    if(['completed','budget_stopped'].includes(run.status)) {
      const settingsFile=await insideArtifacts(path.join(artifacts,added[0],'scanner-settings.json'),artifacts,{existing:true});
      const settings=(await limitedJson(settingsFile)).value;
      if(run.scannerSettingsSha256!==semanticSha(settings)||run.normalizationVersion!==CONFIGURATION_NORMALIZATION||run.scannerConfigurationSha256!==configurationFingerprint(settings,run.workspace))fail('scanner_configuration_artifact_mismatch');
      if(run.targetSurface?.adapter==='browser-recovery-referer') {
        const archive=run.browserRecoveryReferer?.pixelHttpArchive;
        if(archive?.path!=='browser-recovery-pixel-http.json'||!digest(archive.sha256))fail('browser_recovery_http_archive_invalid');
        const pixelFile=await insideArtifacts(path.join(artifacts,added[0],archive.path),artifacts,{existing:true});
        const {raw:pixelRaw,value:pixel}=await limitedJson(pixelFile);
        if(sha(pixelRaw)!==archive.sha256||pixel?.request?.method!=='GET'||pixel.request.url!==COLLECTOR_ORIGIN+'/b3-pixel'||pixel.response?.status!==200||!/^image\/svg\+xml\b/i.test(pixel.response.headers?.['content-type']||''))fail('browser_recovery_http_archive_invalid');
        const referer=pixel.request.headers?.referer||'';
        let token=null;try{token=new URL(referer).searchParams.get('token');}catch{}
        if(run.browserRecoveryReferer.tokenInReferer!==Boolean(token&&sha(token)===run.browserRecoveryReferer.tokenSha256))fail('browser_recovery_referer_mismatch');
      }
    }
    if(['completed','budget_stopped'].includes(run.status)&&run.targetSurface?.adapter==='browser-css-collector'&&run.browserCssCollector?.imageResponseObserved) {
      const archive=run.browserCssCollector.imageHttpArchive;
      if(archive?.path!=='browser-css-image-http.json'||!digest(archive.sha256))fail('browser_css_http_archive_invalid');
      const imageFile=await insideArtifacts(path.join(artifacts,added[0],archive.path),artifacts,{existing:true});
      const {raw:imageRaw,value:image}=await limitedJson(imageFile);
      if(sha(imageRaw)!==archive.sha256||image?.request?.method!=='GET'||image.request.url!==COLLECTOR_ORIGIN+'/b2-collect?value=presence'||image.response?.status!==200||!/^image\/svg\+xml\b/i.test(image.response.headers?.['content-type']||''))fail('browser_css_http_archive_invalid');
    }
    return {run,path:'artifacts/'+added[0]+'/run.json',sha256:sha(raw),exitCode};
  }
  try {
    const ledger=await executePanel(plan,{measurement:()=>ctl('/measurement'),reset:async cell=>{await scannerIdle();idle(await ctl('/measurement'));return ctl('/reset',{root:cell.root,mode:cell.arm,seed:cell.seed,...(plan.schema===VARIANT_PANEL_SCHEMA?{variant:cell.variant}:{})});},newSession:async()=>{
      if(interrupted)fail('worker_interrupted');
      await api('core','action','setMode',{mode:'protect'});
      // Name/overwrite are omitted: ZAP creates a new unnamed session without
      // receiving any private case/arm/seed identity.
      await api('core','action','newSession',{},30000);
      await api('core','action','clearExcludedFromProxy');
      await api('ascan','action','clearExcludedFromScan');
      await api('spider','action','clearExcludedFromScan');
      if(Number((await api('core','view','numberOfMessages')).numberOfMessages)!==0)fail('scanner_session_not_empty');
    },scan,persist:(ledger,options)=>persistFile(ledgerFile,ledger,options)},{planReference:'artifacts/'+path.relative(artifacts,planFile).split(path.sep).join('/'),planSha256:sha(raw)});
    process.stdout.write(JSON.stringify({status:ledger.status,ledger:'artifacts/'+path.relative(artifacts,ledgerFile).split(path.sep).join('/'),total:ledger.cells.length,states:ledger.cells.reduce((counts,cell)=>({...counts,[cell.status]:(counts[cell.status]||0)+1}),{}),errorCodes:ledger.errors.map(error=>error.code)},null,2)+'\n');
    return ledger.status==='completed'?0:1;
  } finally {process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  try {process.exitCode=await main();}
  catch(error){process.stderr.write((error.code==='EEXIST'?'Existing ledger will not be overwritten; restart/resume is unsupported.':error.code==='EACCES'?'Panel plan/ledger access failed (EACCES); match operator container ownership and keep private file permissions.':error instanceof ExecutionError?error.code:'Panel worker failed before execution or ledger update.')+'\n');process.exitCode=1;}
}
