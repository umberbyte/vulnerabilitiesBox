import {groups} from './batch5-selection.mjs';

const ids=Object.values(groups.cache).flat(),active=new Set(ids);
const rootOf=Object.fromEntries(Object.entries(groups.cache).flatMap(([root,variants])=>variants.map(variant=>[variant,root])));
const titles={B0378:'公開ページの区切り解釈',B0379:'経路の段階的復号',B0381:'案内先の共有キャッシュ',B0389:'通信方式別の共有キャッシュ'};
export const definitions=[];
export const variantDefinitions=ids.map(variant=>({root:rootOf[variant],variant,additionalVariant:true,title:titles[variant],feature:'v5-cache-'+variant.slice(1),family:'共有キャッシュの解釈差',entry:variant==='B0378'||variant==='B0379'?'/v5-cache/public':'/v5-cache',allowedPaths:['v5-cache'],requests:[['GET',variant==='B0378'||variant==='B0379'?'/v5-cache/public':'/v5-cache',{}]],negativeDescription:'公開ページと個人応答・redirect・HTTPS応答が誤って同じ共有cache entryにならない。',implementationNote:'実Redisキャッシュへ順序付き要求を保存し、path・scheme・Locationの依存条件を比較する。'}));
export async function reset(){}
function pathPart(req){return new URL(req.originalUrl,'http://local').pathname.split('/v5-cache')[1]||'';}
function content(id,req,run){
 const raw=pathPart(req);
 if(id==='B0378')return {private:raw.includes(';private'),text:raw.includes(';private')?run.canary:'Public page'};
 if(id==='B0379'){const first=decodeURIComponent(raw),privatePath=first.includes('/private');return {private:privatePath,text:privatePath?run.canary:'Public page'};}
 if(id==='B0389')return {private:req.secure&&!!req.member,text:req.secure&&req.member?run.canary:'Public transport page'};
 return {redirect:req.query.destination||run.base+'/v5-cache/landing'};
}
function key(id,req,v,result){
 const raw=pathPart(req),base='v5:cache:'+id+':';
 if(id==='B0378')return base+(v?raw.split(';')[0]:raw);
 if(id==='B0379'){
  try{return base+(v?decodeURIComponent(decodeURIComponent(raw)):raw);}catch{return null;}
 }
 if(id==='B0381')return v?base+'redirect':null;
 if(id==='B0389')return !v&&result?.private?null:base+(v?'same':req.secure?'https':'http');
 return null;
}
export function register(router,{redis,getRun,vulnerable,page}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get(/^\/v5-cache(?:\/.*)?$/,selected,async(req,res)=>{
  const id=getRun().variant;if(req.path.endsWith('/landing'))return res.type('html').send(page('案内先','<p>通常の案内先です。</p>'));
  let result;try{result=content(id,req,getRun());}catch{return res.sendStatus(400);}
  if(id==='B0381'){
   const destination=String(result.redirect);
   if(![getRun().base+'/v5-cache/landing','https://evil.benchmark.test:8444/landing'].includes(destination))return res.sendStatus(400);
   if(!vulnerable()&&destination!==getRun().base+'/v5-cache/landing')return res.sendStatus(403);
  }
  const cacheKey=key(id,req,vulnerable(),result);
  if(cacheKey){const cached=await redis.get(cacheKey);if(cached){result=JSON.parse(cached);res.set('X-Benchmark-Cache','HIT');}
   else{await redis.set(cacheKey,JSON.stringify(result),{EX:120});res.set('X-Benchmark-Cache','MISS');}}
  else res.set('Cache-Control','private, no-store');
  if(id==='B0381')return res.redirect(302,result.redirect);
  res.json(result);
 });
}
export async function audit({redis,getRun}){
 if(!active.has(getRun().variant))return {};
 return {batch5Cache:{variant:getRun().variant,entryCount:(await redis.keys('v5:cache:'+getRun().variant+':*')).length}};
}
