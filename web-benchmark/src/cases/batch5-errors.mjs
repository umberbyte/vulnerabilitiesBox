import {groups} from './batch5-selection.mjs';

const id=groups.errors.R0481[0];
export const definitions=[];
export const variantDefinitions=[{root:'R0481',variant:id,additionalVariant:true,title:'SQL例外の詳細',feature:'v5-errors-0482',family:'エラー詳細の秘密漏えい',entry:'/v5-errors',allowedPaths:['v5-errors'],requests:[['GET','/v5-errors',{}],['POST','/v5-errors',{value:'1'}]],negativeDescription:'数値の正常照会は成功し、型エラーからSQL文や非公開値は漏れない。',implementationNote:'実PostgreSQL型変換エラーの返却範囲をV/Fで比較する。'}];
export async function reset(){}
export function register(router,{db,getRun,vulnerable,page}){
 const selected=(req,res,next)=>getRun().variant===id?next():next('route');
 router.get('/v5-errors',selected,(req,res)=>res.type('html').send(page('数値照会','<form method="post"><input name="value" value="1"><button>確認</button></form>')));
 router.post('/v5-errors',selected,async(req,res)=>{
  const value=String(req.body?.value||'');if(value.length>80)return res.sendStatus(400);
  const query=value==='report'?'SELECT title::integer AS value FROM items WHERE secret=true':'SELECT $1::integer AS value';
  try{const answer=await db.query(query,value==='report'?[]:[value]);res.json({value:answer.rows[0].value});}
  catch(error){res.status(400).json(vulnerable()?{error:error.message,query}:{error:'Invalid numeric value'});}
 });
}
export async function audit({getRun}){return getRun().variant===id?{batch5Errors:{variant:id}}:{};}
