import {groups} from './batch4-selection.mjs';

const ids=groups.auth.R0271,active=new Set(ids);
const normal={B0274:{tenant:'A'},B0276:{scope:'mine'},B0277:{q:'document'},B0278:{id:101},B0286:{sourceId:101},B0289:{id:101,expand:false}};
const title={B0274:'文書一覧',B0276:'文書集計',B0277:'文書検索',B0278:'検索結果の取得',B0286:'文書の共有コピー',B0289:'関連文書'};
export const variantDefinitions=ids.map(variant=>({
 root:'R0271',variant,additionalVariant:true,title:title[variant],feature:'v4-object-'+variant.slice(1),family:'オブジェクト認可',
 entry:'/v4-object',allowedPaths:['v4-object'],requests:[['GET','/v4-object',{}],['POST','/v4-object',normal[variant]],...(variant==='B0278'?[['GET','/v4-object/result/{id}',{}, {id:101}]]:[])],
 sessionProtectedPath:'/v4-object',negativeDescription:'本人の文書と許可された共有文書は取得でき、他主体・他tenantの本文や集計を取得しない。',
 implementationNote:'同じPostgreSQL documents表に対する一覧・集計・全文検索・結果取得・共有コピー・関連展開の認可点を分離する。'
}));
export async function reset({db,getRun}){
 if(!active.has(getRun().variant))return;
 await db.query('CREATE TABLE IF NOT EXISTS v4_document_copies (source_id integer,owner text,body text)');
 await db.query('TRUNCATE v4_document_copies');
}
async function document(db,id){return (await db.query('SELECT id,owner,tenant,shared,body FROM documents WHERE id=$1',[id])).rows[0];}
const readable=(item,member)=>item&&(item.owner===member.name||item.shared);
export function register(router,{db,getRun,vulnerable,requireLogin,page,esc}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v4-object',selected,(req,res)=>{if(!requireLogin(req,res))return;res.type('html').send(page(title[getRun().variant],`<p>${esc(req.member.name)}の文書</p><form method="post"><input name="id" value="101"><button>参照</button></form>`));});
 router.get('/v4-object/result/:id',selected,async(req,res)=>{
  if(getRun().variant!=='B0278')return res.sendStatus(404);if(!requireLogin(req,res))return;
  const id=Number(req.params.id);if(!Number.isInteger(id))return res.sendStatus(400);
  const item=await document(db,id);if(!item)return res.sendStatus(404);
  if(!vulnerable()&&!readable(item,req.member))return res.sendStatus(403);
  res.json({id:item.id,body:item.body});
 });
 router.post('/v4-object',selected,async(req,res)=>{
  if(!requireLogin(req,res))return;
  const id=getRun().variant,body=req.body||{},member=req.member,v=vulnerable();
  if(id==='B0274'){
   const tenant=String(body.tenant||member.tenant);if(!['A','B'].includes(tenant))return res.sendStatus(400);
   const rows=(await db.query(v?'SELECT id,owner,body FROM documents WHERE tenant=$1 ORDER BY id':'SELECT id,owner,body FROM documents WHERE tenant=$1 AND (owner=$2 OR shared=true) ORDER BY id',v?[tenant]:[member.tenant,member.name])).rows;
   return res.json({documents:rows});
  }
  if(id==='B0276'){
   const scope=String(body.scope||'mine');if(!['mine','all'].includes(scope))return res.sendStatus(400);
   if(scope==='all'&&!v)return res.sendStatus(403);
   const rows=(await db.query(scope==='mine'?'SELECT string_agg(body,\'|\') AS summary FROM documents WHERE owner=$1':'SELECT string_agg(body,\'|\') AS summary FROM documents',[member.name].slice(0,scope==='mine'?1:0))).rows;
   return res.json({summary:rows[0]?.summary});
  }
  if(id==='B0277'){
   const q=body.q;if(typeof q!=='string'||q.length>60)return res.sendStatus(400);
   const rows=(await db.query(v?'SELECT id,body FROM documents WHERE to_tsvector(body) @@ plainto_tsquery($1) ORDER BY id':'SELECT id,body FROM documents WHERE to_tsvector(body) @@ plainto_tsquery($1) AND (owner=$2 OR shared=true) ORDER BY id',v?[q]:[q,member.name])).rows;
   return res.json({results:rows});
  }
  if(id==='B0278'){
   const item=await document(db,Number(body.id));if(!item)return res.sendStatus(404);
   return res.json({resultId:item.id});
  }
  if(id==='B0286'){
   const item=await document(db,Number(body.sourceId));if(!item)return res.sendStatus(404);
   if(!v&&!readable(item,member))return res.sendStatus(403);
   await db.query('INSERT INTO v4_document_copies(source_id,owner,body) VALUES($1,$2,$3)',[item.id,member.name,item.body]);
   return res.json({copied:true,body:item.body});
  }
  if(id==='B0289'){
   const item=await document(db,Number(body.id));if(!readable(item,member))return res.sendStatus(403);
   const result={id:item.id,body:item.body};
   if(body.expand){const related=await document(db,102);if(v||readable(related,member))result.related={id:related.id,body:related.body};}
   return res.json(result);
  }
  res.sendStatus(404);
 });
}
export async function audit({db,getRun}){
 if(!active.has(getRun().variant))return {};
 return {batch4Objects:{variant:getRun().variant,copies:(await db.query('SELECT source_id,owner,body FROM v4_document_copies')).rows}};
}
