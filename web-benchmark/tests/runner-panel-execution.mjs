import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPanel,validatePanel} from '../src/runner/panel.mjs';
import {executePanel} from '../src/runner/panel-runner.mjs';

const catalog=[{root:'R0101',variant:'B0101'},{root:'R0102',variant:'B0102'}];
const timestamp='2026-10-02T00:00:00.000Z';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const options={catalog,now:()=>timestamp,planReference:'plans/execution-test.json',planSha256:'1'.repeat(64)};
const plan=(selected={})=>createPanel({roots:['R0101'],seeds:['execution-test'],...selected},{catalog,createdAt:timestamp});
const zero={activeRequests:0,openRequests:0,pendingHandlers:0,settled:true};
const idle=()=>({active:false,activeRequests:0,openRequests:0,pendingHandlers:0,id:'idle-window',workspace:null,count:0,peakActive:0});

function harness(panel,settings={}) {
  const events=[];const snapshots=[];const artifacts=[];
  let current=null,manifest=null,index=-1,live=idle(),afterScan=false,measurementCalls=0;
  function failure(stage) {
    if(settings.failStage===stage){const error=new Error('Mock '+stage+' failed.');error.code='mock_'+stage;throw error;}
  }
  const dependencies={
    measurement:async()=>{
      events.push({operation:'measurement',cellId:current?.cellId??null});measurementCalls++;
      failure('measurement');
      const supplied=settings.measurement?settings.measurement(structuredClone(live),{afterScan,index,measurementCalls,current}):live;
      return structuredClone(supplied);
    },
    reset:async cell=>{
      events.push({operation:'reset',cellId:cell.cellId});failure('reset');
      index++;current=structuredClone(cell);afterScan=false;
      live={...idle(),workspace:cell.expectedWorkspace,id:'before-'+index};
      manifest={base:cell.expectedWorkspace,entry:cell.expectedWorkspace+'/normal',openapi:cell.expectedWorkspace+'/openapi.json'};
      if(settings.manifest)manifest=settings.manifest(structuredClone(manifest),cell);
      return structuredClone(manifest);
    },
    newSession:async(...args)=>{
      assert.equal(args.length,0,'Session reset receives no target labels or credentials');
      events.push({operation:'newSession',cellId:current?.cellId??null});failure('newSession');
    },
    scan:async condition=>{
      events.push({operation:'scan',cellId:current?.cellId??null});failure('scan');
      assert.deepEqual(condition,current.condition,'Only the public condition is passed to the scanner callback');
      assert.deepEqual(Object.keys(condition).sort(),['authMode','profile','requestedConcurrency','requestedHttpRequests','subject','wallSeconds'].sort());
      const status=settings.statuses?.[index]||'completed';
      live={active:false,...zero,id:'meter-'+index,workspace:current.expectedWorkspace,count:status==='budget_stopped'?condition.requestedHttpRequests+3:12+index,peakActive:2};
      const runId='zap-panel-test-'+String(index+1).padStart(3,'0');
      const authenticated=condition.authMode!=='anonymous';
      let result={
        path:'artifacts/'+runId+'/run.json',sha256:'a'.repeat(64),exitCode:['completed','budget_stopped'].includes(status)?0:1,
        run:{
          schema:'benchmark-scanner-run-0.2',runId,tool:'ZAP',toolVersion:'2.17.0',phase:'finished',status,
          startedAt:timestamp,finishedAt:timestamp,targetOrigin:'https://app:8443',workspace:current.expectedWorkspace,
          profile:condition.authMode+'-'+condition.profile,
          budgets:{wallSeconds:condition.wallSeconds,requestedHttpRequests:condition.requestedHttpRequests,requestedConcurrency:condition.requestedConcurrency},
          authReachability:{configuredAuthentication:authenticated?condition.authMode:'none',subject:condition.subject,credentialsReplayed:authenticated,identityVerified:authenticated,postScanVerified:authenticated,protectedOperationVerified:condition.authMode==='bearer',selfChecks:authenticated?{presentCookiePreserved:true,...(condition.authMode==='bearer'?{presentAuthorizationPreserved:true}:{})}:{}},
          inputFingerprints:{publicManifestSha256:digest(manifest)},
          measurement:structuredClone(live),trafficSettled:true,drainTimedOut:false,
          pendingAtMeasurementStop:{...zero},drainPendingState:{...zero},errors:[]
        }
      };
      if(settings.result)result=settings.result(result,{index,cell:current,condition,manifest});
      if(settings.liveAfterScan)live=settings.liveAfterScan(structuredClone(live),{index,result,current});
      artifacts.push(structuredClone(result));afterScan=true;
      return result;
    },
    persist:async(ledger,metadata)=>{
      events.push({operation:'persist',initial:metadata.initial,currentCell:ledger.currentCell});failure('persist');
      snapshots.push({ledger:structuredClone(ledger),metadata:structuredClone(metadata)});
    }
  };
  return {events,snapshots,artifacts,dependencies,execute:()=>executePanel(panel,dependencies,options)};
}

