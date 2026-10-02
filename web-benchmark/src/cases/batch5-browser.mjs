import {groups,primaryRoots} from './batch5-selection.mjs';

const ids=Object.values(groups.browser).flat(),active=new Set(ids);
const rootOf=Object.fromEntries(Object.entries(groups.browser).flatMap(([root,variants])=>variants.map(variant=>[variant,root])));
const titles={B0049:'追加モジュール',B0054:'画面設定の読み込み',B0056:'表示設定の読み込み',B0059:'信頼済みHTML',B0062:'案内ページ',B0348:'別画面からの通知'};
const all=ids.map(variant=>({root:rootOf[variant],variant,title:titles[variant],family:'ブラウザの信頼境界',feature:'v5-browser-'+variant.slice(1),entry:variant==='B0062'?'/v5-browser/page/guide/':'/v5-browser',allowedPaths:['v5-browser'],requests:[['GET',variant==='B0062'?'/v5-browser/page/guide/':'/v5-browser',{}]],negativeDescription:'通常の表示・モジュール・通知は成立し、任意script/汚染設定/偽装windowで実行状態に到達しない。',implementationNote:'vanilla JavaScript、Trusted Types、ブラウザのURL解決とpostMessage sourceを実際に使用する。',...(primaryRoots.has(rootOf[variant])&&groups.browser[rootOf[variant]][0]===variant?{}:{additionalVariant:true})}));
export const definitions=all.filter(x=>!x.additionalVariant);
export const variantDefinitions=all.filter(x=>x.additionalVariant);
export async function reset(){}
function body(id,v,base){
 if(id==='B0049')return `<p>登録済みモジュールを読み込みます。</p><div id="result"></div><script type="module">const spec=new URLSearchParams(location.search).get('module')||'approved';const allowed=${JSON.stringify(base+'/v5-browser/module/approved')};try{const source=spec==='approved'?allowed:spec;if(!${v}&&source!==allowed)throw Error('未登録');const module=await import(source);document.getElementById('result').textContent=module.message||'読み込み完了';}catch{document.getElementById('result').textContent='読み込み不可'}</script>`;
 if(id==='B0054'||id==='B0056')return `<div id="result"></div><script>const raw=new URLSearchParams(location.search).get('config')||'{}';let incoming={};try{incoming=JSON.parse(raw)}catch{};const settings=${v?'{}':'Object.create(null)'};for(const [key,value]of Object.entries(incoming)){if(!${v}&&['__proto__','prototype','constructor'].includes(key))continue;settings[key]=value};const target=document.getElementById('result');${id==='B0054'?`target.textContent=settings.allowPrivate?'管理設定が有効':'通常設定';`:`if(${v})target.innerHTML=settings.html||'通常プレビュー';else target.textContent=Object.hasOwn(settings,'html')?String(settings.html):'通常プレビュー';`}</script>`;
 if(id==='B0059')return `<div id="result"></div><script>const value=new URLSearchParams(location.search).get('html')||'<b>案内</b>';const target=document.getElementById('result');if(${v}){const policy=trustedTypes.createPolicy('benchmark-default',{createHTML:s=>s});target.innerHTML=policy.createHTML(value)}else target.textContent=value;</script>`;
 if(id==='B0062')return `<link rel="stylesheet" href="${v?'style.css':base+'/v5-browser/style.css'}"><p class="guide">案内文</p><div id="result">CSS適用確認</div>`;
 return `<iframe id="trusted" src="${base}/v5-browser/trusted"></iframe><div id="result">待機中</div><script>const trusted=document.getElementById('trusted');addEventListener('message',event=>{if(event.origin!==location.origin)return;if(!${v}&&event.source!==trusted.contentWindow)return;if(event.data?.action==='approve')document.getElementById('result').textContent='通知を受理'});</script>`;
}
export function register(router,{getRun,vulnerable,page}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v5-browser',selected,(req,res)=>{
  const id=getRun().variant;if(id==='B0062')return res.redirect(getRun().base+'/v5-browser/page/guide/');
  if(id==='B0059')res.set('Content-Security-Policy',"require-trusted-types-for 'script'; trusted-types benchmark-default");
  res.type('html').send(page(titles[id],body(id,vulnerable(),getRun().base)));
 });
 router.get('/v5-browser/module/approved',selected,(req,res)=>res.type('text/javascript').send("export const message='登録済みモジュール';"));
 router.get('/v5-browser/page/guide/',selected,(req,res)=>getRun().variant==='B0062'?res.type('html').send(page('案内ページ',body('B0062',vulnerable(),getRun().base))):res.sendStatus(404));
 router.get('/v5-browser/page/guide/style.css',selected,(req,res)=>{
  if(getRun().variant!=='B0062'||!vulnerable())return res.sendStatus(404);
  res.type('text/css').send('.guide{color:rgb(255,0,0)}');
 });
 router.get('/v5-browser/style.css',selected,(req,res)=>{res.set('X-Content-Type-Options','nosniff');res.type('text/css').send('.guide{color:rgb(0,80,160)}');});
 router.get('/v5-browser/trusted',selected,(req,res)=>res.type('html').send('<script>parent.postMessage({action:"approve"},location.origin)</script>'));
}
export async function audit({getRun}){return active.has(getRun().variant)?{batch5Browser:{variant:getRun().variant}}:{};}
