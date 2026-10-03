import {SaxesParser} from 'saxes';
import {zipRead} from './batch2-storage.mjs';

const variant='B0147';
let preview='',scriptReceipts=0,sourcePart=null;
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function parseXml(source,onTag){
  const parser=new SaxesParser({xmlns:true});parser.on('opentag',onTag);parser.write(source).close();
}
function extractHtml(encoded){
  const entries=new Map(zipRead(encoded).map(entry=>[entry.name,entry.data]));
  const document=entries.get('word/document.xml'),relationships=entries.get('word/_rels/document.xml.rels');
  if(!document||!relationships||!entries.has('[Content_Types].xml'))throw Error('Not a DOCX fixture');
  let relationId=null,target=null;
  parseXml(document.toString('utf8'),tag=>{
    if(tag.local==='altChunk'&&tag.uri==='http://schemas.openxmlformats.org/wordprocessingml/2006/main')relationId=Object.values(tag.attributes).find(attribute=>attribute.local==='id'&&attribute.uri==='http://schemas.openxmlformats.org/officeDocument/2006/relationships')?.value;
  });
  if(!relationId||relationId.length>40)throw Error('HTML part not referenced');
  parseXml(relationships.toString('utf8'),tag=>{
    if(tag.local==='Relationship'&&tag.attributes.Id?.value===relationId&&tag.attributes.Type?.value?.endsWith('/aFChunk'))target=tag.attributes.Target?.value;
  });
  if(!target||!/^afchunk[0-9]*\.html$/.test(target))throw Error('Unsupported HTML part');
  const name='word/'+target,html=entries.get(name);
  if(!html||html.length>8192)throw Error('Missing HTML part');
  return {name,html:html.toString('utf8')};
}
function cleanHtml(source){
  let result='',blocked=0,root=false;
  const permitted=new Set(['p','b','i','br','strong','em']);
  const parser=new SaxesParser({xmlns:false});
  parser.on('opentag',tag=>{
    if(tag.name==='root'){root=true;return;}
    if(!permitted.has(tag.name))blocked++;
    else if(!blocked)result+='<'+tag.name+'>';
  });
  parser.on('text',value=>{if(!blocked)result+=escape(value);});
  parser.on('closetag',tag=>{
    if(tag.name==='root')return;
    if(!permitted.has(tag.name))blocked--;
    else if(!blocked)result+='</'+tag.name+'>';
  });
  parser.write('<root>'+source+'</root>').close();
  if(!root||blocked!==0)throw Error('Invalid HTML fragment');
  return result;
}
export const definitions=[];
export const variantDefinitions=[{root:'R0034',variant,additionalVariant:true,title:'文書HTML抽出',feature:'b6-docx-html',family:'Office HTMLプレビュー',entry:'/document-import',allowedPaths:['document-import','document-preview','document-script-marker'],requests:[['GET','/document-import',{}]],sessionProtectedPath:'/document-import',negativeDescription:'正常DOCXのHTML部品はプレビューでき、部品内のscriptが同一originで実行されない。',implementationNote:'実ZIP/OOXMLのdocument.xml、relationship、HTML altChunkを解決。Vだけ抽出HTMLを同一originへ直接挿入し、F/Nは許可した装飾要素とtextへ再構築する。Chromiumで実行差を確認。'}];
export async function reset(){preview='';scriptReceipts=0;sourcePart=null;}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>getRun().variant===variant?next():next('route');
  router.get('/document-import',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    res.type('html').send(page('文書取り込み','<p>DOCX文書のHTML部品をプレビューします。</p>'));
  });
  router.post('/document-import',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    try{
      const extracted=extractHtml(req.body?.docx),cleaned=cleanHtml(extracted.html);
      sourcePart=extracted.name;preview=vulnerable()?extracted.html:cleaned;
      res.status(201).json({preview:getRun().base+'/document-preview'});
    }catch{res.sendStatus(400);}
  });
  router.get('/document-preview',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    if(!sourcePart)return res.sendStatus(404);
    res.type('html').send(page('文書プレビュー',`<article id="document-preview">${preview}</article>`));
  });
  router.post('/document-script-marker',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    if(scriptReceipts>=4)return res.sendStatus(429);
    scriptReceipts++;res.sendStatus(204);
  });
}
export async function audit({getRun}){return getRun().variant===variant?{batch6Docx:{sourcePart,scriptReceipts}}:{};}