function haltedAtFirst(ledger,h,{status='failed'}={}) {
  assert.equal(ledger.status,'halted');assert.equal(ledger.cells[0].status,status);
  assert.equal(ledger.currentCell,ledger.cells[0].cellId);
  assert.ok(ledger.cells[0].errors.some(error=>typeof error.code==='string'&&error.code));
  assert.ok(ledger.errors.some(error=>typeof error.code==='string'&&error.code));
  assert.ok(ledger.cells.slice(1).every(cell=>cell.status==='not_run'&&cell.run===null));
  assert.equal(h.events.filter(event=>event.operation==='reset').length,1);
}

test('Mixed low-profile execution uses only generic conditions and preserves paired arm/workspace identities',async()=>{
  const panel=plan({profiles:['baseline','active-low']});const h=harness(panel);
  const ledger=await h.execute();assert.equal(ledger.status,'completed');assert.equal(ledger.cells.length,6);
  assert.deepEqual(h.artifacts.map(item=>item.run.profile),['anonymous-baseline','anonymous-active-low','anonymous-baseline','anonymous-active-low','anonymous-baseline','anonymous-active-low']);
  assert.equal(new Set(h.artifacts.map(item=>item.run.workspace)).size,1);
});

test('A failed low-profile policy cleanup represented by failed run status halts before subsequent resets',async()=>{
  const panel=plan({profiles:['baseline','active-low']});
  const h=harness(panel,{statuses:['completed','failed'],result:(result,{index})=>{
    if(index===1){result.run.activeScanPolicy={cleanup:{required:true,removed:false,errorCode:'low_policy_removal_not_verified'}};result.run.errors=[{phase:'policy-cleanup',code:'low_policy_removal_not_verified'}];}
    return result;
  }});
  const ledger=await h.execute();assert.equal(ledger.status,'halted');assert.equal(ledger.cells[0].status,'completed');assert.equal(ledger.cells[1].status,'failed');
  assert.ok(ledger.cells.slice(2).every(cell=>cell.status==='not_run'&&cell.run===null));assert.equal(h.events.filter(event=>event.operation==='reset').length,2);
});

test('Validated initial plans are cloned and remain valid as new implemented roots are added',()=>{
  const original=plan({roots:'all'});const before=structuredClone(original);
  const extended=[...catalog,{root:'R0103',variant:'B0103'}];
  const validated=validatePanel(original,{catalog:extended});
  assert.deepEqual(validated,original);assert.notEqual(validated,original);assert.notEqual(validated.cells,original.cells);
  validated.cells[0].status='failed';assert.deepEqual(original,before);
  assert.throws(()=>validatePanel(original,{catalog:[catalog[0]]}));
  assert.throws(()=>validatePanel(original,{catalog:[catalog[0],{root:'R0102',variant:'B0999'}]}));
});

test('Corrupt identities, conditions, cell ordering or prior execution reject before any callback',async()=>{
  const changes=[
    panel=>{panel.schema='other';},panel=>{panel.planId='panel-corrupt';},
    panel=>{panel.catalogSnapshot.implementedRootCount++;},panel=>{panel.cellCount++;},
    panel=>{panel.cells.reverse();},panel=>{panel.cells.pop();},panel=>{panel.cells[0].cellId='cell-corrupt';},
    panel=>{panel.cells[0].expectedWorkspace='/w/aaaaaaaaaaaa';},
    panel=>{panel.cells[0].condition.requestedHttpRequests++;},panel=>{panel.cells[0].arm='F';},
    panel=>{panel.cells[0].status='running';},panel=>{panel.cells[0].run={runId:'old-run'};},
    panel=>{panel.selection.seeds.push(panel.selection.seeds[0]);},panel=>{panel.selection.requestedConcurrency=3;}
  ];
  for(const change of changes) {
    const corrupted=plan();change(corrupted);const h=harness(corrupted);
    await assert.rejects(h.execute);assert.deepEqual(h.events,[]);
  }
});

test('Sequential dispatch resets each cell before a new session and passes only its scan condition',async()=>{
  const original=plan({roots:['R0101','R0102']});const before=structuredClone(original);
  const h=harness(original);const ledger=await h.execute();
  assert.equal(ledger.status,'completed');assert.equal(ledger.currentCell,null);
  assert.ok(ledger.cells.every(cell=>cell.status==='completed'));
  const expected=original.cells.flatMap(cell=>['reset','newSession','scan'].map(operation=>({operation,cellId:cell.cellId})));
  assert.deepEqual(h.events.filter(event=>['reset','newSession','scan'].includes(event.operation)),expected);
  assert.equal(h.snapshots.filter(snapshot=>snapshot.metadata.initial===true).length,1);
  assert.ok(h.snapshots.some(snapshot=>snapshot.ledger.cells[0].status==='running'&&snapshot.ledger.currentCell===original.cells[0].cellId));
  assert.deepEqual(original,before,'Execution must not mutate the saved initial plan');
});

