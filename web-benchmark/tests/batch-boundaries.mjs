const encoded=value=>encodeURIComponent(value);
const authorization=token=>({headers:{authorization:'Bearer '+token}});
const hasCanary=async(response,t)=>(await response.text()).includes(t.c);
const fixture='/opt/benchmark/fixtures/batch-boundaries';

export const checks={
  R0003:async t=>{
    const normal=await t.get('/product-columns?columns=title&q=Apple'),items=(await normal.json()).items;
    t.check(normal.status()===200&&items.length===1&&items[0].title==='Apple'&&!JSON.stringify(items).includes(t.c),'Normal PostgreSQL SELECT chooses the declared public title');
    const protectedColumn=await t.get('/product-columns?columns='+encoded('title,secret_note')+'&q=Apple');
    t.check(await hasCanary(protectedColumn,t)===t.v,'Actual private PostgreSQL column can be selected only in V');
    if(!t.v)t.check(protectedColumn.status()===400,'Unregistered column combination is rejected');
    const legitimate=await t.get('/product-columns?columns='+encoded('title,category')+'&q=Apple'),row=(await legitimate.json()).items[0];
    t.check(legitimate.status()===200&&row.title==='Apple'&&row.category==='fruit','Registered multi-column choice remains functional');
    const literal=await t.get('/product-columns?columns=title&q='+encoded("Apple' OR true --"));
    t.check(literal.status()===200&&(await literal.json()).items.length===0,'SQL-looking search value remains a bound value in every arm');
    const quoted=await t.get('/product-columns?columns=title&q='+encoded("O'Reilly"));t.check(quoted.status()===200&&(await quoted.json()).items.length===0,'Quoted legitimate search is processed normally');
  },
  R0006:async t=>{
    const normal=await t.get('/product-filter?comparator='+encoded('=')+'&value=1');
    t.check(normal.status()===200&&(await normal.json()).items.map(item=>item.id).join(',')==='1','Normal bound integer comparison returns its public row');
    const altered=await t.get('/product-filter?comparator='+encoded('= $1 OR private = true --')+'&value=1');
    t.check(await hasCanary(altered,t)===t.v,'PostgreSQL comparator changes the protected-row filter only in V');
    if(!t.v)t.check(altered.status()===400,'Unregistered SQL comparator is refused');
    const legitimate=await t.get('/product-filter?comparator='+encoded('<=')+'&value=2');
    t.check(legitimate.status()===200&&(await legitimate.json()).items.map(item=>item.id).join(',')==='1,2','Registered non-equality operator returns only public rows');
    t.check((await t.get('/product-filter?comparator='+encoded('=')+'&value='+encoded('1 OR true'))).status()===400,'Comparator case does not expose SQL value concatenation');
  },
  R0121:async t=>{
    const normal=await t.get('/public-document?filename=readme.txt');t.check(normal.status()===200&&(await normal.text())==='Public boundary guide','Normal actual filesystem read works');
    const escaped=await t.get('/public-document?filename='+encoded('../private/report.txt'));
    t.check(await hasCanary(escaped,t)===t.v,'Parent-segment path reads actual sibling private fixture only in V');
    if(!t.v)t.check(escaped.status()===403,'Canonical path outside the public root is denied');
    const safe=await t.get('/public-document?filename='+encoded('archive/../readme.txt'));
    t.check(safe.status()===200&&(await safe.text())==='Public boundary guide','Canonical root-internal parent segment remains a legal path');
    const quoted=await t.get('/public-document?filename='+encoded("quarter'notes.txt"));t.check(quoted.status()===200&&(await quoted.text())==='Quoted filename guide','Quoted real filename remains usable');
    t.check((await t.get('/public-document?filename='+encoded('../../../../etc/passwd'))).status()===403,'Outer fixture boundary is enforced in every arm');
    t.check((await t.get('/public-document?filename=linked-report.txt')).status()===403,'Relative-path case does not also permit a symlink defect');
    const repeated=await t.get('/public-document?filename='+encoded('../private/report.txt'));t.check(await hasCanary(repeated,t)===t.v,'Filesystem behavior is stable when the boundary request is repeated');
  },
  R0123:async t=>{
    t.check((await (await t.get('/encoded-document?urlPath=readme.txt')).text())==='Public boundary guide','Normal encoded-document read works');
    const payload='%2e%2e%2fprivate%2freport.txt',decoded=await t.get('/encoded-document?urlPath='+encoded(payload));
    t.check(await hasCanary(decoded,t)===t.v,'Additional real URL decode escapes the earlier public-root check only in V');
    if(!t.v)t.check(decoded.status()===403,'Decoded path is checked against the public root');
    const direct=await t.get('/encoded-document?urlPath='+encoded('../private/report.txt'));t.check(direct.status()===403,'Direct parent traversal is rejected in every arm before the normalization difference');
    const space=await t.get('/encoded-document?urlPath='+encoded('public-note%20space.txt'));t.check(space.status()===200&&(await space.text())==='Space filename guide','Expected application decode preserves legitimate encoded spaces');
    const percent=await t.get('/encoded-document?urlPath='+encoded('literal%25.txt'));t.check(percent.status()===200&&(await percent.text())==='Percent filename guide','Encoded literal percent names remain readable');
    t.check((await t.get('/encoded-document?urlPath='+encoded('%malformed'))).status()===400,'Malformed application encoding is rejected');
    t.check((await t.get('/encoded-document?urlPath=linked-report.txt')).status()===403,'Decode case does not introduce a separate symlink bypass');
  },
  R0126:async t=>{
    const publicLink=await t.get('/linked-document?link=guide-link.txt');t.check(publicLink.status()===200&&(await publicLink.text())==='Public boundary guide','Actual allowed symlink is followed in every arm');
    const privateLink=await t.get('/linked-document?link=linked-report.txt');t.check(await hasCanary(privateLink,t)===t.v,'Actual symlink target outside the public root is read only in V');
    if(!t.v)t.check(privateLink.status()===403,'Resolved target is checked against the public root');
    t.check((await t.get('/linked-document?link='+encoded('../private/report.txt'))).status()===403,'Input lexical path is checked in every arm');
    const direct=await t.get('/linked-document?link=readme.txt');t.check(direct.status()===200&&(await direct.text())==='Public boundary guide','Regular public files still work after a link denial');
    const repeated=await t.get('/linked-document?link=linked-report.txt');t.check(await hasCanary(repeated,t)===t.v,'Repeated actual link resolution remains stable');
  },
  R0135:async t=>{
    t.check((await (await t.get('/site-static/readme.txt')).text())==='Public site guide','Default relative-static fixture serves the public guide');
    t.check((await t.get('/site-static/report.txt')).status()===404,'Reset selects the ordinary directory with no report');
    await t.page.goto(t.base+'/static-context');const form=t.page.locator('#static-context');
    t.check((await form.getAttribute('method'))==='post'&&(await form.getAttribute('action'))===new URL(t.base).pathname+'/static-context','Normal context form targets its implemented POST operation');
    const choices=await form.locator('select[name=workingDirectory] option').evaluateAll(options=>options.map(option=>option.value).sort());
    t.check(choices.join(',')==='preview,site','Both legitimate context choices are discoverable from the normal form in every arm');
    const formSource=await t.page.content();t.check(!formSource.includes(t.c)&&!formSource.includes(t.record.root)&&!formSource.includes('report.txt'),'Normal context form contains no protected filename or private case truth');
    const preview=await t.post('/static-context',{workingDirectory:'preview'});t.check(preview.status()===200&&(await preview.json()).context==='preview','Finite alternate deployment context can be selected normally');
    t.check((await (await t.get('/site-static/readme.txt')).text())==='Public site guide','Normal public guide is preserved after middleware reconstruction');
    const report=await t.get('/site-static/report.txt');t.check(await hasCanary(report,t)===t.v,'Real static factory resolves relative public against alternate cwd only in V');
    if(!t.v)t.check(report.status()===404,'Absolute public root excludes the alternate internal report');
    t.check((await t.post('/static-context',{workingDirectory:'../../private'})).status()===400,'Arbitrary working directories cannot be selected');
    await t.post('/static-context',{workingDirectory:'site'});t.check((await t.get('/site-static/report.txt')).status()===404,'Switching back reconstructs the ordinary middleware and removes the exposed path');
    t.record.relativeStaticEvidence={construction:'express.static factory after finite context change',defaultDirectory:'site',alternateDirectory:'preview',secretExposed:t.v,cwdRestoredSynchronously:true};
  },
  R0137:async t=>{
    const normal=await t.get('/uri-document?uri='+encoded('guide:readme'));t.check(normal.status()===200&&(await normal.text())==='Public boundary guide','Allowed resource URI reads the actual public guide');
    const file=await t.get('/uri-document?uri='+encoded('file://'+fixture+'/private/report.txt'));t.check(await hasCanary(file,t)===t.v,'Actual fileURLToPath/fs.readFile loads private fixture from HTTP URI only in V');
    if(!t.v)t.check(file.status()===403,'Unsupported file scheme is rejected before filesystem access');
    const quote=await t.get('/uri-document?uri='+encoded('guide:quoted'));t.check(quote.status()===200&&(await quote.text())==='Quoted filename guide','Normal URI alias for a quoted file remains usable');
    t.check((await t.get('/uri-document?uri='+encoded('https://example.invalid/guide'))).status()===403,'Network schemes never cause external fixture connections');
    t.check((await t.get('/uri-document?uri='+encoded('file:///etc/passwd'))).status()===403,'Even V cannot read outside the finite local fixture');
    t.check((await t.get('/uri-document?uri='+encoded('guide:unknown'))).status()===404,'Unregistered guide resource does not become an arbitrary path');
  },
  R0138:async t=>{
    t.check((await t.get('/mounted-document?mountId=alice')).status()===401,'Filesystem mount requires an authenticated principal');
    await t.login();const own=await t.get('/mounted-document?mountId=alice');t.check(own.status()===200&&(await own.text())==='alice filesystem note','Alice can read the real file from her own mount');
    const other=await t.get('/mounted-document?mountId=bob');t.check(await hasCanary(other,t)===t.v,'Client-selected mount discloses another principal actual file only in V');
    if(!t.v)t.check(other.status()===403,'Server binds mount to its authenticated principal');
    t.check((await t.get('/mounted-document?mountId='+encoded('../bob'))).status()===400,'Mount selector is finite and not a filesystem path');
    await t.post('/logout',{});await t.login('bob');const bob=await t.get('/mounted-document?mountId=bob');t.check(bob.status()===200&&(await bob.text())===t.c,'Actual owner can read the same protected file in every arm');
  },
  R0247:t=>jwtCheck(t,'aud','calendar-api'),
  R0248:t=>jwtCheck(t,'iss','partner-idp'),
  R0249:t=>jwtCheck(t,'typ','id+jwt'),
  R0368:async t=>{
    const normal=await t.get('/return-redirect?returnUrl=return-complete',{maxRedirects:0});
    t.check(normal.status()===302&&new URL(normal.headers().location).origin===new URL(t.target).origin,'Normal Location resolves to the same local service');
    await t.page.goto(t.base+'/return-redirect?returnUrl=return-complete');t.check((await t.page.locator('#return-complete').textContent())==='Return completed','Normal browser navigation completes');
    const destination=t.attacker+'/local-return',redirect=await t.get('/return-redirect?returnUrl='+encoded(destination),{maxRedirects:0});
    t.check((redirect.status()===302&&redirect.headers().location===destination)===t.v,'Actual Location accepts the other local HTTPS origin only in V');
    await t.page.goto(t.base+'/return-redirect?returnUrl='+encoded(destination));
    t.check((new URL(t.page.url()).origin===new URL(t.attacker).origin)===t.v,'Browser actually reaches the separate local listener only in V');
    const outside=await t.get('/return-redirect?returnUrl='+encoded('https://example.invalid/return'),{maxRedirects:0});
    t.check((outside.status()===302&&new URL(outside.headers().location).origin==='https://example.invalid')===t.v,'External URL scheme/origin is verified from the response without following it');
    const safe='return-complete?note='+encoded('https://example.invalid/return');await t.page.goto(t.base+'/return-redirect?returnUrl='+encoded(safe));
    t.check(new URL(t.page.url()).origin===new URL(t.target).origin&&(await t.page.locator('#return-complete').textContent())==='Return completed','URL-looking query text does not change a permitted relative destination');
    t.check((await t.get('/return-redirect?returnUrl='+encoded('return-complete\r\nInjected: yes'),{maxRedirects:0})).status()===400,'Redirect case excludes response header injection in every arm');
  },
  R0497:async t=>{
    const initial=await t.oracle();t.check(initial.caseState.boundaries.numericOperations.length===0,'Reset contains no NaN operation receipts');
    const normal=await t.get('/limited-records?numericValue=3');t.check(normal.status()===200&&(await normal.json()).items.length===3,'Normal numeric count reads exactly three actual rows');
    const max=await t.get('/limited-records?numericValue=5');t.check(max.status()===200&&(await max.json()).items.length===5,'Inclusive legitimate upper numeric boundary remains functional');
    const nan=await t.get('/limited-records?numericValue=NaN');t.check(await hasCanary(nan,t)===t.v,'Actual NaN range and loop comparisons return the protected twelfth row only in V');
    if(t.v)t.check((await (await t.get('/limited-records?numericValue=not-a-number')).json()).items.length===12,'A second failed Number conversion follows the same bounded NaN path');
    else t.check(nan.status()===400,'Fixed conversion failure is rejected before processing');
    const receipts=(await t.oracle()).caseState.boundaries.numericOperations;t.check((receipts.length>0)===t.v,'Actual PostgreSQL operation receipts attest that NaN processing occurred only in V');
    t.check((await t.get('/limited-records?numericValue=6')).status()===400&&(await t.get('/limited-records?numericValue=Infinity')).status()===400,'Over-limit and infinite requests are rejected in every arm');
    t.check((await t.get('/limited-records?numericValue=1.5')).status()===400,'Finite fractional count is not a second defect');
    t.check((await (await t.get('/limited-records?numericValue=0')).json()).items.length===0,'Zero is a legitimate empty request without a fallback');
    t.record.numericEvidence={engine:'JavaScript Number and NaN comparisons',physicalRowGuard:12,legitimateMaximum:5,nanOperationReceipts:receipts.length,nativeMemoryClaim:false};
  },
  R0498:async t=>{
    const normal=await t.get('/precision-object?objectId=42');t.check(normal.status()===200&&(await normal.json()).body==='Ordinary object','Ordinary exact identifier retrieves the intended actual row');
    const collision=await t.get('/precision-object?objectId=9007199254740992'),object=await collision.json();
    t.check(collision.status()===200&&(object.body===t.c&&object.objectId==='9007199254740993')===t.v,'Actual Number Map key collision makes distinct bigint IDs reference the private row only in V');
    if(!t.v)t.check(object.objectId==='9007199254740992'&&object.body==='Large public object','Fixed string key preserves the exact authorized large identifier');
    t.check((await t.get('/precision-object?objectId=9007199254740993')).status()===403,'Private identifier is directly denied in every arm before key conversion');
    const safe=await t.get('/precision-object?objectId=9007199254740994');t.check(safe.status()===200&&(await safe.json()).body==='Another large public object','Another representable large identifier remains distinct');
    t.check((await t.get('/precision-object?objectId=9.007199254740992e15')).status()===400,'ID grammar never treats exponent text as a decimal identifier');
    t.check((await t.get('/precision-object?objectId=9223372036854775808')).status()===400,'Identifier over the real PostgreSQL bigint domain is rejected');
    t.record.precisionEvidence={storedIds:['9007199254740992','9007199254740993'],returnedId:object.objectId,storage:'PostgreSQL bigint',lookup:t.v?'JavaScript Number Map':'exact string Map',nativeMemoryClaim:false};
  },
  R0499:async t=>{
    t.check((await (await t.get('/decimal-invoice')).json()).invoice===null&&(await t.oracle()).caseState.boundaries.invoices.length===0,'Reset has no saved quote or line records');
    const normal=await t.post('/decimal-invoice',{money:'0.10,0.20'}),normalData=await normal.json();t.check(normal.status()===201&&normalData.totalMinor===30&&normalData.lineMinor.join(',')==='10,20','Ordinary decimal quote preserves minor-unit consistency');
    const attack=await t.post('/decimal-invoice',{money:'0.335,0.335,0.335'}),created=await attack.json(),stored=(await (await t.get('/decimal-invoice')).json()).invoice;
    const lineSum=stored.lines.reduce((sum,line)=>sum+line.amountMinor,0);
    t.check(attack.status()===201&&stored.id===created.id&&(stored.totalMinor!==lineSum)===t.v,'Actual saved invoice total differs from its saved detail amounts only in V');
    t.check(stored.lines.map(line=>line.amountMinor).join(',')==='34,34,34','Three legal decimal line items are rounded to declared per-line minor units');
    if(!t.v)t.check(stored.totalMinor===102&&lineSum===102,'Fixed integer-minor sum follows the per-line half-up rule');
    const oracle=await t.oracle(),header=oracle.caseState.boundaries.invoices.find(item=>item.id===created.id),lines=oracle.caseState.boundaries.invoiceLines.filter(item=>item.invoice_id===created.id);
    t.check(header.total_minor===stored.totalMinor&&lines.reduce((sum,line)=>sum+line.amount_minor,0)===lineSum,'Independent actual PostgreSQL header/detail records confirm the returned mismatch');
    const boundary=await t.post('/decimal-invoice',{money:'1000.000'}),bounded=await boundary.json();t.check(boundary.status()===201&&bounded.totalMinor===100000&&bounded.lineMinor[0]===100000,'Inclusive monetary upper boundary remains usable');
    const before=oracle.caseState.boundaries.invoices.length;const invalid=await t.post('/decimal-invoice',{money:'-0.01'});t.check(invalid.status()===400&&(await t.oracle()).caseState.boundaries.invoices.length===before+1,'Invalid negative money creates no invoice after the legitimate boundary quote');
    t.check((await t.post('/decimal-invoice',{money:'1000.001'})).status()===400,'Over-limit amount is rejected before database mutation');
    t.record.roundingEvidence={totalMinor:stored.totalMinor,lineSumMinor:lineSum,lines:stored.lines.map(line=>line.amountMinor),storage:'actual PostgreSQL header and details',nativeMemoryClaim:false};
  },
  R0500:async t=>{
    const normal=await t.get('/indexed-document?index=0');t.check(normal.status()===200&&(await normal.json()).document==='First public document','Normal array index selects the first public document');
    const last=await t.get('/indexed-document?index=1');t.check(last.status()===200&&(await last.json()).document==='Second public document','Inclusive public upper index remains usable');
    const negative=await t.get('/indexed-document?index=-1');t.check(await hasCanary(negative,t)===t.v,'Actual Array.at negative index selects the forbidden tail document only in V');
    if(!t.v)t.check(negative.status()===400,'Fixed array index must be nonnegative');
    t.check((await t.get('/indexed-document?index=2')).status()===400,'Direct positive index of the protected tail is denied in every arm');
    t.check((await t.get('/indexed-document?index=1.5')).status()===400&&(await t.get('/indexed-document?index=-99')).status()===400,'Fractional and physically out-of-range inputs are rejected');
    const zero=await t.get('/indexed-document?index=-0');t.check(zero.status()===200&&(await zero.json()).document==='First public document','Negative-zero text denotes the same legal zero index');
    t.record.arrayEvidence={lookup:'actual JavaScript Array.at',publicIndices:[0,1],prohibitedIndex:2,negativeTailRead:t.v,nativeMemoryClaim:false};
  }
};

