import {createHash} from 'node:crypto';
import {groups} from './batch4-selection.mjs';

const ids=groups.cache.R0371,active=new Set(ids);
const titles={B0372:'検索キャッシュ',B0373:'会員カード',B0374:'下書きキャッシュ',B0375:'表示形式',B0376:'認証応答',B0385:'共有HTML断片',B0386:'組織別文書',B0388:'GET検索本文'};
const ordinary={B0372:'/v4-cache?q=public',B0373:'/v4-cache',B0374:'/v4-cache',B0375:'/v4-cache',B0376:'/v4-cache',B0385:'/v4-cache',B0386:'/v4-cache?id=101',B0388:'/v4-cache'};
export const variantDefinitions=ids.map(variant=>({
 root:'R0371',variant,additionalVariant:true,title:titles[variant],feature:'v4-cache-'+variant.slice(1),family:'共有キャッシュの依存条件key漏れ',
 entry:ordinary[variant],allowedPaths:['v4-cache'],requests:[['GET','/v4-cache',variant==='B0372'?{q:'public'}:variant==='B0386'?{id:101}:{}],...(variant==='B0374'?[['POST','/v4-cache',{draft:'ordinary'}]]:[])],
 ...(new Set(['B0373','B0385','B0386']).has(variant)?{sessionProtectedPath:'/v4-cache'}:{}),
 negativeDescription:'別主体・別query・別method・別形式・別tenantの応答が共有されず、通常のキャッシュヒットは維持される。',
 implementationNote:'Redis応答キャッシュのkeyまたはno-store境界をV/Fで切り替え、順序付き二要求で応答混線を測る。'
}));
export async function reset(){}
const digest=value=>createHash('sha256').update(String(value)).digest('hex').slice(0,24);
function responseData(id,req,run){
 const member=req.member,body=req.body||{},query=req.query;
 if(id==='B0372')return {query:String(query.q||'public'),result:String(query.q||'public')==='private'?run.canary:'Public search result'};
 if(id==='B0373')return {card:member?member.name+':'+(member.name==='alice'?run.canary:member.contact):'Anonymous card'};
 if(id==='B0374')return {method:req.method,draft:req.method==='POST'?String(body.draft||'ordinary'):'Published draft'};
 if(id==='B0375')return {format:String(req.headers.accept||'application/json'),content:String(req.headers.accept||'').includes('text/html')?'<b>'+run.canary+'</b>':'Public JSON record'};
 if(id==='B0376')return {authorized:!!member,profile:member?member.name+':'+run.canary:'Public profile'};
 if(id==='B0385')return {fragment:'<aside>'+member.name+':'+(member.name==='alice'?run.canary:member.contact)+'</aside>'};
 if(id==='B0386')return {id:String(query.id||101),tenant:member.tenant,document:member.tenant==='A'?run.canary:'Tenant B record'};
 return {body:String(body.term||''),result:String(body.term||'')==='private'?run.canary:'Public body result'};
}
function cachePolicy(id,req,v){
 const base='v4:cache:'+id+':'+req.path;
 if(id==='B0372')return base+(v?'':':q='+String(req.query.q||''));
 if(id==='B0373')return v?base:null;
 if(id==='B0374')return base+(v?'':':method='+req.method);
 if(id==='B0375')return base+(v?'':':accept='+String(req.headers.accept||''));
 if(id==='B0376')return req.member&&!v?null:base;
 if(id==='B0385')return base+(v?'':':subject='+req.member.name);
 if(id==='B0386')return base+':id='+String(req.query.id||101)+(v?'':':tenant='+req.member.tenant);
 if(id==='B0388')return v?base:null;
 return null;
}
export function register(router,{redis,getRun,vulnerable,requireLogin,page}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v4-cache',selected,(req,res,next)=>{
  if(new Set(['B0373','B0385','B0386']).has(getRun().variant)&&!requireLogin(req,res))return;
  if(req.accepts('html')&&req.query.view==='form')return res.type('html').send(page(titles[getRun().variant],'<p>共有キャッシュの例です。</p>'));
  next();
 });
 const respond=async(req,res)=>{
  const id=getRun().variant;if(!active.has(id))return res.sendStatus(404);
  if(new Set(['B0373','B0385','B0386']).has(id)&&!requireLogin(req,res))return;
  if(req.method==='POST'&&id!=='B0374')return res.sendStatus(405);
  if(id==='B0388'&&!vulnerable()&&req.headers['content-length']&&Number(req.headers['content-length'])>0)return res.sendStatus(400);
  if(id==='B0388'&&!vulnerable()&&req.body&&Object.keys(req.body).length)return res.sendStatus(400);
  const key=cachePolicy(id,req,vulnerable());
  const deliver=result=>id==='B0375'&&result.format.includes('text/html')?res.type('html').send(result.content):res.json(result);
  if(key){const hit=await redis.get(key);if(hit){res.set('X-Benchmark-Cache','HIT');return deliver(JSON.parse(hit));}}
  const result=responseData(id,req,getRun());
  if(key){await redis.set(key,JSON.stringify(result),{EX:120});res.set('X-Benchmark-Cache','MISS');}
  else res.set('Cache-Control','private, no-store');
  if(id==='B0375'&&!vulnerable())res.set('Vary','Accept');
  deliver(result);
 };
 router.get('/v4-cache',selected,respond);router.post('/v4-cache',selected,respond);
}
export async function audit({redis,getRun}){
 if(!active.has(getRun().variant))return {};
 const keys=await redis.keys('v4:cache:'+getRun().variant+':*');
 return {batch4Cache:{variant:getRun().variant,keys:keys.map(digest),entries:keys.length}};
}
