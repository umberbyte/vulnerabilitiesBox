const row=(data,key,id)=>data[key].find(x=>x.id===id);
const state=async(t,path)=>(await t.get(path)).json();
const balance=async(t,name='alice')=>(await t.oracle()).users.find(x=>x.name===name).balance;
const operation=async(t,name,action)=>(await t.oracle()).operations.filter(x=>x.username===name&&x.action===action).length;
const switchTo=async(t,name)=>{await t.post('/logout',{});await t.login(name);};
const reset=async(t,path,predicate,label)=>{await t.ctl('/reset',{root:t.record.root,mode:t.mode,seed:'acceptance-v1'});t.check((await t.get(path)).status()===401,'Reset invalidates earlier sessions');await t.login();t.check(predicate(await state(t,path)),label);};
export const checks={
  R0272:async t=>{
    t.check((await t.get('/folders/10/children/100')).status()===401,'Parent-child reader requires authentication');await t.login();
    t.check((await state(t,'/folders/10/children/100')).body==='Child within parent','Normal child in an authorized parent is read from PostgreSQL');
    const attack=await t.get('/folders/10/children/101');t.check((attack.status()===200&&(await attack.text()).includes(t.c))===t.v,'Only V substitutes a different authorized child into the authorized parent URL');
    t.check((await state(t,'/folders/11/children/101')).body===t.c,'Same child is legitimately readable through its actual authorized parent in all arms');
    t.check((await t.get('/folders/10/children/102')).status()===403,'Child-specific owner/ACL remains enforced even in V');
    t.check((await t.get('/folders/30/children/101')).status()===403,'Parent tenant and parent ACL remain enforced');
    await switchTo(t,'bob');t.check((await state(t,'/folders/10/children/104')).body==='Explicit shared child','Explicitly shared parent and child remain a legal cross-owner read');
    t.check((await t.get('/folders/10/children/100')).status()===403,'Shared parent alone does not grant access to a private child');
    await reset(t,'/folders',d=>d.folders.some(x=>x.id===10),'Reset recreates original parent fixtures');
  },
  R0280:async t=>{
    await t.login();t.check(row(await state(t,'/capability-documents'),'documents',1).body==='Alice working note','Original real document exists after reset');
    const schema=await state(t,'/openapi.json'),workspace=new URL(t.base).pathname;
    const examples=operation=>Object.fromEntries(Object.entries(operation.requestBody.content['application/json'].schema.properties).map(([name,property])=>[name,property.example]));
    const normalCreate=examples(schema.paths[workspace+'/capability-links'].post),normalEdit=examples(schema.paths[workspace+'/capability-view/{value}'].post);
    const issued=await t.post('/capability-links',normalCreate),write=await issued.json();t.check(issued.status()===200&&normalCreate.role==='write'&&write.role==='write','Published OpenAPI normal issuance creates a genuine write capability');
    const read=await(await t.post('/capability-links',{document:1,role:'read'})).json();
    t.check(read.role==='read'&&write.role==='write'&&read.token!==write.token,'Owner issues distinct bounded read and explicit write capabilities');
    await switchTo(t,'bob');t.check((await state(t,'/capability-view/'+read.token)).body==='Alice working note','Explicit read sharing is a normal cross-owner operation');
    t.check((await t.post('/capability-view/'+write.token,normalEdit)).status()===200,'Published OpenAPI normal edit succeeds with its issued capability in every arm');
    t.check((await state(t,'/capability-view/'+write.token)).body===normalEdit.body,'Published normal edit persists its actual document body');
    const changed=await t.post('/capability-view/'+read.token,{body:'Read capability mutation'});t.check((changed.status()===200)===t.v,'Read-only capability modifies a real document only in V');
    const current=await state(t,'/capability-view/'+read.token);t.check(current.body===(t.v?'Read capability mutation':normalEdit.body),'Stored document state proves the capability upper-bound result');
    t.check((await t.post('/capability-view/'+write.token,{body:'Authorized write share'})).status()===200,'Explicit edit sharing remains usable in every arm');
    t.check((await state(t,'/capability-view/'+write.token)).body==='Authorized write share','Legitimate shared edit changes actual persisted document');
    t.check((await t.post('/capability-view/not-a-real-token',{body:'Invalid token write'})).status()===403,'Unknown capability never grants write access');
    t.check((await t.post('/capability-links',{document:1,role:'write'})).status()===403,'Only the actual owner may issue capabilities');
    await switchTo(t,'carol');t.check((await t.post('/capability-view/'+write.token,{body:'Cross tenant edit'})).status()===403,'Cross-tenant writes remain outside the capability workflow');
    await reset(t,'/capability-documents',d=>d.links.length===0&&row(d,'documents',1).body==='Alice working note'&&row(d,'documents',2).body===t.c,'Reset removes capabilities and restores real document content');
    t.check((await t.get('/capability-view/'+read.token)).status()===404,'Earlier capability is unusable after reset');
  },
  R0282:async t=>{
    await t.login();const created=await t.post('/delegations',{delegate:'bob',ids:[1]}),grant=(await created.json()).delegation;
    t.check(created.status()===200&&typeof grant==='string','Owner creates a real scoped delegation');
    t.check((await t.post('/delegations',{delegate:'carol',ids:[1]})).status()===403,'Cross-tenant delegation remains prohibited');
    t.check((await t.post('/delegations',{delegate:'bob',ids:[3]})).status()===403,'Delegator cannot authorize someone else’s document');
    await switchTo(t,'bob');t.check((await t.post('/delegated-documents/1',{delegation:grant,body:'Within delegated scope'})).status()===200,'Delegate updates the legitimately delegated document');
    const attack=await t.post('/delegated-documents/2',{delegation:grant,body:'Beyond delegated scope'});t.check((attack.status()===200)===t.v,'Valid delegation reaches another document of the same principal only in V');
    t.check((await t.post('/delegated-documents/4',{delegation:grant,body:'Other tenant'})).status()===403,'Current principal ownership and tenant checks remain active');
    t.check((await t.post('/delegated-documents/1',{delegation:'unknown',body:'Invalid delegation'})).status()===403,'Non-issued delegation cannot mutate a document');
    await switchTo(t,'alice');const docs=await state(t,'/delegations');t.check(row(docs,'documents',1).body==='Within delegated scope','Legitimate delegated update persisted');t.check(row(docs,'documents',2).body===(t.v?'Beyond delegated scope':t.c),'DB document readback proves the target-set boundary');
    t.check((await t.post('/delegated-documents/1',{delegation:grant,body:'Wrong agent'})).status()===403,'A principal cannot reuse their own grant as the designated delegate');
    await reset(t,'/delegations',d=>d.delegations.length===0&&row(d,'documents',1).body==='Alice working note'&&row(d,'documents',2).body===t.c,'Reset removes delegation and restores all document updates');
  },
  R0283:async t=>{
    await t.login();t.check((await state(t,'/team-folders/20/children/202')).body==='Inherited public child','Public-parent inheritance serves a real child normally');
    const attack=await t.get('/team-folders/20/children/201');t.check((attack.status()===200&&(await attack.text()).includes(t.c))===t.v,'Explicit private child ACL is replaced by public-parent ACL only in V');
    t.check((await t.get('/team-folders/10/children/201')).status()===403,'Parent-child membership is always enforced in the ACL case');
    await switchTo(t,'bob');t.check((await state(t,'/team-folders/20/children/201')).body===t.c,'The explicit child owner legitimately reads the private child in every arm');
    await switchTo(t,'carol');t.check((await t.get('/team-folders/20/children/202')).status()===403,'A public folder remains bounded by its tenant');
    await reset(t,'/team-folders',d=>d.folders.some(x=>x.id===20),'Reset restores the shared-parent ACL fixture');
  },
  R0285:async t=>{
    await t.login();t.check(row(await state(t,'/movable-documents'),'documents',1).parent===10,'Reset initializes the real source folder');
    t.check((await t.post('/movable-documents/1/move',{destination:11})).status()===200,'Owner moves a document to an authorized destination');
    t.check(row(await state(t,'/movable-documents'),'documents',1).parent===11,'Authorized destination is actually saved');
    t.check((await t.post('/movable-documents/3/move',{destination:11})).status()===403,'Move always authorizes the source object');
    const response=await t.post('/movable-documents/2/move',{destination:30});t.check((response.status()===200)===t.v,'Owner can move a source into another tenant only when destination authorization is missing');
    const moved=row(await state(t,'/movable-documents'),'documents',2);t.check(moved.parent===(t.v?30:10)&&moved.tenant===(t.v?'B':'A'),'Real folder and tenant update proves destination authorization boundary');
    t.check((await t.post('/movable-documents/1/move',{destination:99999})).status()===403,'Nonexistent destinations are never accepted');
    await reset(t,'/movable-documents',d=>row(d,'documents',1).parent===10&&row(d,'documents',2).parent===10&&row(d,'documents',2).tenant==='A','Reset restores source folders and tenant ownership');
  },
  R0287:async t=>{
    await t.login();t.check((await state(t,'/retained-documents/2')).body===t.c,'Document is normally accessible before logical deletion');
    t.check((await t.post('/retained-documents/2/delete',{})).status()===200,'Owner logically deletes the actual DB document');
    t.check(!(await state(t,'/retained-documents')).documents.some(x=>x.id===2),'Ordinary document listing filters deleted rows in every arm');
    const attack=await t.get('/retained-documents/2');t.check((attack.status()===200&&(await attack.text()).includes(t.c))===t.v,'Direct normal lookup discloses the deleted document only in V');
    t.check((await state(t,'/retained-documents/1')).body==='Alice working note','Nondeleted document remains usable');
    t.check((await t.get('/retained-documents/3')).status()===403,'Owner authorization remains enforced on all retained rows');
    t.check((await t.get('/retained-documents/trash')).status()===403,'Ordinary member cannot use administrator trash view');
    await switchTo(t,'admin');t.check(row(await state(t,'/retained-documents/trash'),'documents',2).body===t.c,'Administrator legitimately sees the actual deleted record in trash');
    await reset(t,'/retained-documents',d=>row(d,'documents',2).body===t.c,'Reset removes logical-deletion state');
  },
  R0300:async t=>claimedManagement(t,'/operations-console',{headers:{'x-internal-role':'admin'}},{headers:{'x-internal-role':'viewer'}},{}),
  R0301:async t=>claimedManagement(t,'/network-console',{headers:{'x-forwarded-for':'127.0.0.1, 198.51.100.7'}},{headers:{'x-forwarded-for':'198.51.100.7, 127.0.0.1'}},{}),
  R0303:async t=>claimedManagement(t,'/feature-console',{}, {},{featureFlag:true}, {featureFlag:false}),
  R0305:async t=>{
    await t.login();const data=await state(t,'/available-resources');t.check(data.resources.some(x=>x.id===1)&&data.resources.some(x=>x.id===5),'Owner data and same-tenant public data remain normally available');
    t.check(data.resources.some(x=>x.id===4&&x.tenant==='B'&&x.body===t.c)===t.v,'Actual OR grouping includes another tenant’s public row only in V');
    t.check(!data.resources.some(x=>x.id===3),'Private same-tenant nonowner resource stays inaccessible');
    const search=await(await t.post('/available-resources/search',{query:'Guide'})).json();t.check(search.resources.length===1&&search.resources[0].id===5,'Explicit same-tenant public sharing remains a legal cross-owner result');
    const quoted=await t.post('/available-resources/search',{query:"' OR public=true --"});t.check(quoted.status()===200&&(await quoted.json()).resources.length===0,'SQL-looking search text is data, not another injection defect');
    await switchTo(t,'carol');const carol=await state(t,'/available-resources');t.check(carol.resources.some(x=>x.id===4),'Same row remains normally available to its own tenant');
    await reset(t,'/available-resources',d=>d.resources.some(x=>x.id===1)&&d.resources.some(x=>x.id===5),'Reset restores normal tenant resources');
  },
  R0306:async t=>{
    await t.login();const normal=(await(await t.post('/approval-requests',{amount:100})).json()).id;
    t.check((await t.post('/approval-requests/'+normal+'/approve',{})).status()===403,'Ordinary requester cannot approve even their own request');
    await switchTo(t,'approver');t.check((await t.post('/approval-requests/'+normal+'/approve',{})).status()===200,'Independent subject with approval role normally approves a request');
    t.check(row(await state(t,'/approval-requests'),'requests',normal).approved_by==='approver','Actual approval state records its authorized approving principal');
    const own=(await(await t.post('/approval-requests',{amount:200})).json()).id,attack=await t.post('/approval-requests/'+own+'/approve',{approver:'admin'});
    t.check((attack.status()===200)===t.v,'Approval role holder can approve their own request only in V');
    const current=row(await state(t,'/approval-requests'),'requests',own);t.check(current.state===(t.v?'approved':'submitted')&&current.approved_by===(t.v?'approver':null),'Stored state proves self-approval and ignores body approver impersonation');
    if(!t.v){await switchTo(t,'admin');t.check((await t.post('/approval-requests/'+own+'/approve',{})).status()===200,'Another authorized approver can approve the previously rejected self-request');}
    t.check((await t.post('/approval-requests/'+normal+'/approve',{})).status()===409,'Approval transition is single use in all arms');
    await reset(t,'/approval-requests',d=>d.requests.length===0,'Reset clears all request and approval records');
  },
  R0307:async t=>{
    await t.login();const initial=await state(t,'/role-payments');t.check(initial.roles.includes('payment-creator')&&initial.roles.includes('payment-releaser'),'Conflicting role membership is an actual server-side fixture');
    const attack=await t.post('/role-payments/1/release',{});t.check((attack.status()===200)===t.v,'Server role combination bypasses exclusivity only in V');
    t.check(row(await state(t,'/role-payments'),'payments',1).released_by===(t.v?'alice':null),'Stored release principal proves the role composition effect');
    await switchTo(t,'bob');t.check((await t.post('/role-payments/2/release',{roles:['payment-releaser']})).status()===403,'Client role declarations do not replace server membership in any arm');
    await switchTo(t,'approver');t.check((await t.post('/role-payments/2/release',{})).status()===200,'Exclusive payment releaser legitimately performs the same action');
    t.check(row(await state(t,'/role-payments'),'payments',2).released_by==='approver','Legitimate release persists in the actual payment record');
    t.check((await t.post('/role-payments/2/release',{})).status()===409,'Release cannot be applied twice');
    await switchTo(t,'carol');t.check((await t.post('/role-payments/3/release',{})).status()===403,'Unassigned tenant member has no release role');
    await reset(t,'/role-payments',d=>d.payments.every(x=>x.released_by===null),'Reset clears release effects while preserving server role assignments');
  },
  R0308:async t=>{
    await t.login();t.check((await t.post('/policy-tasks',{action:'rebuild',policyFault:true})).status()===403,'A client fault sentinel does not affect evaluation of the actual valid policy');
    t.check((await t.post('/policy-documents',{document:'{'})).status()===403,'Ordinary user cannot corrupt the saved policy');
    await switchTo(t,'admin');t.check((await t.post('/policy-tasks',{action:'rebuild'})).status()===200,'Correct policy normally authorizes the administrator');
    t.check(await operation(t,'admin','policy-rebuild')===1,'Normal policy action writes a real operation');
    t.check((await t.post('/policy-documents',{document:'{'})).status()===200,'Authorized policy editor stores genuinely invalid JSON in Redis');
    await switchTo(t,'alice');const attack=await t.post('/policy-tasks',{action:'rebuild'});t.check((attack.status()===200)===t.v,'Actual saved-policy JSON parser exception fails open only in V');
    t.check(await operation(t,'alice','policy-rebuild')===(t.v?1:0),'Persisted operation proves the authorization exception outcome');
    await switchTo(t,'admin');await t.post('/policy-documents',{document:'{"allowedRoles":["admin"]}'});await switchTo(t,'alice');
    t.check((await t.post('/policy-tasks',{action:'rebuild'})).status()===403,'Restoring actual valid policy closes the accidental grant even in V');
    await reset(t,'/policy-tasks',d=>d.recent.length===0,'Reset removes actions and restores the normal valid policy');
    t.check((await t.post('/policy-tasks',{action:'rebuild'})).status()===403,'Reset does not leave the malformed policy behind');
  },
  R0309:async t=>{
    await t.login();const issued=await(await t.post('/integration-keys',{})).json();t.check(issued.scope==='read'&&typeof issued.key==='string','Member receives a real random read-scoped key');
    const schema=await state(t,'/openapi.json'),properties=schema.paths[new URL(t.base).pathname+'/integration-tasks'].post.requestBody.content['application/json'].schema.properties;
    const normalBody=Object.fromEntries(Object.entries(properties).map(([name,property])=>[name,property.example]));
    if(normalBody.key!=='from-own-key')throw new Error('Normal contract must declare the response-derived key placeholder');
    normalBody.key=issued.key;const normal=await t.post('/integration-tasks',normalBody);
    t.check(normal.status()===200&&(await normal.json()).available===true,'Public OpenAPI normal examples succeed after replacing only the key with the actual issued credential');
    t.check((await t.post('/integration-tasks',{key:issued.key,action:'rebuild'})).status()===403,'Read key without a scope override cannot run management actions');
    const attack=await t.post('/integration-tasks',{key:issued.key,action:'rebuild',scope:'manage'});t.check((attack.status()===200)===t.v,'Body scope overrides a verified key’s stored upper bound only in V');
    t.check(await operation(t,'alice','integration-rebuild')===(t.v?1:0),'Real management operation proves the key scope expansion');
    t.check((await t.post('/integration-tasks',{key:'not-issued',action:'rebuild',scope:'manage'})).status()===401,'Scope declaration cannot bypass key validity');
    await switchTo(t,'bob');t.check((await t.post('/integration-tasks',{key:issued.key,action:'rebuild',scope:'manage'})).status()===401,'Key ownership remains bound to the actual authenticated subject');
    await switchTo(t,'admin');const managed=await(await t.post('/integration-keys',{})).json();t.check(managed.scope==='manage'&&(await t.post('/integration-tasks',{key:managed.key,action:'rebuild'})).status()===200,'Administrator’s legitimately issued management scope remains usable');
    await reset(t,'/integration-keys',d=>d.keys.length===0,'Reset removes issued keys and their recorded metadata');
    t.check((await t.post('/integration-tasks',{key:issued.key,action:'read'})).status()===401,'Earlier real key is invalid after reset');
  },
  R0394:async t=>{
    await t.login();t.check(row(await state(t,'/coupon-orders'),'orders',1).price===1000,'Reset initializes actual order price');
    t.check((await t.post('/coupon-orders/3/coupon',{coupon:'WELCOME'})).status()===403,'Coupon application preserves order ownership');
    t.check((await t.post('/coupon-orders/1/coupon',{coupon:'UNKNOWN'})).status()===400,'Only the configured coupon is accepted');
    t.check((await(await t.post('/coupon-orders/1/coupon',{coupon:'WELCOME'})).json()).price===800,'One legitimate coupon reduces the actual price by its declared amount');
    const repeated=await(await t.post('/coupon-orders/1/coupon',{coupon:'WELCOME'})).json();t.check(repeated.price===(t.v?600:800),'Sequential duplicate application gives an extra discount only in V');
    const before=await balance(t),paid=await t.post('/coupon-orders/1/pay',{}),price=t.v?600:800;t.check(paid.status()===200&&(await paid.json()).price===price,'Payment uses the persisted coupon order price');
    const proof=await t.oracle();t.check(await balance(t)===before-price&&proof.orders.some(x=>x.username==='alice'&&x.price===price),'Real user debit and completed order prove the duplicate-discount effect');
    t.check(row(await state(t,'/coupon-orders'),'orders',1).paid===true,'Actual order is marked paid');
    t.check((await t.post('/coupon-orders/1/pay',{})).status()===409&&(await t.post('/coupon-orders/1/coupon',{coupon:'WELCOME'})).status()===409,'Paid orders cannot be paid or discounted again');
    await reset(t,'/coupon-orders',d=>d.applications.length===0&&d.orders.every(x=>x.price===1000&&!x.paid),'Reset clears coupon history and restores prices and payment state');
    t.check(await balance(t)===3000,'Reset restores debited account balance');
  },
  R0396:async t=>{
    await t.login();t.check(row(await state(t,'/callback-orders'),'orders',1).paid===false,'Reset creates unpaid real orders');
    const paid=await t.post('/fixture-payments',{order:1}),notification=(await paid.json()).notification;
    t.check(paid.status()===200&&notification.amount===1000&&notification.currency==='JPY'&&typeof notification.signature==='string','Closed payment source issues a genuine signed receipt with the stored amount');
    t.check(await balance(t)===2000&&row(await state(t,'/callback-orders'),'orders',1).paid===false,'Source charges the user but order awaits authenticated callback');
    t.check((await t.post('/payment-notifications',{...notification,amount:999})).status()===403,'Amount tampering never matches the saved order, including in V');
    t.check((await t.post('/payment-notifications',notification)).status()===200,'Real signed callback completes the normal paid order in every arm');
    t.check(row(await state(t,'/callback-orders'),'orders',1).receipt===notification.receipt,'Completed order records the actual payment receipt');
    t.check((await t.post('/payment-notifications',notification)).status()===409,'Callback completion is one time');
    const before=await balance(t),forged={order:2,amount:1000,currency:'JPY',event:'paid',receipt:'client-supplied-unpaid-receipt'},attack=await t.post('/payment-notifications',forged);
    t.check((attack.status()===200)===t.v,'Unpaid client callback completes an order only without source authentication');
    t.check(row(await state(t,'/callback-orders'),'orders',2).paid===t.v&&await balance(t)===before,'Stored unpaid order becomes paid without any source charge only in V');
    const proof=await t.oracle();t.check(proof.orders.filter(x=>x.username==='alice').length===(t.v?2:1),'Actual completed-order count confirms the forged callback effect');
    t.check((await t.post('/payment-notifications',{...forged,order:3})).status()===403,'Callback preserves actual order ownership');
    t.check((await t.post('/fixture-payments',{order:1})).status()===409,'Closed payment source cannot double-charge a completed order');
    await reset(t,'/callback-orders',d=>d.orders.every(x=>!x.paid&&x.receipt===null),'Reset removes receipt and paid order states');
    t.check(await balance(t)===3000&&(await t.oracle()).orders.length===0,'Reset removes charges and completion records');
    t.check((await t.post('/payment-notifications',{...notification,amount:999})).status()===403,'Old receipt does not bypass saved order amount validation after reset');
  },
  R0404:async t=>{
    await t.login();t.check((await t.post('/versioned-purchases/1/pay',{})).status()===409,'All arms reject an unapproved draft payment');
    t.check((await t.post('/versioned-purchases/1/submit',{})).status()===200,'Owner normally submits a real purchase request');
    t.check((await t.post('/versioned-purchases/1/approve',{})).status()===403,'Owner without approval role cannot approve');
    await switchTo(t,'approver');t.check((await t.post('/versioned-purchases/1/approve',{})).status()===200,'Independent approving principal binds approval to the current content');
    const first=row(await state(t,'/versioned-purchases'),'purchases',1);t.check(first.approved_version===1&&/^[a-f0-9]{64}$/.test(first.approved_hash)&&first.approved_by==='approver','Real approval stores version, content hash, and independent approver');
    await switchTo(t,'alice');t.check((await t.post('/versioned-purchases/1/pay',{})).status()===200&&await balance(t)===2000,'Unchanged approved content normally debits its exact approved amount');
    t.check((await t.post('/versioned-purchases/1/pay',{})).status()===409,'Successful payment cannot repeat');
    await t.post('/versioned-purchases/2/submit',{});await switchTo(t,'approver');await t.post('/versioned-purchases/2/approve',{});await switchTo(t,'alice');
    const edit=await t.post('/versioned-purchases/2/edit',{amount:1200,note:'Updated purchase'});t.check(edit.status()===200&&(await edit.json()).version===2,'Owner edits real important attributes and increments content version');
    const changed=row(await state(t,'/versioned-purchases'),'purchases',2);t.check(changed.amount===1200&&changed.version===2&&changed.approved_version===1,'Persisted current content differs from the actual stored approval');
    const before=await balance(t),attack=await t.post('/versioned-purchases/2/pay',{});t.check((attack.status()===200)===t.v,'Changed amount executes under stale approval only in V');
    t.check(await balance(t)===(t.v?before-1200:before),'Actual user debit uses changed amount only after vulnerable stale-approval acceptance');
    const proof=await t.oracle();t.check(proof.orders.some(x=>x.username==='alice'&&x.price===1200)===t.v,'Completed order records the changed unapproved amount only in V');
    if(!t.v){await t.post('/versioned-purchases/2/submit',{});await switchTo(t,'approver');t.check((await t.post('/versioned-purchases/2/approve',{})).status()===200,'Corrected workflow can obtain independent approval of the changed content');await switchTo(t,'alice');t.check((await t.post('/versioned-purchases/2/pay',{})).status()===200,'Changed request is usable after genuine reapproval');}
    t.check((await t.post('/versioned-purchases/3/edit',{amount:1200,note:'Unauthorized edit'})).status()===409,'Another owner’s request cannot be edited');
    await reset(t,'/versioned-purchases',d=>d.purchases.every(x=>x.version===1&&x.amount===1000&&x.state==='draft'&&x.approved_hash===null&&x.approved_version===null),'Reset clears content revisions, approvals, and paid states');
    t.check(await balance(t)===3000&&(await t.oracle()).orders.length===0,'Reset restores account balance and payment records');
  }
};
async function claimedManagement(t,path,attackOptions,benignOptions,attackBody,benignBody={}) {
  t.check((await t.post(path,{action:'rebuild',...attackBody},attackOptions)).status()===401,'Claimed management attributes do not replace authentication');
  await t.login('admin');t.check((await t.post(path,{action:'rebuild'})).status()===200,'Real administrator performs the normal management action');
  t.check(await operation(t,'admin','rebuild-report')===1,'Legitimate action has a persisted operation');
  await switchTo(t,'alice');t.check((await t.post(path,{action:'rebuild'})).status()===403,'Ordinary authenticated member without a claim cannot manage');
  t.check((await t.post(path,{action:'rebuild',...benignBody},benignOptions)).status()===403,'Harmless display/header values do not grant management permission');
  const attack=await t.post(path,{action:'rebuild',...attackBody},attackOptions);t.check((attack.status()===200)===t.v,'Untrusted claimed management attribute is accepted only in V');
  t.check(await operation(t,'alice','rebuild-report')===(t.v?1:0),'Stored operation proves actual unauthorized management execution');
  const view=await state(t,path);t.check(view.username==='alice'&&view.canRebuild===false&&view.recent.length===(t.v?1:0),'Normal account display remains tied to the genuine session after claimed action');
  t.check((await t.post(path,{action:'unknown',...attackBody},attackOptions)).status()===400,'Only the fixed management action can run');
  await reset(t,path,d=>d.recent.length===0&&!d.canRebuild,'Reset removes claimed management effects');
}
