import {createHmac,generateKeyPairSync,sign} from 'node:crypto';

const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const mac=(value,key)=>createHmac('sha256',key).update(value).digest('base64url');
const signed=(header,body,key)=>{const value=encode(header)+'.'+encode(body);return value+'.'+mac(value,key);};
const authorization=token=>({headers:{authorization:'Bearer '+token}});
const sid=async t=>(await t.context.cookies(t.target)).find(cookie=>cookie.name==='sid')?.value;
const user=(state,name)=>state.users.find(u=>u.name===name);

export const checks={
  R0005:async t=>{
    const normal=await t.get('/catalogue?sort=title',{headers:{accept:'application/json'}});const items=(await normal.json()).items;
    t.check(items.map(i=>i.id).join(',')==='1,2','Normal PostgreSQL ordering returns public items');
    const offset=t.c.length,letter=t.c.at(-1),different=letter==='x'?'y':'x';
    const order=value=>`CASE WHEN (SELECT substr(title,${offset},1) FROM items WHERE secret=true LIMIT 1)='${value}' THEN id ELSE -id END`;
    const a=await t.get('/catalogue?sort='+encodeURIComponent(order(letter)),{headers:{accept:'application/json'}});
    const b=await t.get('/catalogue?sort='+encodeURIComponent(order(different)),{headers:{accept:'application/json'}});
    if(t.v){const yes=(await a.json()).items,no=(await b.json()).items;t.check(yes.map(i=>i.id).join(',')==='1,2'&&no.map(i=>i.id).join(',')==='2,1','Actual protected PostgreSQL value controls public row order');t.check(!JSON.stringify(yes).includes(t.c)&&!JSON.stringify(no).includes(t.c),'Ordering oracle does not directly disclose secret row');}
    else t.check(a.status()===400&&b.status()===400,'Unregistered ORDER BY expressions rejected');
    const descending=(await (await t.get('/catalogue?sort=descending',{headers:{accept:'application/json'}})).json()).items;
    t.check(descending.map(i=>i.id).join(',')==='2,1','Legitimate reverse ordering remains usable');
    const quoted=await t.get('/catalogue?q='+encodeURIComponent("O'Reilly")+'&sort=title',{headers:{accept:'application/json'}});t.check(quoted.status()===200&&(await quoted.json()).items.length===0,'SQL-looking search text remains a literal value');
  },
  R0184:async t=>{
    const normal=await t.post('/signin',{username:'alice',password:'Fixture-alice-2026!'});t.check(normal.status()===200,'Exact member credentials authenticate');
    t.check((await (await t.get('/session')).json()).username==='alice','Exact credentials create actual member session');await t.post('/logout',{});
    await t.post('/signin',{username:'bob',password:'Fixture-'});t.check(((await (await t.get('/session')).json()).username==='bob')===t.v,'Prefix-only password creates Bob session only in V');
    await t.post('/logout',{});const empty=await t.post('/signin',{username:'bob',password:''});t.check(empty.status()===401,'Empty password does not accidentally authenticate');
  },
  R0189:async t=>{
    const created=await t.post('/registration',{username:'dave',contact:'dave@example.test',password:'Fixture-dave-2026!'});t.check(created.status()===201,'Unique registration succeeds');
    const dave=await t.post('/login',{username:'dave',password:'Fixture-dave-2026!'});t.check(dave.status()===200&&(await (await t.get('/session')).json()).username==='dave','Registered credentials create actual Dave session');await t.post('/logout',{});
    const before=await t.oracle();const availability=await t.get('/registration/check?contact=bob%40example.test');t.check((await availability.json()).available===false,'Duplicate account availability is reported without mutation');
    t.check(user(await t.oracle(),'bob').password===user(before,'bob').password,'Read-only registration check preserves Bob credentials');
    await t.post('/registration',{username:'intruder',contact:'bob@example.test',password:'Replacement-bob-2026!'});
    const after=await t.oracle();t.check((user(after,'bob').password==='Replacement-bob-2026!')===t.v,'Duplicate email overwrites actual owner credentials only in V');
    const takeover=await t.post('/login',{username:'bob',password:'Replacement-bob-2026!'});t.check((takeover.status()===200&&((await (await t.get('/session')).json()).username==='bob'))===t.v,'Replacement password takes over actual Bob session only in V');
    t.check(!after.users.some(u=>u.name==='intruder'),'Duplicate-email attempt creates no unrelated identity');
  },
  R0224:async t=>{
    await t.login();const saved=await sid(t);t.check(!!saved,'Authenticated session ID issued');
    t.check((await (await t.get('/member-note')).text()).includes(t.c),'Normal member session reads its private note');
    const response=await t.post('/signout',{});t.check(response.status()===200,'Normal signout completes');
    t.check((await (await t.get('/session')).json()).username===null,'Browser with cleared cookie is anonymous');
    const replay=await t.get('/member-note',{headers:{cookie:'sid='+saved}});t.check((await replay.text()).includes(t.c)===t.v,'Saved session replay reads protected note only in V');
    t.check(((await (await t.get('/session',{headers:{cookie:'sid='+saved}})).json()).username==='alice')===t.v,'Redis session revocation agrees with arm');
  },
  R0238:async t=>{
    await t.login();const normal=await t.get('/preferences');t.check((await normal.json()).displayRole==='user','Normal role display is usable');const saved=await sid(t);
    const denied=await t.get('/staff-note');t.check(denied.status()===403,'Ordinary unchanged role cannot read staff note');
    const response=await t.get('/staff-note',{headers:{cookie:'sid='+saved+'; memberRole=admin'}});t.check((await response.text()).includes(t.c)===t.v,'Unsigned role cookie elevates actual authorization only in V');
    await t.post('/logout',{});await t.login('admin');await t.get('/preferences');t.check((await (await t.get('/staff-note')).text()).includes(t.c),'Real administrator can read staff note');
  },
  R0243:async t=>{
    await t.login('admin');const normal=(await (await t.get('/access-pass')).json()).token;t.check((await (await t.get('/account-report',authorization(normal))).text()).includes(t.c),'Real administrator HMAC signature accepted');await t.post('/logout',{});await t.login();
    const observed=(await (await t.get('/access-pass')).json()).token;const parts=observed.split('.');const candidate=['password','secret','changeme'].find(key=>mac(parts[0]+'.'+parts[1],key)===parts[2]);
    t.check(!!candidate===t.v,'Observed JWT signature matches a dictionary key only in V');const payload=JSON.parse(Buffer.from(parts[1],'base64url'));payload.role='admin';
    const forged=signed({alg:'HS256',typ:'JWT'},payload,candidate||'secret');const response=await t.get('/account-report',authorization(forged));t.check((await response.text()).includes(t.c)===t.v,'Cryptographically forged HMAC JWT grants admin report only in V');
    const changed=normal.slice(0,-3)+'abc';t.check((await t.get('/account-report',authorization(changed))).status()===401,'Invalid cryptographic signature is rejected in every arm');
  },
  R0244:async t=>{
    await t.login('admin');const normal=(await (await t.get('/access-pass')).json()).token;t.check((await (await t.get('/account-report',authorization(normal))).text()).includes(t.c),'Registered RSA signing key accepted');
    const inline=(await (await t.get('/access-pass?inlineKey=1')).json()).token;t.check((await (await t.get('/account-report',authorization(inline))).text()).includes(t.c),'Trusted signature with redundant inline public JWK remains usable');
    const pair=generateKeyPairSync('rsa',{modulusLength:2048});const head={alg:'RS256',typ:'JWT',jwk:pair.publicKey.export({format:'jwk'})};const body={sub:'alice',role:'admin',iss:'fixture-idp',aud:'member-api',exp:Math.floor(Date.now()/1000)+600};const content=encode(head)+'.'+encode(body);const forged=content+'.'+sign('RSA-SHA256',Buffer.from(content),pair.privateKey).toString('base64url');
    const response=await t.get('/account-report',authorization(forged));t.check((await response.text()).includes(t.c)===t.v,'Real attacker-key RSA signature grants report only in V');
    const broken=forged.slice(0,-6)+'broken';t.check((await t.get('/account-report',authorization(broken))).status()===401,'Invalid RSA signature fails even when JWK is self-declared');
  },
  R0246:async t=>{
    await t.login();const valid=(await (await t.get('/access-pass')).json()).token;const normal=await t.get('/account-report',authorization(valid));t.check((await normal.text()).includes(t.c),'Currently valid signed JWT accesses personal report');
    const old=(await (await t.get('/legacy-pass?kind=archived')).json()).token;t.check(JSON.parse(Buffer.from(old.split('.')[1],'base64url')).exp===undefined,'Legacy issuer fixture lacks expiration claim');
    const response=await t.get('/account-report',authorization(old));t.check((await response.text()).includes(t.c)===t.v,'Legitimately signed JWT without exp remains usable only in V');
    const expired=(await (await t.get('/legacy-pass?kind=expired')).json()).token;t.check((await t.get('/account-report',authorization(expired))).status()===401,'Known-expired signature-valid JWT is rejected in every arm');
    const parts=valid.split('.');const payload=JSON.parse(Buffer.from(parts[1],'base64url'));delete payload.exp;const unsignedRemoval=parts[0]+'.'+encode(payload)+'.'+parts[2];t.check((await t.get('/account-report',authorization(unsignedRemoval))).status()===401,'Deleting exp without resigning never bypasses signature verification');
  },
  R0392:async t=>{
    await t.login();const normal=await t.post('/basket',{product:'book',quantity:1});t.check((await normal.json()).charged===1000,'Normal positive quantity charges fixed server price');t.check(user(await t.oracle(),'alice').balance===2000,'Normal order changes actual balance');
    await t.post('/basket',{product:'book',quantity:-1});const after=await t.oracle();t.check(user(after,'alice').balance===(t.v?3000:2000),'Negative quantity increases actual balance only in V');t.check(after.orders.some(o=>o.price<0)===t.v,'Negative-price order is actually recorded only in V');
    const numericString=await t.post('/basket',{product:'book',quantity:'01'});t.check((await numericString.json()).charged===1000,'Safe numeric quantity string still purchases one item');
    const zero=await t.post('/basket',{product:'book',quantity:0});t.check(zero.status()===400,'Zero quantity is rejected in all arms');
  },
  R0402:async t=>{
    await t.login('bob');const normal=await t.post('/referrals',{inviter:'carol'});t.check(normal.status()===200,'Normal referral registration succeeds');
    const normalState=await t.oracle();t.check(user(normalState,'carol').balance===3100&&normalState.operations.some(o=>o.username==='bob'&&o.action==='referred-by:carol'),'Normal referral creates actual reward and redemption');
    const repeat=await t.post('/referrals',{inviter:'carol'});t.check(repeat.status()===409&&user(await t.oracle(),'carol').balance===3100,'Normal referral has exactly-once reward');
    await t.post('/logout',{});await t.login();await t.post('/referrals',{inviter:'alice'});const after=await t.oracle();
    t.check(user(after,'alice').balance===(t.v?3100:3000),'Self-referral produces actual reward only in V');t.check(after.operations.some(o=>o.username==='alice'&&o.action==='referred-by:alice')===t.v,'Self-referral redemption is persisted only in V');
    if(!t.v){const legitimate=await t.post('/referrals',{inviter:'bob'});t.check(legitimate.status()===200&&user(await t.oracle(),'bob').balance===3100,'Rejected self-referral does not block a later legitimate referral');}
  }
};
