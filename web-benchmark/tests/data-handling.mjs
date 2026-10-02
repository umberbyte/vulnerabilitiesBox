export const checks={
  R0094:async t=>{
    t.check((await t.get('/member-card')).status()===401,'Unauthenticated profile remains inaccessible in every arm');
    await t.login();const response=await t.get('/member-card'),profile=await response.json();
    t.check(response.status()===200&&profile.username==='alice'&&profile.display_name==='Alice Member','Normal authenticated public profile remains usable');
    t.check(JSON.stringify(profile).includes(t.c)===t.v,'Actual stored internal model property is serialized only in V');
    if(!t.v)t.check(Object.keys(profile).sort().join(',')==='display_name,username','Fixed DTO exposes only the declared public attributes');
    const other=await (await t.get('/member-card?username=bob')).json();
    t.check(other.username==='alice','Attribute serialization does not introduce another object-owner defect');
  },
  R0452:async t=>{
    await t.login();await t.page.goto(t.base+'/browser-access');
    await t.page.waitForFunction(()=>document.getElementById('result')?.textContent.includes('Member access is available'));
    t.check((await t.page.locator('#result').textContent()).includes('alice'),'Normal page uses a genuine issued credential to access its member API');
    const key='member-access:'+new URL(t.base).pathname;
    const value=await t.page.evaluate(key=>localStorage.getItem(key),key);
    t.check(!!value===t.v,'Same-origin storage audit finds an access credential only in V');
    if(t.v){
      const proof=await t.get('/browser-member',{headers:{authorization:'Bearer '+value}});
      t.check(proof.status()===200&&(await proof.json()).username==='alice','Value observed in localStorage authenticates to the real Redis-backed API');
    }
    await t.page.goto(t.target+'/');
    const persisted=await t.page.evaluate(key=>localStorage.getItem(key),key);
    t.check((persisted!==null)===t.v,'Credential survives navigation only when persisted in browser storage');
    t.check((await t.get('/browser-member',{headers:{authorization:'Bearer invalid'}})).status()===401,'Invalid or non-issued credential remains rejected');
    t.record.storageEvidence={normalMemberVerified:true,persistedCredential:!!persisted,source:'localStorage audit after navigation',credentialValueOmitted:true};
  },
  R0453:async t=>{
    await t.login();await t.page.goto(t.base+'/offline-dashboard');
    await t.page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const fetchData=async path=>t.page.evaluate(async url=>{const r=await fetch(url);return {status:r.status,data:await r.json()};},t.base+path);
    const initial=await fetchData('/dashboard-data');
    t.check(initial.status===200&&initial.data.username==='alice'&&initial.data.report===t.c,'Controlled browser obtains actual Alice report normally');
    const publicBefore=await fetchData('/dashboard-public');
    await t.post('/logout',{});
    t.check((await t.get('/dashboard-data')).status()===401,'Server denies the report after actual logout in all arms');
    const anonymous=await fetchData('/dashboard-data');
    t.check((anonymous.status===200&&anonymous.data.report===t.c)===t.v,'Service Worker returns logged-out Alice data only in V');
    const stored=await t.page.evaluate(async({name,url})=>{const r=await(await caches.open(name)).match(url);return r?await r.text():null;},{name:'dashboard:'+new URL(t.base).pathname,url:t.base+'/dashboard-data'});
    t.check((stored!==null&&stored.includes(t.c))===t.v,'Actual CacheStorage entry contains personal report only in V');
    await t.login('bob');const direct=await (await t.get('/dashboard-data')).json();
    t.check(direct.username==='bob'&&direct.report!==t.c,'Server now serves Bob data under the new real session');
    const bob=await fetchData('/dashboard-data');
    t.check((bob.data.report===t.c)===t.v,'Common worker cache mixes Alice report into Bob session only in V');
    const publicAfter=await fetchData('/dashboard-public');
    t.check(publicBefore.status===200&&publicAfter.status===200&&publicBefore.data.generation===publicAfter.data.generation,'Intentional public worker cache is reused across account switching');
    t.record.serviceWorkerEvidence={httpCacheControl:'no-store on all data responses',anonymousStatus:anonymous.status,browserAccount:bob.data.username,serverAccount:direct.username,personalCacheStored:stored!==null,publicGenerationBefore:publicBefore.data.generation,publicGenerationAfter:publicAfter.data.generation};
  },
  R0455:async t=>{
    t.check((await t.get('/generated-report/alice.txt')).status()===404,'Reset removes earlier generated downloads');
    t.check((await t.get('/generated-report/bob.txt')).status()===404,'Reset removes another member file from both storage destinations');
    await t.login();const generated=await t.post('/personal-reports',{}),normal=await t.get('/generated-report/alice.txt');
    t.check(generated.status()===200&&normal.status()===200&&(await normal.text())===t.c,'Owner generates and downloads an actual private report file');
    await t.post('/logout',{});const anonymous=await t.get('/generated-report/alice.txt');
    t.check((await anonymous.text()).includes(t.c)===t.v,'Generated report in public storage is exposed without authentication only in V');
    if(!t.v)t.check(anonymous.status()===401,'Private download requires a new session');
    await t.login('bob');const other=await t.get('/generated-report/alice.txt');
    t.check((await other.text()).includes(t.c)===t.v,'Another member cannot read the file from the protected storage route');
    if(!t.v)t.check(other.status()===403,'Private file ownership is enforced before filesystem read');
    await t.post('/personal-reports',{});const own=await t.get('/generated-report/bob.txt');
    t.check(own.status()===200&&(await own.text())==='bob operating notes','Other member can generate and download their own legitimate report');
    t.check((await t.get('/generated-report/not-a-member.txt')).status()===404,'Arbitrary filename cannot escape the generated file namespace');
  },
  R0457:async t=>{
    const failed=await t.post('/login',{username:'alice',password:'invalid-password'});
    t.check(failed.status()===401&&((await t.oracle()).caseState.collector.analytics).length===0,'Failed credentials do not create a successful login event');
    const observed=[];t.page.on('request',req=>{if(req.url().endsWith(':8444/collect-events')&&req.method()==='POST')observed.push(JSON.parse(req.postData()));});
    await t.page.goto(t.base+'/login-analytics');await t.page.locator('[name=password]').fill('invalid-password');await t.page.locator('#analytics-login button').click();await t.page.waitForFunction(()=>document.getElementById('result').textContent==='Login failed');
    t.check(observed.length===0&&(await t.oracle()).caseState.collector.analytics.length===0,'Failed browser login sends no successful analytics event');
    await t.page.locator('[name=password]').fill('Fixture-alice-2026!');
    await t.ctl('/measurement/start',{});
    try{
      await t.page.locator('#analytics-login button').click();await t.page.waitForFunction(()=>window.analyticsComplete===true);
      const measurement=await t.ctl('/measurement');
      t.check(measurement.byMethod.POST===2&&measurement.byMethod.OPTIONS===1&&measurement.count>=3,'Ingress measurement includes browser login and separate collector preflight/POST');
    }finally{await t.ctl('/measurement/stop',{});}
    const state=await t.oracle(),events=state.caseState.collector.analytics;
    t.check(events.length===1&&events[0].action==='login_success'&&events[0].username==='alice','Browser delivers valid login event to the actual separate HTTPS collector');
    t.check(observed.length===1&&JSON.stringify(observed[0].event)===JSON.stringify(events[0]),'Browser HTTP payload and actual stored collector event agree');
    t.check((events[0].password==='Fixture-alice-2026!')===t.v,'Collector receives a genuine working password only in V');
    if(!t.v)t.check(Object.keys(events[0]).sort().join(',')==='action,username','Fixed analytics payload uses its public attribute allowlist');
    t.check((await (await t.get('/session')).json()).username==='alice','Normal login still creates a usable server session');
    t.check((await t.context.request.get(t.attacker+'/collect-events',{headers:{origin:t.target}})).status()===404,'Collector inspection is unavailable on the public listener');
    t.record.collectorEvidence={destination:'browser to separate local HTTPS listener',eventCount:events.length,browserRequests:observed.length,validPasswordReceived:events[0].password==='Fixture-alice-2026!',credentialValueOmitted:true};
  },
  R0458:async t=>{
    await t.login();const jwt=await (await t.get('/token')).json(),headers={authorization:'Bearer '+jwt.token};
    t.check((await t.post('/error-reporting',{document:'{}'},{headers})).status()===200,'Normal JSON document succeeds with an actually verified signed JWT');
    t.check((await t.post('/error-reporting',{document:'{'},{headers:{authorization:'Bearer invalid'}})).status()===401,'Invalid credential cannot submit a collector context');
    t.check((await t.oracle()).caseState.collector.error.length===0,'Normal input and rejected authentication create no exception records');
    const observed=[];let actualAuthorization=null,publicError=null;
    t.page.on('request',req=>{if(req.url()===t.base+'/error-reporting'&&req.method()==='POST')actualAuthorization=req.headers().authorization;if(req.url().endsWith(':8444/collect-events')&&req.method()==='POST')observed.push(JSON.parse(req.postData()));});
    t.page.on('response',async res=>{if(res.url()===t.base+'/error-reporting'&&res.request().method()==='POST')publicError={status:res.status(),body:await res.text()};});
    await t.page.goto(t.base+'/error-reporting');await t.page.locator('#load').click();await t.page.waitForFunction(()=>document.getElementById('result').textContent.includes('"loaded":true'));
    t.check(observed.length===0&&(await t.oracle()).caseState.collector.error.length===0,'Normal browser JSON load sends no exception event');
    await t.page.locator('#document').fill('{');await t.page.locator('#load').click();await t.page.waitForFunction(()=>window.errorEventComplete===true);
    t.check(publicError?.status===400&&!publicError.body.includes(actualAuthorization),'Public error response remains generic in every arm');
    const events=(await t.oracle()).caseState.collector.error;
    t.check(events.length===1&&events[0].type==='SyntaxError'&&events[0].username==='alice','Browser records the genuine JSON parser failure through the actual separate HTTPS collector');
    t.check(observed.length===1&&JSON.stringify(observed[0].event)===JSON.stringify(events[0]),'Browser HTTP payload and stored error event agree');
    t.check(/^Bearer /.test(actualAuthorization),'Error context comes from the actual normal browser bearer request');
    t.check((events[0].authorization===actualAuthorization)===t.v,'Collector receives the real Authorization credential only in V');
    if(!t.v)t.check(Object.keys(events[0]).sort().join(',')==='message,type,username','Fixed exception context preserves useful public data and removes Authorization');
    t.check((await t.post('/error-reporting',{document:'{"authorization":"public descriptive text"}'},{headers})).status()===200,'Valid data containing a sensitive-looking property name remains ordinary document data');
    t.record.collectorEvidence={destination:'browser to separate local HTTPS listener',eventCount:events.length,browserRequests:observed.length,credentialReceived:events[0].authorization===actualAuthorization,credentialValueOmitted:true};
  }
};
