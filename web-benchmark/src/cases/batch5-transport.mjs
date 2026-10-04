import {groups} from './batch5-selection.mjs';

const ids=['B0339','B0349','B0462'],active=new Set(ids);
const rootOf=Object.fromEntries(Object.entries(groups.transport).flatMap(([root,variants])=>variants.map(variant=>[variant,root])));
const titles={B0339:'ローカル管理情報',B0349:'組織別イベント',B0462:'認証ページ'};
export const definitions=[];
export const variantDefinitions=ids.map(variant=>({root:rootOf[variant],variant,additionalVariant:true,title:titles[variant],feature:'v5-transport-'+variant.slice(1),family:'ブラウザ通信の出所と主体',entry:'/v5-transport',allowedPaths:['v5-transport'],requests:[['GET','/v5-transport',{}],...(variant==='B0339'?[['GET','/v5-transport/local',{}]]:variant==='B0349'?[['GET','/v5-transport/events',{}]]:[['POST','/v5-transport/login',{username:'alice',password:'Fixture-alice-2026!'}]])],...(variant==='B0349'?{sessionProtectedPath:'/v5-transport/events'}:{}),negativeDescription:'同じ正常機能を保ち、別origin・別tenant・初回HTTP通信から秘密が漏れない。',implementationNote:'実CORS/PNA応答、SSEストリーム、HTTPS/HSTSとHTTP入口を比較する。'}));
let received=[];
export async function reset(){received=[];}
export function register(router,{db,getRun,vulnerable,requireLogin,page}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v5-transport',selected,(req,res)=>{
  if(getRun().variant==='B0462'&&!vulnerable()){
   if(!req.secure)return res.sendStatus(426);
   res.set('Strict-Transport-Security','max-age=31536000');
  }
  const eventLink=getRun().variant==='B0349'?`<p><a href="${getRun().base}/v5-transport/events?tenant=A">自分のイベント</a></p>`:'';
  res.type('html').send(page(titles[getRun().variant],'<p>ローカル実験の通信画面です。</p>'+eventLink));
 });
 router.options('/v5-transport/local',selected,(req,res)=>{
  if(getRun().variant!=='B0339')return res.sendStatus(404);
  if(vulnerable())res.set({'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Private-Network':'true'});
  else if(req.headers.origin==='https://app.benchmark.test:8443')res.set({'Access-Control-Allow-Origin':req.headers.origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Vary':'Origin'});
  res.sendStatus(204);
 });
 router.get('/v5-transport/local',selected,(req,res)=>{
  if(getRun().variant!=='B0339')return res.sendStatus(404);
  if(vulnerable())res.set('Access-Control-Allow-Origin','*');
  else if(req.headers.origin==='https://app.benchmark.test:8443')res.set({'Access-Control-Allow-Origin':req.headers.origin,'Vary':'Origin'});
  res.json({localOnlySecret:getRun().canary});
 });
 router.get('/v5-transport/events',selected,async(req,res)=>{
  if(getRun().variant!=='B0349')return res.sendStatus(404);if(!requireLogin(req,res))return;
  const requested=String(req.query.tenant||req.member.tenant);
  if(!['A','B'].includes(requested))return res.sendStatus(400);
  const owner=vulnerable()&&requested!==req.member.tenant?(requested==='B'?'carol':'alice'):req.member.name;
  const document=(await db.query('SELECT tenant,body FROM documents WHERE owner=$1 AND shared=false ORDER BY id LIMIT 1',[owner])).rows[0];
  res.set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
  res.end(`event: update\ndata: ${JSON.stringify({tenant:document?.tenant,body:document?.body})}\n\n`);
 });
 router.post('/v5-transport/login',selected,async(req,res)=>{
  if(getRun().variant!=='B0462')return res.sendStatus(404);
  if(!req.secure&&!vulnerable())return res.sendStatus(426);
  if(req.secure&&!vulnerable())res.set('Strict-Transport-Security','max-age=31536000');
  const username=String(req.body?.username||''),password=String(req.body?.password||'');
  const account=(await db.query('SELECT name,password FROM users WHERE name=$1',[username])).rows[0];
  if(!account||password!==account.password)return res.sendStatus(401);
  if(!req.secure)received.push({username,transport:'http',passwordObserved:true});
  res.json({loggedIn:true});
 });
}
export async function audit({getRun}){return active.has(getRun().variant)?{batch5Transport:{variant:getRun().variant,httpCredentialsObserved:received.length>0,events:received}}:{};}
