const definition=(root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote)=>({root,variant,title,feature,family,entry,allowedPaths,requests,negativeDescription,implementationNote});
const normalSvg='<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="#165cb2"/></svg>';

export const definitions=[
  definition('R0022','B0022','表示名プレビュー','label-preview','引用済みHTML属性値','/label-preview',['label-preview'],[['GET','/label-preview',{quotedAttr:'Hello'}]],'引用済みの表示名に山括弧・単引用符・event風の文字列を含めても、属性や要素を追加せず入力値として利用できる。','GET反射のdouble-quoted input valueに値を出力。Vだけ属性値を未符号化にし、F/Nは属性値を符号化する。実クリックによる生成event handlerの実行で検証。保存型・別引用符の変種まで受入済みとはしない。'),
  definition('R0025','B0025','ボタン情報プレビュー','button-preview','利用者指定のHTML属性名','/button-preview',['button-preview'],[['GET','/button-preview',{attrName:'title',attrValue:'Open details'}]],'titleなど許可した属性にはeventコードに似た文字列を設定できるが、利用者指定のevent属性名は生成しない。','属性値は全条件で引用・符号化し、属性名の選択だけを比較。Vは文法上正しい属性名を許可し、F/Nはtitle・aria-label・data-noteの固定許可表を使う。onclickと実クリックで成立を確認する。'),
  definition('R0026','B0026','資料リンクプレビュー','link-preview','リンクURLの実行scheme','/link-preview',['link-preview','link-destination'],[['GET','/link-preview',{linkUrl:'link-destination?label=Guide'}],['GET','/link-destination',{label:'Guide'}]],'javascriptという語をquery値に含む正常なローカル資料リンクは利用でき、文字列は遷移先でも表示データとして扱う。','href属性は全条件で引用・符号化。Vだけ実行schemeを許可し、F/NはWHATWG URLで解析したhttp/httpsの同一origin・同一workspaceリンクに制限する。ローカルのリンク操作のみで検証し、外部リンクやopen redirectの網羅性は扱わない。'),
  definition('R0027','B0027','挨拶プレビュー','greeting-preview','inline JS文字列のコード連結','/greeting-preview',['greeting-preview','greeting-data'],[['GET','/greeting-preview',{jsString:'Hello'}],['GET','/greeting-data',{jsString:'Hello'}]],'double quoteやmarkup風の文字列を挨拶の表示値として使える。JS文字列を終了する入力も修正版ではそのままテキストになる。','Vはsingle-quoted JS文字列へ値を連結する。backslash・改行・HTML script終了境界は別途保護し、quoteによるJS構文境界だけを残す。F/Nは固定JSが別JSON応答を取得してtextContentで表示する。JSONルートは全条件の正常契約へ共通で掲載。template literal・eventコード・保存型変種は今回実装しない。'),
  definition('R0029','B0029','案内文プレビュー','notice-preview','JSONのHTML script終了境界','/notice-preview',['notice-preview'],[['GET','/notice-preview',{inlineJson:'Hello'}]],'quote・JSコード風の文字列はJSON文字列として正常に表示され、script終了に見える入力も修正版では文字列のまま保持する。','全条件でJSON.stringifyを使用しJS/JSON文字列のquote境界を保護。Vはapplication/json script要素へHTML安全化せず埋め込み、F/Nは<・>・&等をJSON unicode escapeへ変換する。HTML parserによるscript終了と実script実行を確認し、R0027のJS値連結とは区別する。'),
  definition('R0031','B0031','テーマ色プレビュー','theme-preview','style要素内のCSS値境界','/theme-preview',['theme-preview'],[['GET','/theme-preview',{cssValue:'#165cb2'}]],'正常な6桁hex色を使用でき、CSS/JS風の不正な値は修正版でも説明用の文字列として表示する。色の設定先は固定し、不正値では既定色に戻す。','Vは固定colorプロパティの値をstyle要素へ未検証で挿入する。F/Nは6桁hex色のみを採用し、入力の説明表示はHTML符号化する。style終了によるHTML/script実行を実Chromiumで確認する。CSS expression実行や外部resource読込の変種は受入対象にしない。'),
  definition('R0034','B0034','アイコンプレビュー','icon-preview','inline SVG構造の許可制限','/icon-preview',['icon-preview'],[['GET','/icon-preview',{svg:normalSvg}]],'許可したviewBox・title・circleを描画でき、title内のevent風の文字列は説明テキストとして保持する。event属性等の許可外構造は既定アイコンに戻す。','Vは利用者SVG markupをinline化。F/Nは固定viewBox、任意のtitle、単一circleと範囲内cx/cy/r・6桁hex fillからなる狭い文法だけを再構築する。一般SVGの正規表現sanitizerとは称さず、属性順・複雑な要素・namespace・URL属性・animation等は対象外。SVG onloadの実実行で検証する。')
];

// These reflected renderers have no persistent state. The shared fixture reset
// still clears the existing database/session/browser conditions for each arm.
export async function reset(){}

