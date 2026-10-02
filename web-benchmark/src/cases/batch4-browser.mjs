import {groups} from './batch4-selection.mjs';

const ids=Object.values(groups.browser).flat(),active=new Set(ids);
const title={B0024:'表示名',B0028:'案内コード',B0030:'操作ボタン',B0032:'下書き',B0033:'コメント',B0037:'投稿一覧',B0039:'エラー表示',B0040:'翻訳表示',B0042:'検索結果',B0045:'外部の案内',B0051:'遅延処理',B0052:'計算欄',B0035:'整形文書',B0036:'本文の整形',B0038:'受信本文',B0069:'翻訳文',B0070:'操作ログ'};
const stored=new Set(['B0037','B0038','B0069','B0070']);
export const variantDefinitions=Object.entries(groups.browser).flatMap(([root,variants])=>variants.map(variant=>({
 root,variant,additionalVariant:true,title:title[variant],feature:'v4-browser-'+variant.slice(1),
 family:root==='R0061'?'サーバテンプレート再評価':'ブラウザ出力境界',entry:'/v4-browser',allowedPaths:['v4-browser'],
 requests:[['GET','/v4-browser',{text:'Hello'}],['POST','/v4-browser',{text:'Hello'}]],
 negativeDescription:'無害な投稿や表示は保持し、同じ入力がHTML・JavaScript・テンプレートとして実行されない。',
 implementationNote:'実HTML/JS応答とブラウザDOM境界を比較。保存型はrun内Redisに保存し再表示する。',
 ...(['B0037','B0070'].includes(variant)?{sessionProtectedPath:'/v4-browser'}:{})
})));
const key=id=>'v4:browser:'+id;
const safeScript=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('>','\\u003e');
export async function reset(){}
function render(id,text,v,run,escape){
 const esc=escape(text),proof='window.__v4Executed=true';
 switch(id){
 case 'B0024':return `<input id="entry" value=${v?text:'"'+esc+'"'}><p>設定値</p>`;
 case 'B0028':return `<script>const label=${v?'`'+text+'`':safeScript(text)};document.body.dataset.label=label;</script>`;
 case 'B0030':return v?`<button id="entry" onclick="window.show('${text}')">表示</button><script>window.show=x=>document.body.dataset.label=x</script>`:`<button id="entry">表示</button><script>const text=${safeScript(text)};document.getElementById('entry').addEventListener('click',()=>document.body.dataset.label=text)</script>`;
 case 'B0032':return `<textarea id="entry">${v?text:esc}</textarea>`;
 case 'B0033':return `<!--${v?text:text.replaceAll('--','- -').replaceAll('<','&lt;')}--><p>案内欄</p>`;
 case 'B0035':return `<article id="entry">${(v?text:esc).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')}</article>`;
 case 'B0036':return `<article id="entry">${v?text.replace(/<\/?script[^>]*>/gi,''):esc}</article>`;
 case 'B0037':return `<section id="entry">${v?text:esc}</section>`;
 case 'B0038':return text;
 case 'B0039':return `<div id="entry"></div><script>fetch(location.pathname+'/data?text='+encodeURIComponent(${safeScript(text)})).then(r=>r.json()).then(d=>document.getElementById('entry').${v?'innerHTML':'textContent'}=d.message)</script>`;
 case 'B0040':return `<section id="entry">${'<p>ようこそ {member}</p>'.replace('{member}',v?text:esc)}</section>`;
 case 'B0042':return `<div id="entry"></div><script>${v?'document.write(new URLSearchParams(location.search).get("text")||"")':'document.getElementById("entry").textContent=new URLSearchParams(location.search).get("text")||""'}</script>`;
 case 'B0045':return `<section id="entry"></section><script>fetch(location.pathname+'/data?text='+encodeURIComponent(${safeScript(text)})).then(r=>r.json()).then(d=>{${v?`const parsed=new DOMParser().parseFromString(d.message,'text/html');document.getElementById('entry').append(...parsed.body.childNodes);`:`document.getElementById('entry').textContent=d.message;`}})</script>`;
 case 'B0051':return `<div id="entry"></div><script>${v?`setTimeout(${safeScript(text)},0)`:`setTimeout(()=>document.getElementById('entry').textContent=${safeScript(text)},0)`}</script>`;
 case 'B0052':return `<div id="entry"></div><script>${v?`try{document.getElementById('entry').textContent=new Function(${safeScript(text)})()}catch{}`:`const value=${safeScript(text)};document.getElementById('entry').textContent=/^[0-9+* ()]{1,40}$/.test(value)?value:'Invalid expression'`}</script>`;
 case 'B0069':return `<div id="entry">${v?escape(text.replaceAll('{{secret}}',run.canary)):esc}</div>`;
 case 'B0070':return `<pre id="entry">${v?escape(text.replaceAll('{{secret}}',run.canary)):esc}</pre>`;
 default:throw Error('Unknown browser variant');
 }
}
export function register(router,{redis,esc,page,requireLogin,getRun,vulnerable}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v4-browser/data',selected,(req,res)=>{const text=String(req.query.text||'Hello');if(text.length>1024)return res.sendStatus(400);res.json({message:text});});
 router.post('/v4-browser',selected,async(req,res)=>{
  const id=getRun().variant,text=req.body?.text;
  if(typeof text!=='string'||Buffer.byteLength(text)>1024)return res.sendStatus(400);
  if(stored.has(id))await redis.set(key(id),text);
  res.json({saved:true,preview:getRun().base+'/v4-browser'});
 });
 router.get('/v4-browser',selected,async(req,res)=>{
  const run=getRun(),id=run.variant;
  if(['B0037','B0070'].includes(id)&&!requireLogin(req,res))return;
  const text=stored.has(id)?await redis.get(key(id))||'Hello':String(req.query.text||'Hello');
  if(Buffer.byteLength(text)>1024)return res.sendStatus(400);
  const content=render(id,text,vulnerable(),run,esc);
  if(id==='B0038')return res.type(vulnerable()?'html':'text/plain').send(content);
  res.type('html').send(page(title[id],`<form method="post"><label>内容 <input name="text" value="${esc(text)}"></label><button>保存</button></form>${content}`));
 });
}
export async function audit({redis,getRun}){
 const id=getRun().variant;if(!active.has(id))return {};
 return {batch4Browser:{variant:id,stored:stored.has(id)?await redis.get(key(id)):null}};
}
