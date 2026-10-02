export const checks={
  R0461:async t=>{
    const contract=await t.ctl('/manifest');
    t.check(JSON.stringify(contract.requiredTargetOrigins)===JSON.stringify(['http://benchmark.test:8080','https://app:8443']),'Every arm declares the same normal HTTP-start and HTTPS target contract');
    const plain=new URL(t.target);plain.protocol='http:';plain.port='8080';plain.hostname='benchmark.test';
    const observed=[];t.page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.endsWith('/transport-access'))observed.push({scheme:new URL(request.url()).protocol,normalPasswordSent:(request.postData()||'').includes('Fixture-alice-2026')});});
    await t.page.goto(plain.origin+new URL(t.base).pathname+'/transport-access');
    t.check((new URL(t.page.url()).protocol==='http:')===t.v,'Normal HTTP entry presents a form in V and redirects to HTTPS before credentials in fixed arms');
    await t.page.locator('input[name=username]').fill('alice');await t.page.locator('input[name=password]').fill('Fixture-alice-2026!');
    const [response]=await Promise.all([t.page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.endsWith('/transport-access')),t.page.locator('button').click()]);
    t.check(response.status()===200&&(await response.json()).username==='alice','Normal browser form creates an actual member session');
    t.check(observed.length===1&&observed[0].normalPasswordSent,'Fixture credentials are present in the observed real form request');
    t.check((observed[0].scheme==='http:')===t.v,'Actual request carries credentials over HTTP only in V');
    const identity=await t.page.evaluate(async path=>(await fetch(path)).json(),new URL(t.base).pathname+'/session');
    t.check(identity.username==='alice','Form-issued session is usable on the same-origin member API');
    t.record.transportEvidence=observed;
    const information=await t.context.request.get(plain.origin+new URL(t.base).pathname+'/transport-help');
    t.check(information.status()===200&&information.url().startsWith('http:'),'Non-confidential public HTTP information remains available');
    if(!t.v){
      const rejected=await t.context.request.post(plain.origin+new URL(t.base).pathname+'/login',{data:{username:'alice',password:'Fixture-alice-2026!'}});
      t.check(rejected.status()===426,'Common login also refuses processing of direct HTTP credentials');
    }
  },
  R0464:async t=>{
    t.check((await (await t.get('/downloads/files/guide.txt')).text())==='Public download guide','Normal guide is read from an actual public file');
    const listing=await t.get('/downloads/list'),body=await listing.text();
    t.check(body.includes('internal-status.backup.txt')===t.v,'Filesystem listing exposes internal backup filename only in V');
    const backup=await t.get('/downloads/files/internal-status.backup.txt');
    t.check((await backup.text()).includes(t.c)===t.v,'Listed private backup yields actual filesystem secret content only in V');
    if(!t.v)t.check(listing.status()===404&&backup.status()===404,'Fixed public file root rejects both directory listing and hidden backup');
    t.check((await t.get('/downloads/files/private.json')).status()===404,'Unrelated internal configuration is not exposed by this download route');
    t.check((await t.get('/downloads/files/missing.txt')).status()===404,'Unknown filename remains unavailable');
  },
  R0465:async t=>{
    const status=await t.get('/support-status'),normal=await status.json();
    t.check(status.status()===200&&normal.status==='ready'&&normal.publicItems===2,'Public status uses an authenticated read-only DB connection');
    t.check(!JSON.stringify(normal).includes(t.c),'Normal status omits secret runtime settings');
    const diagnostic=await t.get('/support-diagnostics'),body=await diagnostic.text();
    t.check(body.includes(t.c)===t.v,'Unauthenticated debug route exposes actual internal connection credential only in V');
    if(t.v)t.check((await diagnostic.json()).databaseUser==='fixture_feature_reader','Debug evidence comes from the actual configured DB identity');
    else t.check(diagnostic.status()===404,'Debug route is absent from the fixed public surface');
    t.check((await (await t.get('/session')).json()).username===null,'Diagnostic inspection did not acquire an authenticated member identity');
  },
  R0477:async t=>{
    await t.login();await t.page.goto(t.base+'/account-summary');
    const cdp=await t.context.newCDPSession(t.page),requests=new Map();
    const request=id=>{
      if(!requests.has(id))requests.set(id,{requestId:id,url:null,responseReceived:false,requestServedFromCache:false,fromDiskCache:false,fromPrefetchCache:false,fromServiceWorker:false});
      return requests.get(id);
    };
    cdp.on('Network.requestWillBeSent',event=>{request(event.requestId).url=event.request.url;});
    cdp.on('Network.requestServedFromCache',event=>{request(event.requestId).requestServedFromCache=true;});
    cdp.on('Network.responseReceived',event=>{
      Object.assign(request(event.requestId),{url:event.response.url,responseReceived:true,fromDiskCache:event.response.fromDiskCache===true,fromPrefetchCache:event.response.fromPrefetchCache===true,fromServiceWorker:event.response.fromServiceWorker===true});
    });
    const cached=value=>value.requestServedFromCache||value.fromDiskCache||value.fromPrefetchCache;
    const browserResponse=value=>value.cacheProvenance.length===1&&value.cacheProvenance[0].responseReceived&&!value.cacheProvenance[0].fromServiceWorker;
    try{
      await cdp.send('Network.enable');
      const fetchInBrowser=async path=>{
        const url=t.base+path,before=new Set(requests.keys());
        // Match the account-summary UI's normal fetch(url), including default cache mode.
        const response=await t.page.evaluate(async url=>{const response=await fetch(url);return {status:response.status,body:await response.text(),cacheControl:response.headers.get('cache-control')};},url);
        return {...response,cacheProvenance:[...requests.values()].filter(value=>!before.has(value.requestId)&&value.url===url).map(value=>({...value}))};
      };
      const normal=await fetchInBrowser('/private-report');
      t.check(normal.status===200&&normal.body.includes(t.c),'Authenticated browser reads the actual private document report');
      t.check(normal.cacheControl.includes('no-store')===!t.v,'Private response cache policy agrees with the tested arm');
      const publicBefore=await fetchInBrowser('/public-report');
      await t.page.evaluate(async url=>{const response=await fetch(url,{method:'POST'});if(!response.ok)throw new Error('Logout failed');},new URL(t.base).pathname+'/logout');
      t.check((await (await t.get('/session')).json()).username===null,'Logout actually invalidates the server-side member session');
      const denied=await t.get('/private-report');t.check(denied.status()===401,'Server itself denies unauthenticated private report in every arm');
      const replay=await fetchInBrowser('/private-report');
      t.record.cacheEvidence={normalStatus:normal.status,normalCacheControl:normal.cacheControl,serverAfterLogoutStatus:denied.status(),browserAfterLogoutStatus:replay.status,privateDataRemained:replay.body.includes(t.c),fetchCacheMode:'default; same as account-summary UI',tlsVerification:'trusted local fixture certificate; ignoreHTTPSErrors=false',normalProvenance:normal.cacheProvenance,privateReplayProvenance:replay.cacheProvenance,publicBeforeProvenance:publicBefore.cacheProvenance};
      t.check(replay.body.includes(t.c)===t.v,'Browser HTTP cache reveals the logged-out private report only in V');
      t.check(browserResponse(replay)&&cached(replay.cacheProvenance[0])===t.v,'CDP request-ID evidence identifies private replay as browser cache only in V');
      if(!t.v)t.check(replay.status===401,'No-store causes a new denied request after logout');
      const publicAfter=await fetchInBrowser('/public-report');
      t.record.cacheEvidence.publicAfterProvenance=publicAfter.cacheProvenance;
      t.check(publicBefore.status===200&&publicAfter.status===200&&publicBefore.body===publicAfter.body,'Intentional public caching reuses the same real response generation after logout');
      t.check(browserResponse(publicBefore)&&browserResponse(publicAfter)&&!cached(publicBefore.cacheProvenance[0])&&cached(publicAfter.cacheProvenance[0])&&publicBefore.cacheProvenance[0].requestId!==publicAfter.cacheProvenance[0].requestId,'CDP request-ID evidence confirms the public control changes from network response to browser cache');
    }finally{await cdp.detach();}
  },
  R0478:async t=>{
    const normal=await t.get('/client-settings');t.check(normal.status()===200&&(await normal.text()).includes('Apple'),'Normal page reads public products using its configured DB credential');
    const source=await (await t.get('/client-settings.js')).text();
    const configuration=JSON.parse(source.slice('window.pageConfiguration='.length,-1));
    t.check(configuration.appPath===new URL(t.base).pathname,'Public application path remains a usable client setting');
    t.check(source.includes(t.c)===t.v,'Public JS contains genuine DB credential only in V');
    if(t.v){
      const result=await t.ctl('/database-proof',{connectionString:configuration.databaseUrl});
      t.check(result.authenticated&&result.username==='fixture_feature_reader','Credential observed in the public asset actually authenticates to PostgreSQL');
      t.check(result.privateRows.some(row=>row.title===t.c),'Observed credential reads a real protected DB row through the private operator probe');
    }else t.check(!Object.hasOwn(configuration,'databaseUrl'),'Fixed client asset excludes the private connection URL');
    const invalid=await t.ctl('/database-proof',{connectionString:'postgres://fixture_feature_reader:invalid-fixture-password@db:5432/benchmark'});
    t.check(invalid.authenticated===false,'Wrong observed credential cannot authenticate to the actual database');
    const deniedTarget=await t.ctl('/database-proof',{connectionString:'postgres://fixture_feature_reader:invalid@localhost:5432/benchmark'});
    t.check(deniedTarget.authenticated===false,'Operator DB probe cannot be redirected to another host');
    t.check((await t.get('/database-proof')).status()===404,'Credential proof is absent from the scanner-facing listener');
  },
  R0481:async t=>{
    const normal=await t.get('/item-status?id=1');t.check(normal.status()===200&&(await normal.json()).items[0].title==='Apple','Normal parameterized query reads a real public DB item');
    const erroneous=await t.get('/item-status?id=not-an-integer'),body=await erroneous.text();
    t.check(erroneous.status()===400,'Real PostgreSQL type error becomes a controlled HTTP response');
    t.check(body.includes(t.c)===t.v,'Actual connection secret is included in exception response only in V');
    if(t.v)t.check((await erroneous.json()).error.includes('invalid input syntax for type integer')&&!!(await erroneous.json()).stack,'Leak accompanies a genuine DB exception and stack');
    else t.check(!body.includes('postgres:')&&!body.includes('SELECT')&&!body.includes('stack'),'Fixed error removes internal connection, query and stack details');
    const quoted=await t.get('/item-status?id='+encodeURIComponent("O'Reilly"));
    t.check(quoted.status()===400,'Quoted non-integer remains rejected as a parameter value');
    t.check((await t.get('/item-status?id=2')).status()===200,'Normal DB access remains usable after the actual exception');
  }
};
