const account=(state,name)=>state.users.find(x=>x.name===name);
const ownMail=async(t,name='alice')=>t.ctl('/mail/'+name);
const lastMail=async(t,name,purpose)=>(await ownMail(t,name)).filter(x=>x.purpose===purpose).at(-1);
const cookie=async t=>(await t.context.cookies(t.target)).find(x=>x.name==='sid')?.value;
const session=async t=>(await(await t.get('/session')).json()).username;
const profile=(state,name)=>state.caseState.batchAuth.profiles.find(x=>x.username===name);
const membership=(state,name)=>state.caseState.batchAuth.memberships.find(x=>x.username===name);
const stateToken=(state,value)=>state.caseState.batchAuth.tokens.find(x=>x.value===value);
async function logout(t){await t.post('/logout',{});}
async function fresh(t){await t.ctl('/reset',{root:t.record.root,mode:t.mode,seed:'acceptance-v1'});t.check((await session(t))===null,'Reset invalidates every previously issued Redis session');t.check((await t.oracle()).caseState.batchAuth.tokens.length===0,'Reset removes persisted verification and recovery tokens');}
async function factorStart(t,name='alice'){const r=await t.post('/two-factor-signin',{username:name,password:'Fixture-'+name+'-2026!'});t.check(r.status()===200,'Password stage creates an actual pending session');const data=await r.json();t.check(data.secondFactorRequired===true&&typeof data.challenge==='string','Password response declares a run-specific second-factor challenge');return data;}
async function factorVerify(t,otp){return t.post('/two-factor-verify',{otp});}
async function bypassGeneric(t,path='/secure-data'){await logout(t);const response=await t.post('/login',{username:'alice',password:'Fixture-alice-2026!'});t.check(response.status()===200,'Ordinary login remains usable as a separate normal operation');t.check([401,403].includes((await t.get(path)).status()),'Ordinary single-factor login cannot bypass the dedicated protection');await logout(t);}

