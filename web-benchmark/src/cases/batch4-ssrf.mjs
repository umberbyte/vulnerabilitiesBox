import http from 'node:http';
import net from 'node:net';
import {SaxesParser} from 'saxes';
import {groups} from './batch4-selection.mjs';

const ids=Object.values(groups.ssrf).flat(),active=new Set(ids);
const normal={
 B0120:{relationship:'<Relationships><Relationship Target="http://public.fixture.test/"/></Relationships>'},
 B0161:{url:'http://public.fixture.test/'},B0165:{url:'http://public.fixture.test/'},
 B0166:{url:'http://public.fixture.test/'},B0173:{url:'http://public.fixture.test/'},
 B0174:{url:'http://public.fixture.test/'},B0175:{schema:{'$ref':'http://public.fixture.test/'}},
 B0177:{url:'http://public.fixture.test/'},
 B0180:{url:'http://public.fixture.test/',fallback:'http://public.fixture.test/'}
};
const title={B0120:'文書の関連資源',B0161:'URLの内容取得',B0165:'接続先の確認',B0166:'接続先の確認',B0173:'通知先登録',B0174:'連携元情報',B0175:'schema参照',B0177:'URL確認',B0180:'代替取得先'};
export const variantDefinitions=Object.entries(groups.ssrf).flatMap(([root,variants])=>variants.map(variant=>({
 root,variant,additionalVariant:true,title:title[variant],feature:'v4-fetch-'+variant.slice(1),family:'server fetchの接続先境界',
 entry:'/v4-fetch',allowedPaths:['v4-fetch'],requests:[['GET','/v4-fetch',{}],['POST','/v4-fetch',normal[variant]]],
 negativeDescription:'登録済み公開資源を取得でき、同じ入力経路から内部資源へ接続しない。',
 implementationNote:'閉じたloopback HTTPサーバと実HTTP要求で、文書参照・URL検査・転送先再検査を比較する。'
})));
let servers=[],ports={},records=[];
async function stop(){for(const server of servers){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}servers=[];ports={};}
export async function reset({getRun}){
 await stop();records=[];if(!active.has(getRun().variant))return;
 for(const [target,answer] of [['public','Public guide'],['private',getRun().canary]]){
  const server=http.createServer((req,res)=>{records.push({target,path:req.url});if(target==='public'&&req.url==='/missing'){res.writeHead(404);res.end('Missing');return;}res.writeHead(200,{'content-type':'text/plain'});res.end(answer);});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  servers.push(server);ports[target]=server.address().port;
 }
}
const knownHost=host=>['public.fixture.test','internal.fixture.test','[::1]','[::ffff:7f00:1]','[::ffff:127.0.0.1]'].includes(host);
function parse(value,id){
 if(typeof value!=='string'||Buffer.byteLength(value)>300)throw Error('URL size');
 const url=new URL(value);
 if(url.protocol!=='http:'||!knownHost(url.hostname)||url.port||url.search||url.hash||!['/','/missing','/.well-known/openid-configuration'].includes(url.pathname)||id!=='B0177'&&(url.username||url.password))throw Error('Unknown local fixture URL');
 return url;
}
async function fetchLocal(url){
 const target=url.hostname==='public.fixture.test'?'public':'private';
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:ports[target],path:url.pathname,agent:false,timeout:350},res=>{let body='';res.on('data',chunk=>{body+=chunk;if(body.length>1024)req.destroy(Error('Fixture output limit'));});res.on('end',()=>resolve({status:res.statusCode,body,target}));});
  req.on('timeout',()=>req.destroy(Error('Fixture deadline')));req.on('error',reject);req.end();
 });
}
function relationship(xml){
 if(typeof xml!=='string'||Buffer.byteLength(xml)>1024)throw Error('Relationship size');
 let target=null;const parser=new SaxesParser({xmlns:false});parser.on('opentag',tag=>{if(tag.name==='Relationship')target=tag.attributes.Target;});parser.write(xml).close();return target;
}
async function evaluate(id,body,v){
 let source;
 if(id==='B0120')source=relationship(body.relationship);
 else if(id==='B0175')source=body.schema?.$ref;
 else source=body.url;
 const url=parse(source,id);
 if(id==='B0174'&&url.pathname!=='/')throw Error('Issuer base required');
 if(id==='B0174')url.pathname='/.well-known/openid-configuration';
 const internal=url.hostname!=='public.fixture.test';
 if(id==='B0177'){
  const rawAuthority=source.slice('http://'.length).split('/')[0],checked=v?rawAuthority.split('@')[0]:url.hostname;
  if(checked!=='public.fixture.test')return {status:403,checked,connected:url.hostname};
 }else if(id==='B0165'){
  if(internal&&(!v||url.hostname!=='[::1]'))return {status:403};
 }else if(id==='B0166'){
  const mapped=url.hostname.startsWith('[::ffff:');if(internal&&(!v||!mapped))return {status:403};
 }else if(internal&&!v)return {status:403};
 if(id==='B0173')records.push({registeredCallback:source});
 let result=await fetchLocal(url);
 if(id==='B0180'&&result.status===404){
  const fallback=parse(body.fallback,id);
  if(!v&&fallback.hostname!=='public.fixture.test')return {status:403,initialStatus:404};
  result=await fetchLocal(fallback);
 }
 return result;
}
export function register(router,{getRun,vulnerable,page,esc}){
 const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
 router.get('/v4-fetch',selected,(req,res)=>res.type('html').send(page(title[getRun().variant],`<form method="post"><input name="url" value="${esc(normal[getRun().variant].url||'http://public.fixture.test/')}"><button>取得</button></form>`)));
 router.post('/v4-fetch',selected,async(req,res)=>{
  try{const result=await evaluate(getRun().variant,req.body||{},vulnerable());res.status(result.status===403?403:200).json(result);}
  catch{res.sendStatus(400);}
 });
}
export async function audit({getRun}){return active.has(getRun().variant)?{batch4Fetch:{variant:getRun().variant,records:[...records]}}:{};}
