import {groups} from './batch4-selection.mjs';

const ids=Object.values(groups.sql).flat();
const active=new Set(ids);
const normal={
 B0002:'1',B0004:'v4_public_items',B0007:'1,2',B0008:'2',B0009:'label',
 B0010:'apple',B0011:'Apple',B0012:'Apple',B0013:'title ILIKE \'%Apple%\' AND secret=false',
 B0014:'title',B0015:'0',B0016:'contact',B0017:'text',B0018:'"C"',
 B0019:'title',B0020:'@>'
};
const title={
 B0002:'商品番号の照会',B0004:'集計元の選択',B0007:'商品番号一覧',B0008:'表示件数',
 B0009:'属性での検索',B0010:'全文検索',B0011:'保存検索関数',B0012:'保存した帳票条件',
 B0013:'詳細条件の検索',B0014:'集計軸',B0015:'集計閾値',B0016:'連絡先更新',
 B0017:'表示形式',B0018:'並び替え言語',B0019:'帳票ビュー',B0020:'JSON属性照会'
};
export const variantDefinitions=Object.entries(groups.sql).flatMap(([root,variants])=>variants.map(variant=>({
 root,variant,additionalVariant:true,title:title[variant],feature:'v4-sql-'+variant.slice(1),
 family:'SQL入力の再解釈',entry:'/v4-sql',allowedPaths:['v4-sql'],
 requests:[['GET','/v4-sql',{}],['POST','/v4-sql',{value:normal[variant]}]],
 negativeDescription:'正常な商品照会・設定変更を保ち、同じ入力経路から保護値や管理権限を取得しない。',
 implementationNote:'同じPostgreSQLとNode APIで、この変種固有のSQL構築箇所をV/F/N比較する。',
 ...(variant==='B0016'?{sessionProtectedPath:'/v4-sql'}:{})
})));

export async function reset({db,getRun}){
 if(!active.has(getRun().variant))return;
 await db.query('DROP VIEW IF EXISTS v4_report');
 await db.query('CREATE OR REPLACE VIEW v4_public_items AS SELECT title FROM items WHERE secret=false');
 await db.query('CREATE TABLE IF NOT EXISTS v4_saved_report (name text PRIMARY KEY, predicate text NOT NULL)');
 await db.query('TRUNCATE v4_saved_report');
 if(getRun().variant==='B0011')await db.query(`CREATE OR REPLACE FUNCTION v4_dynamic(term text) RETURNS TABLE(title text) LANGUAGE plpgsql AS $v4$
 BEGIN RETURN QUERY EXECUTE 'SELECT title FROM items WHERE title ILIKE ''%' || term || '%'' AND secret=false'; END $v4$`);
}