test('An existing initial ledger stops execution before measurement or any other callback',async()=>{
  const original=plan();const before=structuredClone(original);const h=harness(original);
  h.dependencies.persist=async(_ledger,metadata)=>{
    h.events.push({operation:'persist',initial:metadata.initial});
    const error=new Error('Existing ledger');error.code='EEXIST';throw error;
  };
  await assert.rejects(h.execute,{code:'EEXIST'});
  assert.deepEqual(h.events,[{operation:'persist',initial:true}]);
  assert.deepEqual(h.snapshots,[]);assert.deepEqual(h.artifacts,[]);
  assert.deepEqual(original,before);
});

test('Successful cells retain the matched artifact reference and safe measurement summary',async()=>{
  const h=harness(plan({arms:['V']}));const ledger=await h.execute();
  const result=h.artifacts[0];const recorded=ledger.cells[0].run;
  assert.equal(recorded.path,result.path);assert.equal(recorded.sha256,result.sha256);
  assert.equal(recorded.runId,result.run.runId);assert.equal(recorded.status,'completed');assert.equal(recorded.exitCode,0);
  assert.ok(recorded.summary&&typeof recorded.summary==='object');
});

test('Completed, soft-budget stops and unsupported cells all permit the next dispatch',async()=>{
  const h=harness(plan(),{statuses:['completed','budget_stopped','unsupported']});
  const ledger=await h.execute();
  assert.equal(ledger.status,'completed');assert.equal(ledger.currentCell,null);
  assert.deepEqual(ledger.cells.map(cell=>cell.status),['completed','budget_stopped','unsupported']);
  assert.equal(h.events.filter(event=>event.operation==='reset').length,3);
  assert.ok(h.artifacts[1].run.measurement.count>h.artifacts[1].run.budgets.requestedHttpRequests);
});

test('Unsupported authentication can omit run measurement and final identity proofs but still needs an idle live meter',async()=>{
  const h=harness(plan({auth:['session']}),{statuses:['unsupported','completed','completed'],result:(result,{index})=>{
    if(index===0) {
      delete result.run.measurement;delete result.run.inputFingerprints;
      result.run.authReachability.identityVerified=false;result.run.authReachability.postScanVerified=false;
      result.run.authReachability.selfChecks={};result.run.trafficSettled=false;
    }
    return result;
  }});
  const ledger=await h.execute();
  assert.equal(ledger.status,'completed');assert.equal(ledger.cells[0].status,'unsupported');
  assert.equal(h.events.filter(event=>event.operation==='reset').length,3);
  assert.ok(h.events.filter(event=>event.operation==='measurement').length>=6);
});

test('Session identity is accepted without a protected fixture route, while bearer verifies its protected operation',async()=>{
  const h=harness(plan({arms:['V'],auth:['session','bearer']}));const ledger=await h.execute();
  assert.equal(ledger.status,'completed');assert.deepEqual(ledger.cells.map(cell=>cell.status),['completed','completed']);
  assert.equal(h.artifacts[0].run.authReachability.protectedOperationVerified,false);
  assert.equal(h.artifacts[1].run.authReachability.protectedOperationVerified,true);
});

test('Authentication identity, subject and diagnostic-header preservation must match the selected condition',async()=>{
  const changes=[
    run=>{run.authReachability.configuredAuthentication='none';},run=>{run.authReachability.subject='bob';},
    run=>{run.authReachability.identityVerified=false;},run=>{run.authReachability.postScanVerified=false;},
    run=>{run.authReachability.selfChecks.presentCookiePreserved=false;},run=>{delete run.authReachability.selfChecks;},
    run=>{run.authReachability.protectedOperationVerified=false;},
    run=>{run.authReachability.selfChecks.presentAuthorizationPreserved=false;}
  ];
  for(const change of changes) {
    const h=harness(plan({auth:['bearer']}),{result:result=>{change(result.run);return result;}});
    const ledger=await h.execute();haltedAtFirst(ledger,h);
  }
  const anonymous=harness(plan(),{result:result=>{result.run.authReachability.subject='alice';return result;}});
  haltedAtFirst(await anonymous.execute(),anonymous);
});

