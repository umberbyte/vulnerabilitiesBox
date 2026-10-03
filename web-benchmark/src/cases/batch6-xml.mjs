const safeStylesheet='<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0"><xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="/root/public"/></xsl:template></xsl:stylesheet>';
const safeInclude='<root xmlns:xi="http://www.w3.org/2001/XInclude" xml:base="file:///tmp/execution-fixture/public/"><xi:include href="public.xml" parse="xml"/></root>';
const safeXpath='string(/root/public)';
const cases={
  B0106:{root:'R0105',title:'XPath数値式',family:'XPath数値式評価',normal:'1',field:'position'},
  B0109:{root:'R0109',title:'XPath関数拡張',family:'XPath拡張関数',normal:safeXpath,field:'expression'},
  B0110:{root:'R0105',title:'XMLクエリ式再評価',family:'保存後XPath再評価',normal:'alice',field:'name'},
  B0112:{root:'R0111',title:'外部パラメータ実体',family:'DTD外部parameter entity',normal:'<root>Guide</root>',field:'xml'},
  B0114:{root:'R0113',title:'外部スキーマ',family:'schemaLocation外部参照',normal:'<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://127.0.0.1:8091/schema-public">Guide</root>',field:'xml'},
  B0115:{root:'R0113',title:'XSLT document',family:'XSLT外部文書読込',normal:safeStylesheet,field:'stylesheet'},
  B0116:{root:'R0116',title:'XSLT拡張関数',family:'XSLT拡張関数',normal:safeStylesheet,field:'stylesheet'},
  B0119:{root:'R0113',title:'XML base解決',family:'xml:base外部参照',normal:safeInclude,field:'xml'}
};
let records=[];
const definition=([variant,item])=>({root:item.root,variant,title:item.title,feature:'b6-xml-'+variant.slice(1),family:item.family,entry:'/xml-workbook',allowedPaths:variant==='B0110'?['xml-workbook','xml-workbook/saved','xml-workbook/result']:['xml-workbook'],requests:variant==='B0110'?[['GET','/xml-workbook',{}],['POST','/xml-workbook/saved',{name:item.normal}],['GET','/xml-workbook/result',{}]]:[['GET','/xml-workbook',{}],['POST','/xml-workbook',{[item.field]:item.normal}]],sessionProtectedPath:'/xml-workbook',negativeDescription:'許可されたXPath・XSLT処理は成功し、拡張関数マーカーや外部文書を起動しない。',implementationNote:['B0109','B0116'].includes(variant)?'隔離executor内の実lxml XPath/XSLTで拡張関数登録の有無を比較し、関数呼出しをマーカーファイルで確認する。':'既存の隔離executorで実libxml2 xmllintまたはxsltprocを起動。VはXPath式、保存後再評価、XSLT document()、xml:base解決を許可し、F/Nは固定入力契約と許可した参照先で処理する。'});
export const definitions=Object.entries(cases).filter(([variant])=>['B0109','B0116'].includes(variant)).map(definition);
export const variantDefinitions=Object.entries(cases).filter(([variant])=>!['B0109','B0116'].includes(variant)).map(entry=>({...definition(entry),additionalVariant:true}));
export async function reset(){records=[];}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>Object.hasOwn(cases,getRun().variant)?next():next('route');
  router.get('/xml-workbook',selected,(req,res)=>{if(!requireLogin(req,res))return;res.type('html').send(page('XML作業','<p>XMLの位置指定または変換を行います。</p>'));});
  router.post('/xml-workbook',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    const variant=getRun().variant,item=cases[variant],input=req.body?.[item.field];
    if(variant==='B0110')return res.sendStatus(404);
    if(typeof input!=='string'||Buffer.byteLength(input)>1024)return res.sendStatus(400);
    const extension=['B0109','B0116'].includes(variant);
    const response=await fetch((process.env.EXECUTOR_URL||'http://executor:8090')+(extension?'/xml-extension':'/xml-engine'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({variant,input,vulnerable:vulnerable()}),signal:AbortSignal.timeout(1500)});
    if(response.status===400)return res.sendStatus(400);
    const result=await response.json();
    records.push({variant,status:response.status,code:result.code,exposed:result.output.includes(getRun().canary),callback:result.callback===true,marker:result.marker===true});
    res.status(response.status).json(result);
  });
  router.post('/xml-workbook/saved',selected,async(req,res)=>{
    if(getRun().variant!=='B0110')return res.sendStatus(404);
    if(!requireLogin(req,res))return;
    const input=req.body?.name;if(typeof input!=='string'||input.length>80)return res.sendStatus(400);
    const response=await fetch((process.env.EXECUTOR_URL||'http://executor:8090')+'/xml-engine',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({variant:'B0110',operation:'save',input,vulnerable:vulnerable()}),signal:AbortSignal.timeout(1500)});
    if(response.status===200)records.push({variant:'B0110',phase:'save',status:200});
    res.status(response.status).send(await response.text());
  });
  router.get('/xml-workbook/result',selected,async(req,res)=>{
    if(getRun().variant!=='B0110')return res.sendStatus(404);
    if(!requireLogin(req,res))return;
    const response=await fetch((process.env.EXECUTOR_URL||'http://executor:8090')+'/xml-engine',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({variant:'B0110',operation:'run',vulnerable:vulnerable()}),signal:AbortSignal.timeout(1500)});
    if(response.status===400)return res.sendStatus(400);
    const result=await response.json();records.push({variant:'B0110',phase:'run',status:response.status,exposed:result.output.includes(getRun().canary)});
    res.status(response.status).json(result);
  });
}
export async function audit({getRun}){return Object.hasOwn(cases,getRun().variant)?{batch6Xml:{records:[...records]}}:{};}
