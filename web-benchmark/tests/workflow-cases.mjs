const member=(state,name)=>state.users.find(u=>u.name===name);
const lastMail=async(t,name='alice',purpose='password-reset')=>(await t.ctl('/mail/'+name)).filter(m=>m.purpose===purpose).at(-1).token;
const recovery=async(t,name='alice')=>{const response=await t.post('/password-help',{username:name});t.check(response.status()===200,'Normal recovery request accepted');return lastMail(t,name);};
const resetPassword=(t,token,username,password)=>t.post('/password-update',{token,username,password});
const purchase=async(t,id)=>(await (await t.get('/purchase-requests')).json()).requests.find(r=>r.id===id);

export const checks={
  R0202:async t=>{
    await t.login();const history=(await (await t.get('/account-history')).json()).archivedRecoveryMessages;
    t.check(history.length===1&&Date.parse(history[0].expiresAt)<Date.now(),'Own historical recovery token is genuinely expired');
    const current=await recovery(t);const normal=await resetPassword(t,current,'alice','Normal-recovery-2026!');t.check(normal.status()===200&&member(await t.oracle(),'alice').password==='Normal-recovery-2026!','Current token changes actual member password');
    await resetPassword(t,history[0].token,'alice','Expired-recovery-2026!');t.check((member(await t.oracle(),'alice').password==='Expired-recovery-2026!')===t.v,'Genuinely expired token changes DB password only in V');
    t.check((await resetPassword(t,current,'alice','Reused-recovery-2026!')).status()===400,'Valid recovery token remains single use');
    const password=t.v?'Expired-recovery-2026!':'Normal-recovery-2026!';await t.post('/logout',{});const result=await t.post('/login',{username:'alice',password});t.check(result.status()===200&&(await (await t.get('/session')).json()).username==='alice','Changed password is usable for actual login');
  },
  R0203:async t=>{
    await t.login();await t.post('/email-check',{});const first=await lastMail(t,'alice','email-confirm');t.check((await t.post('/email-confirm',{token:first})).status()===200,'Normal email verification completes');
    t.check((await t.oracle()).operations.some(o=>o.username==='alice'&&o.action==='email-confirmed'),'Normal verification persists actual operation');
    const current=await recovery(t);await resetPassword(t,current,'alice','Purpose-normal-2026!');t.check(member(await t.oracle(),'alice').password==='Purpose-normal-2026!','Normal password-reset purpose changes password');
    await t.post('/email-check',{});const other=await lastMail(t,'alice','email-confirm');await resetPassword(t,other,'alice','Purpose-confused-2026!');t.check((member(await t.oracle(),'alice').password==='Purpose-confused-2026!')===t.v,'Email-verification capability changes actual password only in V');
    const normalConfirmation=await t.post('/email-confirm',{token:other});t.check(normalConfirmation.status()===(t.v?400:200),'Wrong-purpose refusal preserves intended verification use');
  },
  R0204:async t=>{
    const current=await recovery(t);t.check((await resetPassword(t,current,'alice','Subject-normal-2026!')).status()===200,'Normal token-bound subject update succeeds');
    const ownToken=await recovery(t);await resetPassword(t,ownToken,'bob','Subject-takeover-2026!');const state=await t.oracle();
    t.check((member(state,'bob').password==='Subject-takeover-2026!')===t.v,'Body username changes different token subject only in V');t.check(member(state,'alice').password==='Subject-normal-2026!','Different-subject attempt preserves Alice password');
    if(!t.v)t.check((await resetPassword(t,ownToken,'alice','Subject-retried-2026!')).status()===200&&member(await t.oracle(),'alice').password==='Subject-retried-2026!','Refused subject mismatch preserves legitimate capability');
    const attackLogin=await t.post('/login',{username:'bob',password:'Subject-takeover-2026!'});t.check((attackLogin.status()===200&&(await (await t.get('/session')).json()).username==='bob')===t.v,'Changed foreign credentials create actual Bob session only in V');
  },
  R0273:async t=>{
    await t.login();t.check((await t.post('/batch-documents',{ids:[101]})).status()===200,'Normal one-object batch completes');t.check((await (await t.get('/batch-documents/101')).json()).body==='Archived note','Normal batch updates real owned document');
    await t.post('/batch-documents',{ids:[101,102]});const state=await t.oracle();t.check(state.operations.some(o=>o.username==='alice'&&o.action==='archive:102')===t.v,'Foreign object is audited as modified only in V');
    await t.post('/logout',{});await t.login('bob');const foreign=(await (await t.get('/batch-documents/102')).json()).body;t.check((foreign==='Archived note')===t.v,'Victim reads actual modified foreign document only in V');
    if(!t.v)t.check(foreign===t.c,'Fixed batch preserves victim original private content');
    t.check((await t.post('/batch-documents',{ids:'102'})).status()===200,'Legitimate form CSV input updates owned document');
  },
  R0275:async t=>{
    await t.login();const first=(await (await t.get('/workspace-documents')).json());t.check(first.records.length===1&&first.records[0].tenant==='A'&&!!first.nextCursor,'Normal tenant page produces real cursor');
    const second=(await (await t.get('/workspace-documents?cursor='+encodeURIComponent(first.nextCursor))).json());t.check(second.records[0].id===102&&second.records[0].tenant==='A','Unmodified cursor returns next authorized tenant page');
    const changed=JSON.parse(Buffer.from(first.nextCursor,'base64url'));changed.tenant='B';changed.after=0;const input=Buffer.from(JSON.stringify(changed)).toString('base64url');const response=await t.get('/workspace-documents?cursor='+encodeURIComponent(input));t.check((await response.text()).includes(t.c+' tenant B')===t.v,'Cursor tenant override returns actual foreign-tenant document only in V');
    t.check((await t.get('/workspace-documents?cursor=invalid')).status()===400,'Malformed pagination state rejected in every arm');
  },
  R0281:async t=>{
    await t.login();const issued=(await (await t.post('/sharing',{document:101})).json()).token;t.check((await (await t.get('/shared/'+issued)).text()).includes(t.c),'Normal active capability reads real shared document');
    t.check((await t.post('/sharing/revoke',{document:101})).status()===200,'Owner sharing revocation succeeds');
    const listed=(await (await t.get('/sharing')).json()).shares;t.check(listed.some(s=>s.value===issued&&s.active===false),'Revocation changes persisted capability state');
    t.check((await (await t.get('/shared/'+issued)).text()).includes(t.c)===t.v,'Revoked capability reads actual private document only in V');
    const replacement=(await (await t.post('/sharing',{document:101})).json()).token;t.check(replacement!==issued&&(await (await t.get('/shared/'+replacement)).text()).includes(t.c),'New sharing creates independently usable capability');
    t.check((await (await t.get('/shared/'+issued)).text()).includes(t.c)===t.v,'New sharing does not reactivate revoked prior capability in fixed arms');
    t.check((await t.post('/sharing/revoke',{document:102})).status()===403,'Non-owner cannot revoke another document');
  },
  R0284:async t=>{
    await t.login();const own=(await (await t.get('/tenant-records',{headers:{'x-tenant':'A'}})).json());t.check(own.tenant==='A'&&own.documents.some(d=>d.id===101)&&!JSON.stringify(own).includes(t.c+' tenant B'),'Legitimate tenant hint reads only current tenant');
    const response=await t.get('/tenant-records',{headers:{'x-tenant':'B'}});t.check((await response.text()).includes(t.c+' tenant B')===t.v,'Tenant header switches actual data partition only in V');
    if(!t.v)t.check((await (await t.get('/tenant-records',{headers:{'x-tenant':'B'}})).json()).tenant==='A','Fixed arm uses authenticated tenant despite foreign display hint');
    await t.post('/logout',{});await t.login('carol');const other=await t.get('/tenant-records',{headers:{'x-tenant':'B'}});t.check((await other.text()).includes(t.c+' tenant B'),'Actual tenant B member legitimately reads tenant B document');
  },
  R0395:async t=>{
    await t.login();t.check((await t.post('/purchase-requests/601/submit',{})).status()===200,'Member submits draft request');t.check((await t.post('/purchase-requests/601/approve',{})).status()===403,'Ordinary member cannot approve');
    t.check((await purchase(t,601)).state==='submitted','Rejected unauthorized approval preserves persisted state');await t.post('/logout',{});await t.login('approver');t.check((await t.post('/purchase-requests/601/approve',{})).status()===200,'Real approver approves submitted purchase');
    await t.post('/logout',{});await t.login();t.check((await t.post('/purchase-requests/601/pay',{})).status()===200,'Owner pays approved request');const normal=await t.oracle();t.check(member(normal,'alice').balance===2000&&normal.orders.length===1&&(await purchase(t,601)).state==='paid','Normal workflow commits real balance, order and purchase state');
    t.check((await t.post('/purchase-requests/601/pay',{})).status()===409,'Paid order cannot be charged twice');await t.post('/purchase-requests/602/pay',{});const after=await t.oracle();t.check(member(after,'alice').balance===(t.v?1000:2000)&&after.orders.length===(t.v?2:1),'Skipped approval creates actual charge and order only in V');t.check((await purchase(t,602)).state===(t.v?'paid':'draft'),'Unauthorized transition effect matches persisted state');
  },
  R0397:async t=>{
    await t.login();const history=(await (await t.get('/refunds/701')).json());t.check(history.paid===1000&&history.refunded===0,'Historical payment fixture has real paid and refunded ledger values');
    t.check((await t.post('/refunds/701',{amount:600})).status()===200,'Normal partial refund succeeds');t.check(member(await t.oracle(),'alice').balance===3600,'Normal refund actually credits account');
    await t.post('/refunds/701',{amount:600});const after=await t.oracle(),ledger=(await (await t.get('/refunds/701')).json());t.check(ledger.refunded===(t.v?1200:600)&&member(after,'alice').balance===(t.v?4200:3600),'Repeated partial refunds exceed real paid amount only in V');
    if(!t.v){t.check((await t.post('/refunds/701',{amount:400})).status()===200,'Remaining legitimate refund reaches exact paid amount');t.check((await (await t.get('/refunds/701')).json()).refunded===1000&&member(await t.oracle(),'alice').balance===4000,'Fixed cumulative ledger and account agree at paid limit');}
    t.check((await t.post('/refunds/701',{amount:-1})).status()===400,'Negative refund input rejected in every arm');
  },
  R0484:async t=>{
    await t.login();t.check((await t.post('/transfers',{recipient:'bob',amount:100})).status()===200,'Normal recipient transfer succeeds');const normal=await t.oracle();t.check(member(normal,'alice').balance===2900&&member(normal,'bob').balance===3100,'Normal transfer changes both actual balances');
    const limits=(await (await t.get('/transfers')).json()).recipients;t.check(limits.find(r=>r.username==='carol').remaining===0,'Receiver historical capacity fixture is genuinely exhausted');
    const failed=await t.post('/transfers',{recipient:'carol',amount:100});t.check(failed.status()===409&&(await failed.text()).includes('Receiver capacity exceeded'),'Actual PostgreSQL constraint failure produces controlled business error');
    const after=await t.oracle();t.check(member(after,'alice').balance===(t.v?2800:2900)&&member(after,'carol').balance===3000,'Failed second phase leaves unilateral debit only in V');t.check(!after.operations.some(o=>o.action==='transfer:carol:100'),'Failed transfer has no successful transfer record');
    t.check((await t.post('/transfers',{recipient:'bob',amount:50})).status()===200,'Normal transfer remains usable after failed transaction');const recovered=await t.oracle();t.check(member(recovered,'alice').balance===(t.v?2750:2850)&&member(recovered,'bob').balance===3150,'Post-failure account effects remain consistent');
  }
};