test('Run schema, phase, tool, workspace, profile and requested budgets are bound to the current cell',async()=>{
  const changes=[
    run=>{run.schema='benchmark-scanner-run-0.1';},run=>{run.phase='active';},run=>{run.tool='other';},
    run=>{run.workspace='/w/aaaaaaaaaaaa';},run=>{run.profile='anonymous-active';},
    run=>{run.targetOrigin='https://other:8443';},run=>{run.budgets.wallSeconds++;},
    run=>{run.budgets.requestedHttpRequests++;},run=>{run.budgets.requestedConcurrency=3;},
    run=>{run.inputFingerprints.publicManifestSha256='b'.repeat(64);},run=>{delete run.inputFingerprints;}
  ];
  for(const change of changes) {
    const h=harness(plan(),{result:result=>{change(result.run);return result;}});
    const ledger=await h.execute();haltedAtFirst(ledger,h);
    assert.ok(ledger.cells[0].run,'A safely validated artifact reference is kept when its conditions mismatch');
  }
});
test('Fixed browser cookie pair is accepted only with verified target evidence',async()=>{
  const cookiePair={requiredOrigins:['https://app.benchmark.test:8443','http://app.benchmark.test:8080'],supportedOrigins:['https://app.benchmark.test:8443','http://app.benchmark.test:8080'],adapter:'browser-cookie-transport',verified:true};
  const adapt=result=>{result.run.targetOrigin='https://app.benchmark.test:8443';result.run.targetSurface=structuredClone(cookiePair);result.run.browserCookieTransport={httpMessageId:'7',httpCookieSent:true};return result;};
  const accepted=harness(plan({auth:['session']}),{result:adapt});
  assert.equal((await accepted.execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{delete run.browserCookieTransport;},run=>{run.targetSurface.requiredOrigins[1]='https://other:8444';}]) {
    const rejected=harness(plan({auth:['session']}),{result:result=>{adapt(result);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});
test('Sibling-host cookie observation requires complete browser and ZAP HTTP evidence',async()=>{
  const pair={requiredOrigins:['https://app.benchmark.test:8443','https://evil.benchmark.test:8444'],supportedOrigins:['https://app.benchmark.test:8443','https://evil.benchmark.test:8444'],scanOrigins:['https://app.benchmark.test:8443'],observationOrigins:['https://evil.benchmark.test:8444'],observationPath:'/b3-cookie-collector',adapter:'browser-cookie-domain',verified:true};
  const adapt=result=>{result.run.targetOrigin='https://app.benchmark.test:8443';result.run.targetSurface=structuredClone(pair);result.run.browserCookieDomain={loginStatus:200,accountBeforeStatus:200,accountAfterStatus:200,identityVerified:true,collectorOrigin:'https://evil.benchmark.test:8444',collectorPath:'/b3-cookie-collector',collectorStatus:200,collectorMessageId:'7',collectorCookieSent:true};result.run.secondaryHistoryArchives=[{origin:'https://evil.benchmark.test:8444',prefix:'https://evil.benchmark.test:8444/b3-cookie-collector',complete:true,savedCount:1}];return result;};
  assert.equal((await harness(plan({auth:['session']}),{result:adapt}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserCookieDomain.collectorMessageId=null;},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan({auth:['session']}),{result:result=>{adapt(result);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});

test('Event collector completion requires the separate ZAP history and browser evidence',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],adapter:'browser-event-collector',verified:true};
  const adapt=result=>{result.run.targetSurface=structuredClone(pair);result.run.browserEventCollector={origin:'https://app:8444',path:'/collect-events',postStatus:202,messageId:'7'};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',complete:true,savedCount:1}];return result;};
  assert.equal((await harness(plan(),{result:adapt}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{delete run.browserEventCollector;},run=>{run.secondaryHistoryArchives[0].savedCount=0;},run=>{run.targetSurface.scanOrigins=['https://app:8444'];}]) {
    const rejected=harness(plan(),{result:result=>{adapt(result);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});

test('Library integrity completion requires both auxiliary responses and a recorded browser result',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-library.js',adapter:'browser-library-integrity',verified:true};
  const adapt=result=>{result.run.targetSurface=structuredClone(pair);result.run.browserLibraryIntegrity={origin:'https://app:8444',path:'/b2-library.js',normalLibraryLoaded:true,modifiedResponseStatus:200,modifiedResponseMessageId:'8',tamperedScriptExecuted:false};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',complete:true,savedCount:2}];return result;};
  assert.equal((await harness(plan({auth:['session']}),{result:adapt}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserLibraryIntegrity.normalLibraryLoaded=false;},run=>{run.secondaryHistoryArchives[0].savedCount=1;},run=>{run.targetSurface.observationPath='/other';}]) {
    const rejected=harness(plan({auth:['session']}),{result:result=>{adapt(result);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});

test('Resource switch completion accepts either observed alternative execution or a complete absence record',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-resource.js',adapter:'browser-resource-switch',verified:true};
  const adapt=(result,foreign)=>{result.run.targetSurface=structuredClone(pair);result.run.browserResourceSwitch={origin:'https://app:8444',path:'/b2-resource.js',normalSameOriginScriptLoaded:true,foreignScriptExecuted:foreign,foreignResponseMessageId:foreign?'9':null};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',complete:true,savedCount:foreign?1:0}];return result;};
  for(const foreign of [true,false])assert.equal((await harness(plan(),{result:result=>adapt(result,foreign)}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserResourceSwitch.normalSameOriginScriptLoaded=false;},run=>{run.browserResourceSwitch.foreignResponseMessageId=null;},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan(),{result:result=>{adapt(result,true);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});

test('JSONP completion requires browser and auxiliary history observations to agree',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-jsonp',adapter:'browser-jsonp-csp',verified:true};
  const adapt=(result,executed)=>{result.run.targetSurface=structuredClone(pair);result.run.browserJsonpCsp={origin:'https://app:8444',path:'/b2-jsonp',normalNoticeRendered:true,callbackExecuted:executed,diagnosticResponseMessageId:executed?'9':null};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',complete:true,savedCount:executed?2:0}];return result;};
  for(const executed of [true,false])assert.equal((await harness(plan(),{result:result=>adapt(result,executed)}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserJsonpCsp.normalNoticeRendered=false;},run=>{run.browserJsonpCsp.diagnosticResponseMessageId=null;},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan(),{result:result=>{adapt(result,true);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});

test('External window completion requires the popup response and matching opener navigation',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-linked-screen',adapter:'browser-external-window',verified:true};
  const adapt=(result,opener)=>{result.run.targetSurface=structuredClone(pair);result.run.browserExternalWindow={origin:'https://app:8444',path:'/b2-linked-screen',popupResponseStatus:200,popupResponseMessageId:'10',openerPresent:opener,parentNavigated:opener};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',complete:true,savedCount:1}];return result;};
  for(const opener of [true,false])assert.equal((await harness(plan(),{result:result=>adapt(result,opener)}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserExternalWindow.parentNavigated=false;},run=>{run.browserExternalWindow.popupResponseMessageId=null;},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan(),{result:result=>{adapt(result,true);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});

test('Framed approval completion requires an authenticated normal POST and matching frame result',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-frame',adapter:'browser-frame-approval',verified:true};
  const adapt=(result,loaded)=>{result.run.targetSurface=structuredClone(pair);result.run.browserFrameApproval={origin:'https://app:8444',path:'/b2-frame',frameResponseStatus:200,frameResponseMessageId:'11',normalApprovalStatus:200,frameLoaded:loaded,framedApprovalStatus:loaded?200:null};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',complete:true,savedCount:1}];return result;};
  for(const loaded of [true,false])assert.equal((await harness(plan({auth:['session']}),{result:result=>adapt(result,loaded)}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserFrameApproval.normalApprovalStatus=403;},run=>{run.browserFrameApproval.framedApprovalStatus=null;},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan({auth:['session']}),{result:result=>{adapt(result,true);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});

test('PostMessage boundary completion requires the local receiver response and browser outcomes',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-origin-page',adapter:'browser-message-boundary',verified:true};
  const adapt=(result,mode)=>{result.run.targetSurface=structuredClone(pair);result.run.browserMessageBoundary={origin:'https://app:8444',path:'/b2-origin-page',mode,receiverResponseStatus:200,receiverResponseMessageId:'12',normalReportReceived:true,externalReportReceived:false};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',complete:true,savedCount:1}];return result;};
  for(const mode of ['sender-origin','recipient-navigation'])assert.equal((await harness(plan({auth:['session']}),{result:result=>adapt(result,mode)}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserMessageBoundary.mode='other';},run=>{run.browserMessageBoundary.normalReportReceived=false;},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan({auth:['session']}),{result:result=>{adapt(result,'sender-origin');change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});

test('Form destination completion requires normal transfer and matching auxiliary evidence',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-collect',adapter:'browser-form-destination',verified:true};
  const adapt=(result,foreign)=>{result.run.targetSurface=structuredClone(pair);result.run.browserFormDestination={origin:'https://app:8444',path:'/b2-collect',normalTransferStatus:200,foreignFormSubmitted:foreign,foreignResponseMessageId:foreign?'13':null,privateFieldMatchedInHistory:foreign?true:null};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',complete:true,savedCount:foreign?1:0}];return result;};
  for(const foreign of [true,false])assert.equal((await harness(plan({auth:['session']}),{result:result=>adapt(result,foreign)}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserFormDestination.normalTransferStatus=403;},run=>{run.browserFormDestination.foreignResponseMessageId=null;},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan({auth:['session']}),{result:result=>{adapt(result,true);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});
test('Profile origin completion requires both browser pages and matching form state',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPaths:['/b2-origin-page','/b2-form'],adapter:'browser-profile-origin',verified:true};
  const adapt=(result,changed)=>{result.run.targetSurface=structuredClone(pair);result.run.browserProfileOrigin={origin:'https://app:8444',paths:['/b2-origin-page','/b2-form'],normalSaveStatus:200,navigationStatus:200,navigationChanged:false,externalFormStatus:changed?200:403,externalFormChanged:changed,auxiliaryMessageIds:['14','15'],identityVerified:true};result.run.secondaryHistoryArchives=['/b2-origin-page','/b2-form'].map(path=>({origin:'https://app:8444',prefix:'https://app:8444'+path,complete:true,savedCount:1}));return result;};
  for(const changed of [true,false])assert.equal((await harness(plan({auth:['session']}),{result:result=>adapt(result,changed)}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserProfileOrigin.externalFormChanged=false;},run=>{run.browserProfileOrigin.auxiliaryMessageIds=[];},run=>{run.secondaryHistoryArchives[1].complete=false;}]) {
    const rejected=harness(plan({auth:['session']}),{result:result=>{adapt(result,true);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});
test('Login origin completion requires normal identity and saved auxiliary form',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-form',adapter:'browser-login-origin',verified:true};
  const adapt=(result,changed)=>{result.run.targetSurface=structuredClone(pair);result.run.browserLoginOrigin={origin:'https://app:8444',path:'/b2-form',normalLoginStatus:200,normalIdentityVerified:true,foreignFormStatus:changed?200:403,foreignIdentityChanged:changed,foreignResponseMessageId:'16'};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',prefix:'https://app:8444/b2-form',complete:true,savedCount:1}];return result;};
  for(const changed of [true,false])assert.equal((await harness(plan(),{result:result=>adapt(result,changed)}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserLoginOrigin.foreignIdentityChanged=false;},run=>{run.browserLoginOrigin.foreignResponseMessageId=null;},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan(),{result:result=>{adapt(result,true);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});
test('Recovery Referer completion requires a redeemed token and browser pixel archive',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b3-pixel',adapter:'browser-recovery-referer',verified:true};
  const adapt=(result,leaked)=>{result.run.targetSurface=structuredClone(pair);result.run.browserRecoveryReferer={origin:'https://app:8444',path:'/b3-pixel',initiationStatus:200,recoveryPageStatus:200,completionStatus:200,pixelResponseMessageId:null,pixelHttpArchive:{path:'browser-recovery-pixel-http.json',sha256:'a'.repeat(64)},tokenSha256:'b'.repeat(64),tokenInReferer:leaked};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',prefix:'https://app:8444/b3-pixel',complete:true,savedCount:0}];return result;};
  for(const leaked of [true,false])assert.equal((await harness(plan(),{result:result=>adapt(result,leaked)}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserRecoveryReferer.completionStatus=403;},run=>{run.browserRecoveryReferer.pixelHttpArchive.sha256=null;},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan(),{result:result=>{adapt(result,true);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});
test('CSS collector completion requires normal styling and bounded auxiliary observation',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-collect',adapter:'browser-css-collector',verified:true};
  const adapt=result=>{result.run.targetSurface=structuredClone(pair);result.run.browserCssCollector={origin:'https://app:8444',path:'/b2-collect',loginStatus:200,normalEntryStatus:200,normalStyleVerified:true,diagnosticStatus:200,imageResponseObserved:false,imageResponseMessageId:null,imageHttpArchive:null,identityVerified:true};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',prefix:'https://app:8444/b2-collect',complete:true,savedCount:0}];return result;};
  assert.equal((await harness(plan(),{result:adapt}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserCssCollector.normalStyleVerified=false;},run=>{run.browserCssCollector.imageHttpArchive={path:'unexpected.json',sha256:'a'.repeat(64)};},run=>{run.secondaryHistoryArchives[0].complete=false;}]) {
    const rejected=harness(plan(),{result:result=>{adapt(result);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});
test('Cross-origin report completion requires the normal read and saved browser-origin HTTP',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-origin-page',adapter:'browser-cors-report',verified:true};
  const blocked={readable:false,status:null,bodySha256:null,requestId:null,internalHeaderVisible:false,internalHeaderSha256:null};
  const adapt=result=>{result.run.targetSurface=structuredClone(pair);result.run.browserCorsReport={origin:'https://app:8444',path:'/b2-origin-page',loginStatus:200,normalReportStatus:200,auxiliaryPageStatus:200,auxiliaryMessageId:'16',preflightMessageId:'18',preflightHttpStatus:403,crossOriginReportMessageId:'17',preflight:structuredClone(blocked),simple:structuredClone(blocked),identityVerified:true};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',prefix:'https://app:8444/b2-origin-page',complete:true,savedCount:1}];return result;};
  assert.equal((await harness(plan(),{result:adapt}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserCorsReport.normalReportStatus=401;},run=>{run.browserCorsReport.preflightMessageId=null;},run=>{run.browserCorsReport.preflightHttpStatus=200;},run=>{run.browserCorsReport.crossOriginReportMessageId=null;},run=>{run.browserCorsReport.simple.readable=true;},run=>{run.secondaryHistoryArchives[0].savedCount=0;}]) {
    const rejected=harness(plan(),{result:result=>{adapt(result);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});
test('CORS policy completion requires both role updates and both browser report reads',async()=>{
  const pair={requiredOrigins:['https://app:8443','https://app:8444'],supportedOrigins:['https://app:8443','https://app:8444'],scanOrigins:['https://app:8443'],observationOrigins:['https://app:8444'],observationPath:'/b2-origin-page',adapter:'browser-cors-policy',verified:true};
  const blocked={readable:false,status:null,bodySha256:null},readable={readable:true,status:200,bodySha256:'a'.repeat(64)};
  const adapt=result=>{result.run.targetSurface=structuredClone(pair);result.run.browserCorsPolicy={origin:'https://app:8444',path:'/b2-origin-page',normalPolicyStatus:200,alicePolicyStatus:403,adminPolicyStatus:200,alicePolicyMessageId:'11',adminPolicyMessageId:'12',beforeAdminReportMessageId:'13',afterAdminReportMessageId:'14',auxiliaryMessageIds:['15','16'],beforeAdmin:structuredClone(blocked),afterAdmin:structuredClone(readable),identityVerified:true};result.run.secondaryHistoryArchives=[{origin:'https://app:8444',prefix:'https://app:8444/b2-origin-page',complete:true,savedCount:2}];return result;};
  assert.equal((await harness(plan(),{result:adapt}).execute()).status,'completed');
  for(const change of [run=>{run.targetSurface.verified=false;},run=>{run.browserCorsPolicy.adminPolicyStatus=403;},run=>{run.browserCorsPolicy.adminPolicyMessageId=null;},run=>{run.browserCorsPolicy.afterAdmin.readable=false;},run=>{run.browserCorsPolicy.auxiliaryMessageIds.pop();},run=>{run.secondaryHistoryArchives[0].savedCount=1;}]) {
    const rejected=harness(plan(),{result:result=>{adapt(result);change(result.run);return result;}});
    haltedAtFirst(await rejected.execute(),rejected);
  }
});

test('Unsafe artifact paths, wrong run identity, invalid digest and mismatched exit codes are rejected',async()=>{
  const changes=[
    result=>{result.path='/artifacts/'+result.run.runId+'/run.json';},
    result=>{result.path='C:/artifacts/'+result.run.runId+'/run.json';},
    result=>{result.path='artifacts/'+result.run.runId+'/../run.json';},
    result=>{result.path='artifacts/other-run/run.json';},
    result=>{result.path='artifacts/'+result.run.runId+'/alerts.json';},
    result=>{result.run.runId='../escape';},result=>{result.sha256='not-a-hash';},
    result=>{result.sha256='g'.repeat(64);},result=>{delete result.sha256;},
    result=>{result.exitCode=1;},result=>{delete result.exitCode;}
  ];
  for(const change of changes) {
    const h=harness(plan(),{result:result=>{change(result);return result;}});
    haltedAtFirst(await h.execute(),h);
  }
});

test('A failed scanner run halts and copies error codes without secret-bearing error messages',async()=>{
  const secret='do-not-copy-fixture-secret';
  const h=harness(plan(),{statuses:['failed'],result:result=>{
    result.run.errors=[{code:'scanner_test_failure',message:secret}];delete result.run.inputFingerprints;
    return result;
  }});
  const ledger=await h.execute();haltedAtFirst(ledger,h);
  assert.equal(ledger.cells[0].run.status,'failed');
  assert.equal(JSON.stringify(ledger).includes(secret),false);
  assert.equal(JSON.stringify(h.snapshots).includes(secret),false);
});

test('An explicit incomplete drain retains that status and blocks the next reset',async()=>{
  const h=harness(plan(),{statuses:['incomplete_drain'],result:result=>{
    result.run.trafficSettled=false;result.run.drainTimedOut=true;
    result.run.measurement.pendingHandlers=1;
    result.run.pendingAtMeasurementStop={...zero,pendingHandlers:1,settled:false};
    result.run.drainPendingState={...zero,pendingHandlers:1,settled:false};
    delete result.run.inputFingerprints;return result;
  },liveAfterScan:live=>({...live,pendingHandlers:1})});
  const ledger=await h.execute();haltedAtFirst(ledger,h,{status:'incomplete_drain'});
});

test('Busy or unverifiable preflight lifecycle stops before resetting the application',async()=>{
  for(const change of [
    value=>({...value,active:true}),value=>({...value,activeRequests:1}),
    value=>({...value,openRequests:1}),value=>({...value,pendingHandlers:1}),
    value=>{delete value.pendingHandlers;return value;},value=>({...value,openRequests:-1}),
    value=>({...value,activeRequests:'0'}),value=>({...value,pendingHandlers:NaN})
  ]) {
    const h=harness(plan(),{measurement:change});const ledger=await h.execute();
    assert.equal(ledger.status,'halted');
    assert.equal(h.events.filter(event=>event.operation==='reset').length,0);
    assert.equal(h.events.filter(event=>event.operation==='scan').length,0);
  }
});

test('A busy second-cell preflight preserves the completed first cell and prevents a second reset',async()=>{
  const h=harness(plan(),{measurement:(value,{measurementCalls})=>measurementCalls===4?{...value,pendingHandlers:1}:value});
  const ledger=await h.execute();
  assert.equal(ledger.status,'halted');assert.equal(ledger.currentCell,ledger.cells[1].cellId);
  assert.equal(ledger.cells[0].status,'completed');assert.ok(ledger.cells[0].run);
  assert.deepEqual(ledger.cells[0].errors,[]);
  assert.equal(ledger.cells[1].status,'failed');assert.equal(ledger.cells[1].phase,'preflight');
  assert.equal(ledger.cells[1].run,null);assert.ok(ledger.cells[1].errors.some(error=>error.code==='measurement_busy_or_unsettled'));
  assert.equal(ledger.cells[2].status,'not_run');assert.equal(ledger.cells[2].run,null);
  for(const operation of ['reset','newSession','scan'])assert.equal(h.events.filter(event=>event.operation===operation).length,1);
});

test('Every live post-run meter must be inactive and have all three pending counters at zero',async()=>{
  for(const change of [
    value=>({...value,active:true}),value=>({...value,activeRequests:1}),
    value=>({...value,openRequests:1}),value=>({...value,pendingHandlers:1}),
    value=>{delete value.openRequests;return value;}
  ]) {
    for(const status of ['completed','unsupported']) {
      const h=harness(plan(),{statuses:[status],liveAfterScan:change});
      const ledger=await h.execute();assert.equal(ledger.status,'halted');
      assert.equal(h.events.filter(event=>event.operation==='reset').length,1);
      assert.ok(ledger.cells.slice(1).every(cell=>cell.status==='not_run'));
    }
  }
});

test('A successful run needs explicit settled lifecycle snapshots and a matching final live measurement',async()=>{
  const changes=[
    run=>{delete run.measurement;},run=>{run.measurement.active=true;},
    run=>{run.measurement.pendingHandlers=1;},run=>{delete run.measurement.openRequests;},
    run=>{run.measurement.id='another-window';},run=>{run.measurement.workspace='/w/aaaaaaaaaaaa';},
    run=>{run.measurement.count++;},run=>{run.measurement.peakActive++;},
    run=>{run.trafficSettled=false;},run=>{run.drainTimedOut=true;},
    run=>{delete run.pendingAtMeasurementStop;},run=>{run.pendingAtMeasurementStop.openRequests=1;},
    run=>{delete run.drainPendingState;},run=>{delete run.drainPendingState.pendingHandlers;}
  ];
  for(const change of changes) {
    const h=harness(plan(),{result:result=>{change(result.run);return result;}});
    haltedAtFirst(await h.execute(),h);
  }
});

test('Unsupported runs that do retain measurement evidence must also have a settled matching meter',async()=>{
  for(const change of [run=>{run.measurement.active=true;},run=>{run.measurement.pendingHandlers=1;},run=>{run.measurement.id='another-window';}]) {
    const h=harness(plan(),{statuses:['unsupported'],result:result=>{change(result.run);return result;}});
    const ledger=await h.execute();assert.equal(ledger.status,'halted');
    assert.equal(h.events.filter(event=>event.operation==='reset').length,1);
  }
});

test('An unsupported run without saved measurement still stops on a busy live post-run meter',async()=>{
  const h=harness(plan(),{statuses:['unsupported'],result:result=>{
    delete result.run.measurement;delete result.run.inputFingerprints;return result;
  },liveAfterScan:value=>({...value,pendingHandlers:1})});
  const ledger=await h.execute();haltedAtFirst(ledger,h);
  assert.equal(ledger.cells[0].run.status,'unsupported');assert.equal(ledger.cells[0].run.summary.requests,null);
  assert.equal(ledger.cells[0].afterMeasurement.pending.pendingHandlers,1);
  assert.ok(ledger.cells[0].errors.some(error=>error.code==='measurement_busy_or_unsettled'));
  assert.equal(h.events.filter(event=>event.operation==='scan').length,1);
});

test('Unscoped reset manifests fail before newSession or scanner dispatch',async()=>{
  for(const change of [
    value=>({...value,base:'/w/aaaaaaaaaaaa'}),value=>({...value,entry:'http://app:8099/oracle'}),
    value=>({...value,openapi:'https://other:8443/openapi.json'}),
    value=>({...value,entry:value.base+'extra/normal'}),value=>({...value,entry:value.base+'/../escape'})
  ]) {
    const h=harness(plan(),{manifest:change});const ledger=await h.execute();haltedAtFirst(ledger,h);
    assert.equal(h.events.filter(event=>event.operation==='newSession').length,0);
    assert.equal(h.events.filter(event=>event.operation==='scan').length,0);
  }
});

test('Reset, newSession and scan exceptions fail closed without another cell dispatch',async()=>{
  for(const failStage of ['reset','newSession','scan']) {
    const h=harness(plan(),{failStage});const ledger=await h.execute();haltedAtFirst(ledger,h);
    assert.equal(h.events.filter(event=>event.operation==='scan').length,failStage==='scan'?1:0);
    assert.equal(ledger.cells[0].run,null);
  }
});

test('Initial execution remains possible using a historical plan catalog after an application catalog addition',async()=>{
  const original=plan({roots:'all'});const h=harness(original);
  const ledger=await executePanel(original,h.dependencies,{...options,catalog:[...catalog,{root:'R0103',variant:'B0103'}]});
  assert.equal(ledger.status,'completed');assert.equal(ledger.cells.length,original.cells.length);
  assert.ok(ledger.cells.every(cell=>cell.root!=='R0103'));
});