async function jwtCheck(t,claim,alternateValue) {
  t.check((await t.get('/access-pass')).status()===401,'Token issuers require an authenticated normal principal');
  await t.login();const normal=(await (await t.get('/access-pass')).json()).token,alternate=(await (await t.get('/connected-pass')).json()).token;
  const parts=alternate.split('.'),header=JSON.parse(Buffer.from(parts[0],'base64url')),body=JSON.parse(Buffer.from(parts[1],'base64url'));
  t.check((claim==='typ'?header.typ:body[claim])===alternateValue,'Alternate fixture contains the intended genuine claim difference');
  const normalResult=await t.get('/account-report',authorization(normal));t.check(normalResult.status()===200&&await hasCanary(normalResult,t),'Normal strongly signed access token reads its authorized account report');
  const connected=await t.get('/connected-report',authorization(alternate));t.check(connected.status()===200&&(await connected.json()).username==='alice','Alternate token is genuinely valid in its own intended service or identity function');
  const confused=await t.get('/account-report',authorization(alternate));t.check(await hasCanary(confused,t)===t.v,'Actual signed alternate token crosses only the selected validation boundary in V');
  if(!t.v)t.check(confused.status()===401,'Fixed validator refuses the wrong intended audience, issuer or token purpose');
  const mutated={...body,sub:'bob'},forged=parts[0]+'.'+Buffer.from(JSON.stringify(mutated)).toString('base64url')+'.'+parts[2];
  t.check((await t.get('/account-report',authorization(forged))).status()===401,'Unsigned body mutation is rejected by actual HMAC verification in every arm');
  const changedHeader={...header,alg:'none'},none=Buffer.from(JSON.stringify(changedHeader)).toString('base64url')+'.'+parts[1]+'.';
  t.check((await t.get('/account-report',authorization(none))).status()===401,'Claim validation case does not also expose alg=none bypass');
  t.check((await t.get('/account-report',authorization(normal))).status()===200,'Normal access still works after rejected token variants');
  t.record.jwtBoundaryEvidence={selectedClaim:claim,alternateValue,signature:'actual HS256 using high-entropy run key',ownServiceAccepted:true,memberServiceAlternateAccepted:t.v,tokenValuesOmitted:true};
}
