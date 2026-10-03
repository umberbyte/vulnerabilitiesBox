import {Client,Change,Attribute} from 'ldapts';
import {randomUUID} from 'node:crypto';

const base='dc=benchmark,dc=test',admin='cn=admin,'+base;
const normal={
  B0099:{uid:'alice'},B0100:{attribute:'uid',value:'alice'},B0101:{rdn:'alice'},
  B0102:{base:'ou=teamA,'+base},B0103:{scope:'one'},B0104:{attributes:['uid','cn']},
  B0181:{username:'alice',password:'Alice-ldap-2026!'}
};
const titles={B0099:'LDAPフィルタ値',B0100:'LDAP属性名',B0101:'LDAP DN値',B0102:'LDAPベースDN',B0103:'LDAP scope',B0104:'LDAP返却属性',B0181:'空パスワードbind'};
const active=new Set(Object.keys(normal));
let records=[],sessions=new Map();
const newClient=()=>new Client({url:process.env.LDAP_URL,timeout:1500,connectTimeout:1500});
async function withAdmin(work){
  const client=newClient();try{await client.bind(admin,'benchmark-local-fixture');return await work(client);}finally{await client.unbind().catch(()=>{});}
}
const entries=[
  ['dc=benchmark,dc=test',{objectClass:['top','dcObject','organization'],dc:'benchmark',o:'Benchmark'}],
  ['ou=teamA,dc=benchmark,dc=test',{objectClass:['top','organizationalUnit'],ou:'teamA'}],
  ['ou=teamB,dc=benchmark,dc=test',{objectClass:['top','organizationalUnit'],ou:'teamB'}]
];
function people(canary){
  const member=(uid,cn,description,postalAddress)=>({objectClass:['top','inetOrgPerson'],uid,cn,sn:cn,userPassword:uid==='bob'?'Bob-ldap-2026!':'Alice-ldap-2026!',description,postalAddress});
  return [
    ['uid=alice,dc=benchmark,dc=test',member('alice','Alice Direct','public',canary)],
    ['uid=alice,ou=teamA,dc=benchmark,dc=test',member('alice','Alice Team','public','Public address')],
    ['uid=bob,ou=teamB,dc=benchmark,dc=test',member('bob','Bob Private','private','Private address')]
  ];
}
export const definitions=Object.keys(normal).filter(id=>!['B0103','B0104'].includes(id)).map(variant=>({root:'R'+variant.slice(1),variant,title:titles[variant],feature:'b6-ldap-'+variant.slice(1),family:'LDAP検索・bind境界',entry:variant==='B0181'?'/ldap-login':'/ldap-workbook',allowedPaths:variant==='B0181'?['ldap-login','ldap-private']:['ldap-workbook'],requests:variant==='B0181'?[['POST','/ldap-login',normal[variant]],['GET','/ldap-private',{}]]:[['GET','/ldap-workbook',{}],['POST','/ldap-workbook',normal[variant]]],negativeDescription:'許可されたLDAP検索と資格情報bindは成功し、OU・秘密属性・匿名bindから保護対象へ到達しない。',implementationNote:'Compose内の実OpenLDAPとldaptsクライアントを使用。Vは利用者filter、属性名、DN、base、scope、返却属性または匿名bind結果を採用し、F/Nは固定境界で評価する。'}));
export const variantDefinitions=Object.keys(normal).filter(id=>['B0103','B0104'].includes(id)).map(variant=>({root:variant==='B0103'?'R0102':'R0094',variant,additionalVariant:true,title:titles[variant],feature:'b6-ldap-'+variant.slice(1),family:'LDAP検索範囲・返却属性',entry:'/ldap-workbook',allowedPaths:['ldap-workbook'],requests:[['GET','/ldap-workbook',{}],['POST','/ldap-workbook',normal[variant]]],negativeDescription:'正常な本人検索は成功し、別OUまたは秘密属性を返さない。',implementationNote:'実OpenLDAP上でscopeまたはattribute listのV/F/Nを比較する。'}));
export async function reset({getRun}){
  records=[];sessions=new Map();if(!active.has(getRun().variant))return;
  await withAdmin(async client=>{
    const all=[...entries,...people(getRun().canary)];
    for(const [dn,attributes] of all)try{await client.add(dn,attributes);}catch(error){if(error.name!=='EntryAlreadyExistsError'&&error.code!==68)throw error;}
    await client.modify('uid=alice,'+base,[new Change({operation:'replace',modification:new Attribute({type:'postalAddress',values:[getRun().canary]})})]);
  });
}
const filterEscape=value=>value.replace(/[\\*()\0]/g,char=>'\\'+char.charCodeAt(0).toString(16).padStart(2,'0'));
const dnEscape=value=>value.replace(/[\\,+"<>;=#]/g,char=>'\\'+char);
async function search(baseDN,options){
  return withAdmin(async client=>{
    try{const result=await client.search(baseDN,{sizeLimit:10,timeLimit:1,...options});return result.searchEntries.map(entry=>({...entry,dn:entry.dn}));}
    catch(error){if(error.name==='NoSuchObjectError'||error.code===32)return [];throw error;}
  });
}
async function evaluate(variant,body,v){
  let rows;
  if(variant==='B0099'){
    const uid=body.uid;if(typeof uid!=='string'||uid.length>70)return null;
    rows=await search(base,{scope:'sub',filter:`(|(uid=${v?uid:filterEscape(uid)}))`,attributes:['uid','cn']});
  }else if(variant==='B0100'){
    const {attribute,value}=body;
    if(!['uid','description'].includes(attribute)||typeof value!=='string'||value.length>30||!v&&attribute!=='uid')return null;
    rows=await search(base,{scope:'sub',filter:`(${v?attribute:'uid'}=${filterEscape(value)})`,attributes:['uid','cn']});
  }else if(variant==='B0101'){
    const rdn=body.rdn;if(typeof rdn!=='string'||rdn.length>60)return null;
    rows=await search(`uid=${v?rdn:dnEscape(rdn)},${base}`,{scope:'base',filter:'(objectClass=inetOrgPerson)',attributes:['uid','cn']});
  }else if(variant==='B0102'){
    const selected=body.base;if(!['ou=teamA,'+base,'ou=teamB,'+base].includes(selected)||!v&&selected!=='ou=teamA,'+base)return null;
    rows=await search(v?selected:'ou=teamA,'+base,{scope:'sub',filter:'(objectClass=inetOrgPerson)',attributes:['uid','cn']});
  }else if(variant==='B0103'){
    const scope=body.scope;if(!['one','sub'].includes(scope)||!v&&scope!=='one')return null;
    rows=await search(base,{scope:v?scope:'one',filter:'(objectClass=inetOrgPerson)',attributes:['uid','cn']});
  }else{
    const attributes=body.attributes;if(!Array.isArray(attributes)||attributes.length<1||attributes.length>3||attributes.some(item=>!['uid','cn','postalAddress'].includes(item))||!v&&attributes.some(item=>!['uid','cn'].includes(item)))return null;
    rows=await search('uid=alice,'+base,{scope:'base',filter:'(objectClass=inetOrgPerson)',attributes:v?attributes:['uid','cn']});
  }
  return rows;
}
export function register(router,{getRun,vulnerable,page,requireLogin}){
  const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
  router.get('/ldap-workbook',selected,(req,res)=>{if(getRun().variant==='B0181')return res.sendStatus(404);if(!requireLogin(req,res))return;res.type('html').send(page('ディレクトリ検索','<p>組織ディレクトリを検索します。</p>'));});
  router.post('/ldap-workbook',selected,async(req,res)=>{
    if(getRun().variant==='B0181')return res.sendStatus(404);
    if(!requireLogin(req,res))return;
    try{const rows=await evaluate(getRun().variant,req.body||{},vulnerable());if(rows===null)return res.sendStatus(400);
      const hasBob=rows.some(item=>String(item.dn).startsWith('uid=bob,')),exposed=JSON.stringify(rows).includes(getRun().canary);
      records.push({variant:getRun().variant,hasBob,exposed,count:rows.length});res.json({rows});
    }catch{res.sendStatus(422);}
  });
  router.post('/ldap-login',selected,async(req,res)=>{
    if(getRun().variant!=='B0181')return res.sendStatus(404);
    const username=req.body?.username,password=req.body?.password;
    if(username!=='alice'||typeof password!=='string'||password.length>80)return res.sendStatus(400);
    if(!vulnerable()&&password==='')return res.sendStatus(403);
    const client=newClient();let anonymous=false;
    try{
      if(password===''){await client.bind('','');anonymous=true;}
      else await client.bind('uid=alice,'+base,password);
      const session=randomUUID();sessions.set(session,username);
      records.push({variant:'B0181',passwordEmpty:password==='',anonymous,issued:true});
      res.cookie('ldap-fixture',session,{httpOnly:true,secure:req.secure,sameSite:'lax',path:getRun().base}).json({authenticated:true});
    }catch{res.sendStatus(403);}finally{await client.unbind().catch(()=>{});}
  });
  router.get('/ldap-private',selected,(req,res)=>{
    if(getRun().variant!=='B0181')return res.sendStatus(404);
    const token=/(?:^|;\s*)ldap-fixture=([^;]+)/.exec(req.headers.cookie||'')?.[1];
    if(!token||sessions.get(token)!=='alice')return res.sendStatus(403);
    res.json({privateData:getRun().canary});
  });
}
export async function audit({getRun}){return active.has(getRun().variant)?{batch6Ldap:{records:[...records],sessionCount:sessions.size}}:{};}