function jsonForHtml(value){
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,character=>({'<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029'}[character]));
}
function jsStringWithoutHtmlBreakout(value){
  return value.replace(/\\/g,'\\\\').replace(/</g,'\\u003c').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
function safeIcon(source,esc){
  // Accept a small documented drawing grammar and reconstruct every element.
  // Nothing outside this grammar is passed through as markup.
  const shape=/^<svg\s+viewBox=(['"])0 0 32 32\1\s*>\s*(?:<title>([\s\S]*?)<\/title>\s*)?<circle\s+cx=(['"])(\d+(?:\.\d+)?)\3\s+cy=(['"])(\d+(?:\.\d+)?)\5\s+r=(['"])(\d+(?:\.\d+)?)\7\s+fill=(['"])(#[a-fA-F0-9]{6})\9\s*\/\s*>\s*<\/svg>$/;
  const match=shape.exec(source);
  if(!match)return normalSvg;
  const [cx,cy,r]=[match[4],match[6],match[8]].map(Number);
  if(cx>32||cy>32||r<=0||r>16||match[2]?.length>256)return normalSvg;
  return `<svg viewBox="0 0 32 32">${match[2]===undefined?'':'<title>'+esc(match[2])+'</title>'}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${match[10].toLowerCase()}"/></svg>`;
}

export function register(router,ctx){
  const {getRun,vulnerable,page,esc}=ctx;
  const get=(route,root,handler)=>router.get(route,(req,res,next)=>getRun().root===root?handler(req,res,next):next());
  const html=(res,title,body)=>res.set('Cache-Control','no-store').type('html').send(page(title,body));
  const input=(req,res,name,fallback)=>{
    const value=req.query[name]??fallback;
    if(typeof value!=='string'||value.length>4096){res.status(400).type('text').send('Invalid preview value');return null;}
    return value;
  };
  const form=fields=>'<form method="get">'+fields.map(([name,value])=>`<label>${esc(name)}<input name="${name}" value="${esc(value)}"></label>`).join('')+'<button>表示</button></form>';

  get('/label-preview','R0022',(req,res)=>{
    const value=input(req,res,'quotedAttr','Hello');if(value===null)return;
    html(res,'表示名プレビュー',form([['quotedAttr',value]])+`<label>表示名<input id="caption" value="${vulnerable()?value:esc(value)}"></label>`);
  });
  get('/button-preview','R0025',(req,res)=>{
    const name=input(req,res,'attrName','title');if(name===null)return;
    const value=input(req,res,'attrValue','Open details');if(value===null)return;
    const validName=/^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(name);
    const allowed=validName&&(vulnerable()||['title','aria-label','data-note'].includes(name));
    html(res,'ボタン情報プレビュー',form([['attrName',name],['attrValue',value]])+`<button id="attribute-button"${allowed?' '+name+'="'+esc(value)+'"':''}>詳細を開く</button>`);
  });
  get('/link-preview','R0026',(req,res)=>{
    const value=input(req,res,'linkUrl','link-destination?label=Guide');if(value===null)return;
    let href=value;
    if(!vulnerable()){
      try{
        const origin=req.protocol+'://'+req.get('host'),url=new URL(value,origin+getRun().base+'/link-preview');
        if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password||!url.pathname.startsWith(getRun().base+'/'))href='#invalid-link';
        else href=url.pathname+url.search+url.hash;
      }catch{href='#invalid-link';}
    }
    html(res,'資料リンクプレビュー',form([['linkUrl',value]])+`<a id="preview-link" href="${esc(href)}">資料を開く</a><p><code id="link-value">${esc(value)}</code></p>`);
  });
  get('/link-destination','R0026',(req,res)=>{
    const value=input(req,res,'label','Guide');if(value===null)return;
    html(res,'資料',`<p id="guide-label">${esc(value)}</p><a href="${getRun().base}/link-preview">リンク設定へ戻る</a>`);
  });
  get('/greeting-preview','R0027',(req,res)=>{
    const value=input(req,res,'jsString','Hello');if(value===null)return;
    const content=vulnerable()?`<p id="greeting"></p><script>const greeting='${jsStringWithoutHtmlBreakout(value)}';document.getElementById('greeting').textContent=greeting;</script>`:`<p id="greeting"></p><script>const value=document.querySelector('input[name="jsString"]').value;fetch('${getRun().base}/greeting-data?jsString='+encodeURIComponent(value)).then(response=>response.json()).then(data=>{document.getElementById('greeting').textContent=data.message})</script>`;
    html(res,'挨拶プレビュー',form([['jsString',value]])+content);
  });
  get('/greeting-data','R0027',(req,res)=>{
    const value=input(req,res,'jsString','Hello');if(value===null)return;
    res.set('Cache-Control','no-store').json({message:value});
  });
  get('/notice-preview','R0029',(req,res)=>{
    const value=input(req,res,'inlineJson','Hello');if(value===null)return;
    const data={message:value},serialized=vulnerable()?JSON.stringify(data):jsonForHtml(data);
    html(res,'案内文プレビュー',form([['inlineJson',value]])+`<script id="notice-data" type="application/json">${serialized}</script><p id="notice"></p><script>try{const data=JSON.parse(document.getElementById('notice-data').textContent);document.getElementById('notice').textContent=data.message}catch{document.getElementById('notice').textContent='案内文を読み込めませんでした'}</script>`);
  });
  get('/theme-preview','R0031',(req,res)=>{
    const value=input(req,res,'cssValue','#165cb2');if(value===null)return;
    const selected=vulnerable()||/^#[a-fA-F0-9]{6}$/.test(value)?value:'#165cb2';
    html(res,'テーマ色プレビュー',form([['cssValue',value]])+`<style id="theme">#theme-swatch{color:${selected};}</style><p id="theme-swatch">テーマ色の見本</p><code id="theme-value">${esc(value)}</code>`);
  });
  get('/icon-preview','R0034',(req,res)=>{
    const value=input(req,res,'svg',normalSvg);if(value===null)return;
    html(res,'アイコンプレビュー',form([['svg',value]])+`<div id="icon">${vulnerable()?value:safeIcon(value,esc)}</div><pre id="icon-source">${esc(value)}</pre>`);
  });
}