export const checks={
  R0183:async t=>{
    const normal=await t.post('/pending-signin',{username:'alice',password:'Fixture-alice-2026!'});t.check(normal.status()===200&&await session(t)==='alice','Full credentials establish the actual expected session');await logout(t);
    const omitted=await t.post('/pending-signin',{username:'pending'});t.check((omitted.status()===200&&await session(t)==='pending')===t.v,'Absent input equals uninitialized credential and authenticates only in V');
    if(t.v)t.check((await(await t.get('/enrolled-note')).json()).enrollmentComplete===false,'Authenticated principal really belongs to an incomplete enrollment');
    await logout(t);t.check((await t.post('/pending-signin',{username:'pending',password:''})).status()===401,'Empty string is distinct from missing stored credentials in all arms');
    t.check((await t.post('/pending-signin',{username:'alice'})).status()===401,'A normal account cannot authenticate without its initialized credential');
    t.check((await t.post('/pending-signin',{username:'not-a-member'})).status()===401,'A wholly missing identity never authenticates');await fresh(t);
  },
  R0185:async t=>{
    t.check((await t.post('/identity-registration',{username:'dave',password:'Fixture-dave-2026!'})).status()===201,'A unique ordinary Unicode ID is registered');
    t.check((await t.post('/identity-signin',{username:'dave',password:'Fixture-dave-2026!'})).status()===200&&await session(t)==='dave','New identity credentials authenticate their actual DB principal');await logout(t);
    const raw='ｂｏｂ',secret='Fullwidth-owned-2026!';const registered=await t.post('/identity-registration',{username:raw,password:secret});t.check((registered.status()===201)===t.v,'NFKC-equivalent raw identity is independently registered only in V');
    const result=await t.post('/identity-signin',{username:raw,password:secret});t.check((result.status()===200&&await session(t)==='bob')===t.v,'Raw identity credential is incorrectly mapped to Bob only in V');
    if(t.v)t.check((await(await t.get('/identity-note')).text()).includes(t.c),'Wrong-principal session reads the actual Bob private document');
    const state=await t.oracle();t.check(account(state,'bob').password==='Fixture-bob-2026!','Normalization takeover does not overwrite the victim credential');await logout(t);
    t.check((await t.post('/identity-signin',{username:raw,password:'Fixture-bob-2026!'})).status()===(t.v?401:200),'Equivalent spelling with the genuine canonical credential follows the chosen normalization rule');await logout(t);
    t.check((await t.post('/identity-signin',{username:'bob',password:'Fixture-bob-2026!'})).status()===200&&await session(t)==='bob','Canonical identity keeps normal authentication');await fresh(t);
    t.check(!(await t.oracle()).users.some(x=>x.name==='dave'||x.name===raw),'Reset removes newly registered identity records');
  },
  R0187:async t=>{
    await t.login();t.check((await t.get('/organization-notes')).status()===403,'Unverified starting account cannot use organization data');
    t.check((await t.post('/organization-email',{email:'alice@organization.test'})).status()===200,'Owned organizational address starts a normal verification');const normal=await lastMail(t,'alice','organization-email');t.check(normal?.destination==='alice@organization.test','Verification is delivered to the actual owned address');
    t.check((await t.post('/organization-confirm',{token:normal.token})).status()===200,'Correct owned email token confirms its current subject and destination');t.check((await(await t.get('/organization-notes')).text()).includes(t.c),'Verified organizational member can read organization information');
    t.check((await t.post('/organization-confirm',{token:normal.token})).status()===400,'Email confirmation remains single use in all arms');
    await t.post('/organization-email',{email:'bob@organization.test'});const bob=await lastMail(t,'bob','organization-email');t.check(bob?.destination==='bob@organization.test'&&bob.username==='alice','Claimed unowned address really routes the message into Bob inbox');
    t.check((await ownMail(t,'alice')).filter(x=>x.purpose==='organization-email').length===1,'Alice is not handed the token sent to a different owned address');
    const after=await t.oracle();t.check(profile(after,'alice').verified===false,'Changing the address clears the prior verification in all arms');t.check(profile(after,'alice').organization===t.v,'Unverified domain grants actual stored organization permission only in V');
    t.check((await(await t.get('/organization-notes')).text()).includes(t.c)===t.v,'Missing ownership proof still accesses actual organization data only in V');
    t.check((await t.post('/organization-confirm',{token:normal.token})).status()===400,'Old consumed proof cannot verify the new destination');await fresh(t);t.check(profile(await t.oracle(),'alice').organization===false,'Reset removes previously assigned organizational permission');
  },
  R0188:async t=>{
    await t.login();await t.post('/enrollment-email',{});const normal=await lastMail(t,'alice','enrollment-email');t.check(!!normal?.token,'Own enrollment confirmation token is genuinely delivered');
    t.check((await t.post('/enrollment-confirm',{username:'alice',token:normal.token})).status()===200,'Normal token confirms its own registration');t.check(profile(await t.oracle(),'alice').verified===true,'Normal confirmation persists the actual registration attribute');
    t.check((await(await t.get('/verified-service')).text()).includes(t.c),'Confirmed registration enables its protected service');
    await t.post('/enrollment-email',{});const other=await lastMail(t,'alice','enrollment-email');const changed=await t.post('/enrollment-confirm',{username:'bob',token:other.token});t.check((changed.status()===200)===t.v,'Alice token confirms the specified Bob enrollment only in V');
    const after=await t.oracle();t.check(profile(after,'bob').verified===t.v,'Wrong registration confirmation is persisted only in V');t.check(stateToken(after,other.token).used===t.v,'Rejected subject mismatch does not consume a legitimate token');
    await logout(t);await t.login('bob');t.check((await(await t.get('/verified-service')).text()).includes(t.c)===t.v,'Wrongly confirmed Bob gains the actual verified service only in V');await logout(t);await t.login();
    const replay=await t.post('/enrollment-confirm',{username:'alice',token:normal.token});t.check(replay.status()===400,'A genuinely consumed enrollment token cannot be replayed');
    if(!t.v)t.check((await t.post('/enrollment-confirm',{username:'alice',token:other.token})).status()===200,'Wrong-subject rejection leaves the original subject able to confirm');await fresh(t);t.check(!(await t.oracle()).caseState.batchAuth.profiles.some(x=>x.verified),'Reset removes every enrollment confirmation attribute');
  },
  R0191:async t=>{
    t.check((await t.post('/new-account',{username:'dave',password:'Fixture-dave-2026!'})).status()===201,'Strong normal password is registered');t.check((await t.post('/login',{username:'dave',password:'Fixture-dave-2026!'})).status()===200&&await session(t)==='dave','Persisted normal registration authenticates');await logout(t);
    const weak=await t.post('/new-account',{username:'evan',password:'password1234'});t.check((weak.status()===201)===t.v,'Known blocklist password is admitted only in V');t.check((account(await t.oracle(),'evan')?.password==='password1234')===t.v,'Weak password is actually stored only in V');
    const accepted=await t.post('/login',{username:'evan',password:'password1234'});t.check((accepted.status()===200&&await session(t)==='evan')===t.v,'Stored weak value actually authenticates the account only in V');await logout(t);
    t.check((await t.post('/new-account',{username:'short',password:'123'})).status()===400,'Minimum length remains enforced in all arms');
    const similar='password1234-and-a-random-fixture-tail';t.check((await t.post('/new-account',{username:'frank',password:similar})).status()===201,'A longer distinct password containing blocklist text is preserved');
    t.check((await t.post('/new-account',{username:'alice',password:similar})).status()===409&&account(await t.oracle(),'alice').password==='Fixture-alice-2026!','Duplicate registration never changes existing credentials');await fresh(t);t.check(!account(await t.oracle(),'dave')&&!account(await t.oracle(),'evan'),'Reset removes all new registrations');
  },
  R0193:async t=>{
    const found=await t.post('/member-signin',{username:'alice',password:'Wrong-credential-2026!'}),missing=await t.post('/member-signin',{username:'absent',password:'Wrong-credential-2026!'});const one=await found.text(),two=await missing.text();
    t.check((found.status()!==missing.status()||one!==two)===t.v,'Existence-dependent status or body identifies candidate membership only in V');
    t.check(await session(t)===null,'Neither enumeration attempt authenticates');const another=await t.post('/member-signin',{username:'absent-two',password:'Wrong-credential-2026!'});t.check(another.status()===missing.status()&&await another.text()===two,'Two absent usernames share the same normal failure behavior');
    await t.login();t.check(await session(t)==='alice','Complete credentials authenticate in every arm');const before=await t.oracle();t.check(before.operations.length===0,'Enumeration response differences do not fabricate a protected operation');await fresh(t);
  },
  R0196:async t=>{
    await factorStart(t);const pending=(await(await t.get('/secure-data')).text());t.check(pending.includes(t.c)===t.v,'Password-only pending session accesses the actual protected data only in V');
    const otp=await lastMail(t,'alice','second-factor');t.check((await factorVerify(t,otp.otp)).status()===200,'Genuine matching OTP completes normal authentication');t.check((await(await t.get('/secure-data')).text()).includes(t.c),'Completed second factor can access the actual private document');
    const bad=await factorVerify(t,'000000');t.check(bad.status()===401,'Incorrect OTP never creates a verified grant');await bypassGeneric(t);await fresh(t);
  },
  R0197:async t=>{
    await factorStart(t);const initial=await lastMail(t,'alice','second-factor');t.check((await t.post('/two-factor-destination',{destination:'alice@example.test',approval:initial.otp})).status()===200,'Existing factor approves a normal destination setting');const updated=await lastMail(t,'alice','second-factor');t.check(updated.otp!==initial.otp&&updated.destination==='alice@example.test','Destination update invalidates the old code and really delivers a new one');t.check((await factorVerify(t,initial.otp)).status()===401,'Old code is revoked after a destination change');t.check((await factorVerify(t,updated.otp)).status()===200,'New code completes the approved normal workflow');await logout(t);
    await factorStart(t,'bob');const beforeAlice=(await ownMail(t,'alice')).length;const changed=await t.post('/two-factor-destination',{destination:'alice@example.test',approval:''});t.check((changed.status()===200)===t.v,'Password-only Bob session changes OTP destination without the existing factor only in V');
    const after=await t.oracle();t.check(after.caseState.batchAuth.factorDestinations.bob===(t.v?'alice@example.test':'bob@example.test'),'Actual stored factor destination agrees with the authorization result');t.check(((await ownMail(t,'alice')).length>beforeAlice)===t.v,'Bob OTP really arrives in Alice inbox only in V');
    if(t.v){const received=await lastMail(t,'alice','second-factor');t.check(received.username==='bob','Received code belongs to Bob challenge');t.check((await factorVerify(t,received.otp)).status()===200&&await session(t)==='bob','Attacker-controlled delivery completes Bob second factor');t.check((await(await t.get('/secure-data')).text()).includes(t.c),'Destination takeover accesses real Bob private data');}
    else{const legitimate=await lastMail(t,'bob','second-factor');t.check((await factorVerify(t,legitimate.otp)).status()===200,'Unauthorized change rejection preserves the legitimate factor workflow');}
    t.check((await t.post('/two-factor-destination',{destination:'unregistered@example.test',approval:'123456'})).status()===400,'Closed fixture rejects nonexistent delivery recipients in all arms');await bypassGeneric(t);await fresh(t);t.check((await t.oracle()).caseState.batchAuth.factorDestinations.bob==='bob@example.test','Reset restores original factor destinations');
  },
  R0198:async t=>{
    await factorStart(t);const first=await lastMail(t,'alice','second-factor');t.check((await factorVerify(t,first.otp)).status()===200,'First use of a matching OTP authenticates normally');const sid1=await cookie(t),count1=(await t.oracle()).operations.filter(x=>x.action.startsWith('second-factor-completed:')).length;
    const second=await factorVerify(t,first.otp);const sid2=await cookie(t),state=await t.oracle(),count2=state.operations.filter(x=>x.action.startsWith('second-factor-completed:')).length;t.check((second.status()===200&&sid2!==sid1&&count2===count1+1)===t.v,'Identical OTP creates a second actual authenticated session and grant only in V');
    t.check((await(await t.get('/secure-data')).text()).includes(t.c),'First valid authentication remains usable after a replay test');t.check((await factorVerify(t,'000000')).status()===401,'Unknown code fails despite the single-use defect');await bypassGeneric(t);await fresh(t);t.check((await factorVerify(t,first.otp)).status()===401,'Reset removes pending proof and previously issued OTP');
  },
  R0199:async t=>{
    await factorStart(t);const genuine=await lastMail(t,'alice','second-factor');t.check((await factorVerify(t,genuine.otp)).status()===200,'Genuine own challenge can be completed');await logout(t);
    await factorStart(t);const alice=await lastMail(t,'alice','second-factor');await logout(t);await factorStart(t,'bob');const bob=await lastMail(t,'bob','second-factor');t.check(alice.challenge!==bob.challenge&&alice.username!==bob.username,'Two subjects really hold distinct pending challenge records');
    const wrong=await factorVerify(t,alice.otp);t.check((wrong.status()===200)===t.v,'Alice OTP completes Bob pending challenge only in V');t.check((await(await t.get('/secure-data')).text()).includes(t.c)===t.v,'Unbound OTP accesses Bob actual protected data only in V');
    if(!t.v)t.check((await factorVerify(t,bob.otp)).status()===200,'Wrong-subject failure preserves Bob genuine OTP');else t.check((await factorVerify(t,alice.otp)).status()===401,'Unbound OTP still remains genuinely single use');
    t.check((await factorVerify(t,'000000')).status()===401,'Nonexistent OTP cannot exploit a binding omission');await bypassGeneric(t);await fresh(t);
  },
  R0206:async t=>{
    await t.post('/account-help',{username:'alice'});const old=await lastMail(t,'alice','password-reset');await t.post('/account-help',{username:'bob'});const bob=await lastMail(t,'bob','password-reset');await t.post('/account-help',{username:'alice'});const current=await lastMail(t,'alice','password-reset');t.check(old.token!==current.token,'Reissuance generates a distinct real recovery token');
    const response=await t.post('/account-password',{username:'alice',token:old.token,password:'Old-token-change-2026!'});t.check((response.status()===200)===t.v,'Old recovery token changes credentials after reissuance only in V');t.check((account(await t.oracle(),'alice').password==='Old-token-change-2026!')===t.v,'Old-token defect is persisted in the actual credential DB');
    t.check((await t.post('/account-password',{username:'alice',token:current.token,password:'Current-token-change-2026!'})).status()===200,'Current replacement token performs legitimate recovery in every arm');
    t.check((await t.post('/login',{username:'alice',password:'Current-token-change-2026!'})).status()===200,'Current recovered password actually authenticates');await logout(t);
    t.check((await t.post('/account-password',{username:'alice',token:current.token,password:'Replay-change-2026!'})).status()===400,'Replacement token remains single use');
    t.check((await t.post('/account-password',{username:'bob',token:bob.token,password:'Other-subject-change-2026!'})).status()===200,'Alice reissuance does not invalidate another subject legitimate token');
    t.check((await t.post('/account-password',{username:'alice',token:'not-issued',password:'Unknown-token-2026!'})).status()===400,'Unknown token cannot perform recovery');await fresh(t);t.check(account(await t.oracle(),'alice').password==='Fixture-alice-2026!','Reset restores original credentials');
  },
  R0210:async t=>{
    await t.post('/account-help',{username:'alice'});const normal=await lastMail(t,'alice','password-reset');t.check((await t.post('/account-recover',{username:'alice',token:normal.token,answer:'',password:'Token-recovered-2026!'})).status()===200,'Proper delivered token performs normal recovery');
    const publicProfile=await(await t.get('/public-profile?username=bob')).json();t.check(publicProfile.username==='bob'&&publicProfile.city==='Osaka','Recovery-answer information is genuinely public');
    const changed=await t.post('/account-recover',{username:'bob',answer:publicProfile.city,token:'',password:'Public-answer-2026!'});t.check((changed.status()===200)===t.v,'Public profile answer substitutes for secret recovery proof only in V');t.check((account(await t.oracle(),'bob').password==='Public-answer-2026!')===t.v,'Public-answer recovery actually changes Bob credential only in V');
    const signin=await t.post('/login',{username:'bob',password:'Public-answer-2026!'});t.check((signin.status()===200&&await session(t)==='bob')===t.v,'Changed public-answer credential takes over actual Bob session only in V');await logout(t);
    t.check((await t.post('/account-recover',{username:'carol',answer:'Incorrect City',password:'Wrong-answer-2026!'})).status()===400,'Incorrect public answer never authorizes recovery');
    t.check((await t.post('/account-recover',{username:'bob',token:normal.token,answer:'',password:'Wrong-subject-2026!'})).status()===400,'A consumed or wrong-subject secret token never bypasses its own constraints');await fresh(t);
  },
  R0219:async t=>{
    await t.login('admin');t.check((await t.post('/team-invites',{username:'alice',role:'user'})).status()===201,'Administrator issues a normal least-privilege invitation');await t.post('/team-invites',{username:'bob',role:'user'});const alice=await lastMail(t,'alice','team-invite'),bob=await lastMail(t,'bob','team-invite');await logout(t);await t.login();
    t.check((await t.post('/team-accept',{token:alice.token,role:'user'})).status()===200,'Correct recipient joins with normal saved role');t.check((await(await t.get('/team-status')).json()).role==='user','Normal membership really stores least privilege');t.check((await t.get('/team-admin')).status()===403,'Normal invited member cannot read organization administration');await logout(t);await t.login('bob');
    const result=await t.post('/team-accept',{token:bob.token,role:'admin'});t.check(result.status()===200,'Valid invitation remains acceptable when a redundant role field is present');t.check(membership(await t.oracle(),'bob').role===(t.v?'admin':'user'),'Client role overrides actual saved invite role only in V');t.check((await(await t.get('/team-admin')).text()).includes(t.c)===t.v,'Tampered invitation role obtains actual management access only in V');
    t.check((await t.post('/team-accept',{token:bob.token,role:'admin'})).status()===400,'Invitation remains single use in all arms');await logout(t);await t.login('admin');await t.post('/team-invites',{username:'carol',role:'admin'});const legitimate=await lastMail(t,'carol','team-invite');await logout(t);await t.login('carol');
    t.check((await t.post('/team-accept',{token:legitimate.token,role:'admin'})).status()===200&&(await t.get('/team-admin')).status()===200,'A genuine server-issued administrative invitation remains usable');
    t.check((await t.post('/team-invites',{username:'alice',role:'admin'})).status()===403,'Team membership does not grant global invitation issuance');await fresh(t);t.check((await t.oracle()).caseState.batchAuth.memberships.length===0,'Reset clears organization membership');
  },
  R0220:async t=>{
    await t.login('admin');await t.post('/team-invites',{username:'alice',role:'user'});await t.post('/team-invites',{username:'bob',role:'user'});const alice=await lastMail(t,'alice','team-invite'),bob=await lastMail(t,'bob','team-invite');await logout(t);await t.login();
    t.check((await t.post('/team-accept',{token:alice.token,role:'user'})).status()===200,'Correct recipient accepts a genuine invitation');t.check((await(await t.get('/team-status')).text()).includes(t.c),'Normal invited recipient reads actual organization data');await logout(t);await t.login('carol');
    const forwarded=await t.post('/team-accept',{token:bob.token,role:'user'});t.check((forwarded.status()===200)===t.v,'Different authenticated email subject accepts forwarded invitation only in V');t.check(!!membership(await t.oracle(),'carol')===t.v,'Wrong recipient organization membership is persisted only in V');t.check((await(await t.get('/team-status')).text()).includes(t.c)===t.v,'Wrong recipient obtains actual organization information only in V');
    t.check((await t.get('/team-admin')).status()===403,'Missing subject binding does not also grant an unsaved administrative role');await logout(t);await t.login('bob');const legitimate=await t.post('/team-accept',{token:bob.token,role:'user'});t.check(legitimate.status()===(t.v?400:200),'Single-use consumption and rejected-forward preservation agree with stored state');await fresh(t);t.check((await t.oracle()).caseState.batchAuth.memberships.length===0,'Reset clears wrongly or correctly joined memberships');
  },
  R0225:async t=>sessionTiming(t,'absolute-expired','idle-expired'),
  R0226:async t=>sessionTiming(t,'idle-expired','absolute-expired'),
  R0227:async t=>{
    await bypassGeneric(t,'/session-report');await t.login('bob');const bobSession=await cookie(t);await t.context.clearCookies();await t.login();const old=await cookie(t);await t.context.clearCookies();await t.login();const changingSession=await cookie(t);t.check(changingSession!==old,'Separate browser credentials coexist as distinct actual Redis sessions');t.check((await(await t.get('/session-report')).text()).includes(t.c),'Current dedicated session accesses its actual private data');const invalid=await t.post('/session-password',{currentPassword:'Incorrect-current-2026!',password:'Rejected-change-2026!'});t.check(invalid.status()===400&&account(await t.oracle(),'alice').password==='Fixture-alice-2026!','Incorrect current password cannot change credential or session generation');
    const changed=await t.post('/session-password',{currentPassword:'Fixture-alice-2026!',password:'Changed-alice-2026!'});t.check(changed.status()===200&&account(await t.oracle(),'alice').password==='Changed-alice-2026!','Authenticated change persists the actual new password');const current=await cookie(t);t.check(current!==changingSession&&(await(await t.get('/session-report')).text()).includes(t.c),'Changing browser receives a fresh valid dedicated session');t.check((await t.get('/session-report',{headers:{cookie:'sid='+changingSession}})).status()===401,'The changing browser previous identifier is rotated and revoked in every arm');
    const replay=await t.get('/session-report',{headers:{cookie:'sid='+old}});t.check((await replay.text()).includes(t.c)===t.v,'Saved concurrent pre-change session remains useful only in V');t.check((await t.oracle()).caseState.batchAuth.generations.alice===(t.v?'0':'1'),'Actual session generation changes only in the repaired arm');t.check((await t.get('/session-report',{headers:{cookie:'sid='+bobSession}})).status()===200,'Changing Alice credential preserves another subject live dedicated session');t.check((await t.oracle()).caseState.batchAuth.generations.bob==='0','Changing Alice credential preserves another subject generation');
    await logout(t);t.check((await t.post('/session-signin',{username:'alice',password:'Fixture-alice-2026!'})).status()===401,'Old credential no longer authenticates in any arm');t.check((await t.post('/session-signin',{username:'alice',password:'Changed-alice-2026!'})).status()===200&&(await t.get('/session-report')).status()===200,'New credential issues an accepted current-generation session');await fresh(t);t.check(account(await t.oracle(),'alice').password==='Fixture-alice-2026!'&&(await t.oracle()).caseState.batchAuth.generations.alice==='0','Reset restores both original credential and session generation');
  }
};

