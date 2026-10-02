import {graphql,buildSchema} from 'graphql';
import {groups} from './batch4-selection.mjs';

const chosen=['R0094','R0095','R0291'];
const ids=chosen.flatMap(root=>groups.auth[root]),active=new Set(ids);
const title={B0094:'会員属性',B0288:'会員カード',B0295:'会員API',B0304:'会員一覧の出力',B0297:'連絡先設定',B0298:'連絡先の差分',B0299:'連絡先の更新',B0292:'管理メニュー',B0293:'旧管理API',B0294:'管理RPC'};
const normal={
 B0094:{fields:'name,contact'},B0288:{objectId:101},B0295:{query:'{ member { name } }'},
 B0304:{format:'csv'},B0297:{profile:{contact:'alice.updated@example.test'}},
 B0298:{patch:[{op:'replace',path:'/contact',value:'alice.updated@example.test'}]},
 B0299:{contact:'alice.updated@example.test'},B0292:{action:'view'},B0293:{action:'rebuild'},B0294:{action:'rebuild'}
};
export const variantDefinitions=chosen.flatMap(root=>groups.auth[root].map(variant=>({
 root,variant,additionalVariant:true,title:title[variant],feature:'v4-profile-'+variant.slice(1),family:root==='R0095'?'保護属性への一括更新':root==='R0291'?'機能認可':'秘密属性の読取許可',
 entry:'/v4-profile',allowedPaths:['v4-profile'],
 requests:variant==='B0292'?[['GET','/v4-profile',{}],['GET','/v4-profile/management',{}],['PATCH','/v4-profile/management',{action:'rebuild'}]]:variant==='B0293'?[['GET','/v4-profile',{}],['POST','/v4-profile/legacy',{action:'rebuild'}]]:variant==='B0294'?[['GET','/v4-profile',{}],['POST','/v4-profile/rpc',{action:'rebuild'}]]:[['GET','/v4-profile',{}],['POST','/v4-profile',normal[variant]]],
 sessionProtectedPath:'/v4-profile',
 negativeDescription:'会員が通常属性を読取・更新できても、秘密属性・管理操作は権限外へ広がらない。',
 implementationNote:'PostgreSQLの会員roleと文書、GraphQL field、CSV exportを同一Nodeサービスで比較する。'
})));
const schema=buildSchema('type Member { name: String!, secret: String } type Query { member: Member! }');
const own=async(db,name)=>(await db.query('SELECT name,contact,role,password FROM users WHERE name=$1',[name])).rows[0];
export async function reset(){}
export function register(router,{db,getRun,vulnerable,requireLogin,page,esc}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v4-profile',selected,(req,res)=>{
  if(!requireLogin(req,res))return;
  res.type('html').send(page(title[getRun().variant],`<p>${esc(req.member.name)}の会員設定</p><form method="post"><input name="contact" value="${esc(req.member.contact)}"><button>保存</button></form>`));
 });
 router.get('/v4-profile/management',selected,(req,res)=>{
  if(getRun().variant!=='B0292')return res.sendStatus(404);
  if(!requireLogin(req,res))return;if(req.member.role!=='admin')return res.sendStatus(403);
  res.json({action:'rebuild',available:true});
 });
 router.patch('/v4-profile/management',selected,async(req,res)=>{
  if(getRun().variant!=='B0292')return res.sendStatus(404);
  if(!requireLogin(req,res))return;
  if(req.body?.action!=='rebuild')return res.sendStatus(400);
  if(!vulnerable()&&req.member.role!=='admin')return res.sendStatus(403);
  await db.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,'rebuild-report']);
  res.json({completed:true});
 });
 for(const [variant,route] of [['B0293','/v4-profile/legacy'],['B0294','/v4-profile/rpc']])router.post(route,selected,async(req,res)=>{
  if(getRun().variant!==variant)return res.sendStatus(404);
  if(!requireLogin(req,res))return;if(req.body?.action!=='rebuild')return res.sendStatus(400);
  if(!vulnerable()&&req.member.role!=='admin')return res.sendStatus(403);
  await db.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,variant==='B0293'?'legacy-rebuild':'rpc-rebuild']);
  res.json({completed:true});
 });
 router.post('/v4-profile',selected,async(req,res)=>{
  if(!requireLogin(req,res))return;
  const id=getRun().variant,body=req.body||{},v=vulnerable(),member=req.member;
  if(id==='B0094'){
   const fields=String(body.fields||'name,contact').split(',').map(x=>x.trim());
   if(fields.length>8||fields.some(x=>!['name','contact','role','password'].includes(x)))return res.sendStatus(400);
   const allowed=v?fields:fields.filter(x=>['name','contact'].includes(x));const row=await own(db,member.name);
   return res.json({member:Object.fromEntries(allowed.map(field=>[field,row[field]]))});
  }
  if(id==='B0288'){
   const objectId=Number(body.objectId);if(objectId!==101)return res.sendStatus(404);
   const row=await own(db,member.name);
   return res.json({member:{name:row.name,contact:row.contact,...(v?{secret:getRun().canary}:{})}});
  }
  if(id==='B0295'){
   const query=body.query;if(typeof query!=='string'||query.length>300)return res.sendStatus(400);
   const result=await graphql({schema,source:query,rootValue:{member:()=>({name:member.name,secret:v?getRun().canary:null})}});
   return res.json(result);
  }
  if(id==='B0304'){
   if(body.format!=='csv')return res.sendStatus(400);
   const row=await own(db,member.name),cells=v?['name,contact,secret',`${row.name},${row.contact},${getRun().canary}`]:['name,contact',`${row.name},${row.contact}`];
   return res.type('text/csv').send(cells.join('\r\n')+'\r\n');
  }
  let contact=null,role=null;
  if(id==='B0297'){
   const model=body.profile;if(!model||typeof model!=='object'||Array.isArray(model))return res.sendStatus(400);
   contact=model.contact;role=v?model.role:null;
  }else if(id==='B0298'){
   if(!Array.isArray(body.patch)||body.patch.length>4)return res.sendStatus(400);
   for(const operation of body.patch){if(operation.op!=='replace'||!['/contact','/role'].includes(operation.path))return res.sendStatus(400);if(operation.path==='/contact')contact=operation.value;if(operation.path==='/role'&&v)role=operation.value;}
  }else if(id==='B0299'){contact=body.contact;role=v?body.role:null;}
  else return res.sendStatus(404);
  if(contact!==null&&contact!==undefined){if(typeof contact!=='string'||!/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+$/.test(contact))return res.sendStatus(400);await db.query('UPDATE users SET contact=$1 WHERE name=$2',[contact,member.name]);}
  if(role!==null&&role!==undefined){if(!['user','admin'].includes(role))return res.sendStatus(400);await db.query('UPDATE users SET role=$1 WHERE name=$2',[role,member.name]);}
  const row=await own(db,member.name);res.json({contact:row.contact,role:row.role});
 });
}
export async function audit({db,getRun}){
 if(!active.has(getRun().variant))return {};
 const row=(await db.query('SELECT role,contact FROM users WHERE name=$1',['alice'])).rows[0];
 return {batch4Profile:{variant:getRun().variant,aliceRole:row.role,aliceContact:row.contact}};
}