function rows(result){return (Array.isArray(result)?result:[result]).flatMap(part=>part.rows||[]);}
function values(result){return rows(result).flatMap(row=>Object.values(row).filter(value=>typeof value==='string'));}
function reject(res){return res.status(400).json({error:'Unsupported search input'});}
const quoted=value=>/^\d{1,5}$/.test(value);
async function execute(db,id,value,v){
 switch(id){
 case 'B0002':return v?db.query(`SELECT title FROM items WHERE id=${value} AND secret=false`):quoted(value)?db.query('SELECT title FROM items WHERE id=$1 AND secret=false',[Number(value)]):null;
 case 'B0004':return v?db.query(`SELECT title FROM ${value}`):value==='v4_public_items'?db.query('SELECT title FROM v4_public_items'):null;
 case 'B0007':return v?db.query(`SELECT title FROM items WHERE id IN (${value}) AND secret=false`):/^\d+(,\d+){0,8}$/.test(value)?db.query('SELECT title FROM items WHERE id=ANY($1::int[]) AND secret=false',[value.split(',').map(Number)]):null;
 case 'B0008':return v?db.query(`SELECT title FROM items WHERE secret=false ORDER BY id LIMIT ${value}`):quoted(value)?db.query('SELECT title FROM items WHERE secret=false ORDER BY id LIMIT $1',[Math.min(Number(value),20)]):null;
 case 'B0009':return v?db.query(`SELECT title FROM items WHERE jsonb_extract_path_text(jsonb_build_object('label',title),'${value}')='Apple' AND secret=false`):db.query("SELECT title FROM items WHERE jsonb_extract_path_text(jsonb_build_object('label',title),$1)='Apple' AND secret=false",[value]);
 case 'B0010':return v?db.query(`SELECT title FROM items WHERE to_tsvector(title) @@ to_tsquery('${value}') AND secret=false`):db.query('SELECT title FROM items WHERE to_tsvector(title) @@ plainto_tsquery($1) AND secret=false',[value]);
 case 'B0011':return v?db.query('SELECT title FROM v4_dynamic($1)',[value]):db.query('SELECT title FROM items WHERE title ILIKE $1 AND secret=false',['%'+value+'%']);
 case 'B0012':{
  await db.query('INSERT INTO v4_saved_report(name,predicate) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET predicate=EXCLUDED.predicate',['member-report',value]);
  const stored=(await db.query('SELECT predicate FROM v4_saved_report WHERE name=$1',['member-report'])).rows[0].predicate;
  return v?db.query(`SELECT title FROM items WHERE title ILIKE '%${stored}%' AND secret=false`):db.query('SELECT title FROM items WHERE title ILIKE $1 AND secret=false',['%'+stored+'%']);
 }
 case 'B0013':{
  const builder={whereRaw:fragment=>db.query(`SELECT title FROM items WHERE ${fragment}`)};
  return v?builder.whereRaw(value):db.query('SELECT title FROM items WHERE title ILIKE $1 AND secret=false',['%'+value+'%']);
 }
 case 'B0014':return v?db.query(`SELECT ${value} AS axis FROM items WHERE secret=false`):['title','id'].includes(value)?db.query(`SELECT ${value} AS axis FROM items WHERE secret=false`):null;
 case 'B0015':return v?db.query(`SELECT title FROM items WHERE id>${value} AND secret=false`):quoted(value)?db.query('SELECT title FROM items WHERE id>$1 AND secret=false',[Number(value)]):null;
 case 'B0016':return v?db.query(`UPDATE users SET ${value}=$1 WHERE name='alice' RETURNING role`,[value==='role'?'admin':'alice.updated@example.test']):value==='contact'?db.query('UPDATE users SET contact=$1 WHERE name=$2 RETURNING role',['alice.updated@example.test','alice']):null;
 case 'B0017':return v?db.query(`SELECT title::${value} AS title FROM items WHERE secret=false`):value==='text'?db.query('SELECT title::text AS title FROM items WHERE secret=false'):null;
 case 'B0018':return v?db.query(`SELECT title FROM items WHERE secret=false ORDER BY title COLLATE ${value}`):value==='"C"'?db.query('SELECT title FROM items WHERE secret=false ORDER BY title COLLATE "C"'):null;
 case 'B0019':{
  if(!v&&value!=='title')return null;
  await db.query('DROP VIEW IF EXISTS v4_report');
  await db.query(`CREATE VIEW v4_report AS SELECT ${value} AS title FROM items WHERE secret=false`);
  return db.query('SELECT title FROM v4_report');
 }
 case 'B0020':return v?db.query(`SELECT title FROM items WHERE jsonb_build_object('label',title) ${value} '{"label":"Apple"}'::jsonb AND secret=false`):value==='@>'?db.query('SELECT title FROM items WHERE jsonb_build_object(\'label\',title) @> $1::jsonb AND secret=false',[JSON.stringify({label:'Apple'})]):null;
 default:throw Error('Unknown SQL variant');
 }
}
export function register(router,{db,page,esc,requireLogin,getRun,vulnerable}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v4-sql',selected,(req,res)=>{
  const id=getRun().variant;if(id==='B0016'&&!requireLogin(req,res))return;
  res.type('html').send(page(title[id],`<form method="post"><label>値 <input name="value" value="${esc(normal[id])}"></label><button>実行</button></form>`));
 });
 router.post('/v4-sql',selected,async(req,res)=>{
  const id=getRun().variant;if(id==='B0016'&&!requireLogin(req,res))return;
  const value=req.body?.value;if(typeof value!=='string'||Buffer.byteLength(value)>256)return reject(res);
  try {const result=await execute(db,id,value,vulnerable());if(!result)return reject(res);res.json({items:values(result),rows:rows(result).length});}
  catch{return reject(res);}
 });
}
export async function audit({db,getRun}){
 if(!active.has(getRun().variant))return {};
 const variant=getRun().variant;
 const result={variant};
 if(variant==='B0016')result.aliceRole=(await db.query('SELECT role FROM users WHERE name=$1',['alice'])).rows[0]?.role??null;
 return {batch4Sql:result};
}
