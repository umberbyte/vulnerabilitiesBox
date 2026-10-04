import express from 'express';
import Busboy from 'busboy';
import {groups} from './batch4-selection.mjs';

const ids=Object.values(groups.csrf).flat(),active=new Set(ids);
const cors=new Set(groups.csrf.R0333);
const normal=Object.fromEntries(ids.map(id=>[id,{action:'update',csrf:'from-session',contact:'alice.updated@example.test'}]));
const title={B0312:'連絡先更新',B0315:'更新method',B0317:'JSON連絡先',B0318:'入力token',B0327:'添付申請',B0320:'送信元確認',B0321:'参照元確認',B0322:'参照元URL',B0334:'会員レポート',B0335:'会員レポート',B0336:'会員レポート'};
export const variantDefinitions=Object.entries(groups.csrf).flatMap(([root,variants])=>variants.map(variant=>({
 root,variant,additionalVariant:true,title:title[variant],feature:'v4-csrf-'+variant.slice(1),family:root==='R0333'?'CORS許可origin照合':'CSRF許可境界',
 entry:'/v4-csrf',allowedPaths:['v4-csrf'],requests:[['GET','/v4-csrf',{}],...(cors.has(variant)?[['GET','/v4-csrf/report',{}]]:[['POST','/v4-csrf',normal[variant]]])],
 sessionProtectedPath:'/v4-csrf',crossOriginPostPaths:root==='R0333'?[]:['/v4-csrf'],
 ...(root==='R0333'?{requiredTargetOrigins:['https://app.benchmark.test:8443','https://evil.benchmark.test:8444']} :{}),
 negativeDescription:'本人の正規更新と登録済みoriginからの閲覧を維持し、token欠落・偽装origin・別scheme/portで成功しない。',
 implementationNote:'実sessionのCSRF値、Origin/Referer、multipart parser、CORS応答headerを比較する。'
})));
export async function reset(){}
const sameOrigin=(req,value)=>{try{return new URL(value).origin==='https://app.benchmark.test:8443'||new URL(value).origin===req.protocol+'://'+req.headers.host;}catch{return false;}};
function allowCors(id,origin,v){
 if(!origin)return false;
 if(!v)return origin==='https://app.benchmark.test:8443';
 let url;try{url=new URL(origin);}catch{return false;}
 if(id==='B0334')return /benchmark\.test/.test(origin);
 if(id==='B0335')return url.hostname==='app.benchmark.test'&&url.port==='8443';
 if(id==='B0336')return url.protocol==='https:'&&url.hostname==='app.benchmark.test';
 return false;
}
async function multipartFields(req){
 const parser=Busboy({headers:req.headers,limits:{fields:8,fieldSize:256,files:0}}),fields={};let limited=false;
 parser.on('field',(name,value)=>{fields[name]=value;});parser.on('fieldsLimit',()=>limited=true);parser.on('filesLimit',()=>limited=true);
 await new Promise((resolve,reject)=>{parser.on('error',reject);parser.on('close',resolve);req.pipe(parser);});
 if(limited)throw Error('Multipart limit');return fields;
}
export function register(router,{db,getRun,vulnerable,requireLogin,page,esc}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v4-csrf',selected,(req,res)=>{
  if(!requireLogin(req,res))return;
  res.type('html').send(page(title[getRun().variant],`<form method="post"><input name="contact" value="${esc(req.member.contact)}"><input type="hidden" name="csrf" value="${esc(req.session.csrf)}"><button>保存</button></form><a href="${getRun().base}/v4-csrf/report">会員レポート</a>`));
 });
 router.get('/v4-csrf/report',selected,(req,res)=>{
  if(!cors.has(getRun().variant))return res.sendStatus(404);
  if(!requireLogin(req,res))return;
  const origin=req.headers.origin;
  if(allowCors(getRun().variant,origin,vulnerable()))res.set({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Vary':'Origin'});
  res.json({privateData:getRun().canary});
 });
 router.post('/v4-csrf',selected,express.text({type:'text/plain',limit:'2kb'}),async(req,res)=>{
  if(!requireLogin(req,res))return;
  const id=getRun().variant;if(cors.has(id))return res.sendStatus(404);
  let body=req.body||{};
  if(req.is('multipart/form-data')){try{body=await multipartFields(req);}catch{return res.sendStatus(400);}}
  else if(req.is('text/plain')){if(id!=='B0317'||!vulnerable())return res.sendStatus(415);try{body=JSON.parse(body);}catch{return res.sendStatus(400);}}
  if(typeof body!=='object'||Array.isArray(body)||body.action!=='update')return res.sendStatus(400);
  const token=String(body.csrf||''),v=vulnerable();let authorized=false;
  if(id==='B0312')authorized=v&&token===''||token===req.session.csrf;
  else if(id==='B0315')authorized=v&&body._method==='DELETE'||token===req.session.csrf;
  else if(id==='B0317')authorized=v&&req.is('text/plain')||token===req.session.csrf;
  else if(id==='B0318')authorized=v&&token.length===req.session.csrf.length||token===req.session.csrf;
  else if(id==='B0327')authorized=v&&req.is('multipart/form-data')||token===req.session.csrf;
  else if(id==='B0320')authorized=v&&req.headers.origin==='null'||token===req.session.csrf;
  else if(id==='B0321')authorized=v&&!req.headers.referer||token===req.session.csrf||sameOrigin(req,req.headers.referer);
  else if(id==='B0322')authorized=v&&String(req.headers.referer||'').includes('app.benchmark.test')||token===req.session.csrf||sameOrigin(req,req.headers.referer);
  else authorized=token===req.session.csrf;
  if(!authorized)return res.sendStatus(403);
  const contact=String(body.contact||'');if(!/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+$/.test(contact))return res.sendStatus(400);
  await db.query('UPDATE users SET contact=$1 WHERE name=$2',[contact,req.member.name]);
  await db.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,'v4-csrf-update-'+id]);
  res.json({updated:true,contact});
 });
}
export async function audit({db,getRun}){
 if(!active.has(getRun().variant))return {};
 return {batch4Csrf:{variant:getRun().variant,contact:(await db.query('SELECT contact FROM users WHERE name=$1',['alice'])).rows[0]?.contact}};
}