async function sessionTiming(t,omitted,kept){
  await t.login();t.check((await(await t.get('/session-report')).text()).includes(t.c),'Fresh dedicated session reads actual protected data');const history=await(await t.get('/session-history')).json();t.check(history.archivedOwnSessions.length===3,'Authenticated own history exposes three real timestamped session fixtures');const lookup=kind=>history.archivedOwnSessions.find(x=>x.kind===kind);
  const old=lookup(omitted),other=lookup(kept),within=lookup('within-limits');t.check(new Date(old.createdAt).getTime()<Date.now()&&new Date(old.lastActivity).getTime()<=Date.now(),'History records hold genuine issuance and last-activity timestamps');
  const attack=await t.get('/session-report',{headers:{cookie:'sid='+old.session}});t.check((await attack.text()).includes(t.c)===t.v,'Session beyond the selected timestamp limit reads protected data only in V');
  t.check((await t.get('/session-report',{headers:{cookie:'sid='+other.session}})).status()===401,'The independent other expiration limit is still enforced in all arms');t.check((await(await t.get('/session-report',{headers:{cookie:'sid='+within.session}})).text()).includes(t.c),'A historical session still within both limits remains legitimate');
  t.check((await t.get('/session-report',{headers:{cookie:'sid='+'a'.repeat(48)}})).status()===401,'Unknown well-formed session ID never authenticates');await bypassGeneric(t,'/session-report');await fresh(t);t.check((await t.get('/session-report',{headers:{cookie:'sid='+old.session}})).status()===401,'Reset removes old timestamp fixture sessions completely');
}
