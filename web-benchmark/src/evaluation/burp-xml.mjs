import {createHash} from 'node:crypto';
import {SaxesParser} from 'saxes';

export const XML_LIMITS=Object.freeze({bytes:32*1024*1024,depth:20,nodes:150000,issues:10000,doctypeBytes:65536,messageBytes:2*1024*1024,decodedBytes:32*1024*1024,messagesPerIssue:100});
export const sha256=value=>createHash('sha256').update(value).digest('hex');
const check=(condition,message)=>{if(!condition)throw new Error(message);};

// Burp includes an internal DTD. Declarations are checked, never applied, fetched,
// or added to Saxes ENTITIES. Only inert ELEMENT/ATTLIST declarations are allowed.
function inertDoctype(value,limits){
  check(Buffer.byteLength(value)<=limits.doctypeBytes,'XML DTD limit exceeded');
  const match=/^\s*issues\s*(?:\[([\s\S]*)\])?\s*$/.exec(value);
  check(match,'Only an internal issues DTD is supported');
  const body=match[1]||'';
  check(!/\b(?:ENTITY|SYSTEM|PUBLIC|NOTATION)\b|[%&]/i.test(body),'XML entity/external declarations are forbidden');
  const remaining=body.replace(/<!\s*(?:ELEMENT|ATTLIST)\s+[A-Za-z][A-Za-z0-9_-]*\s+[A-Za-z0-9_\s(),|*+?.#:\-="']+>/g,'');
  check(!remaining.trim(),'Unsupported XML DTD declaration');
}

function decodeXml(bytes){
  let encoding='utf-8',offset=0;
  if(bytes[0]===0xff&&bytes[1]===0xfe){encoding='utf-16le';offset=2;}
  else if(bytes[0]===0xfe&&bytes[1]===0xff){encoding='utf-16be';offset=2;}
  else if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)offset=3;
  else if(bytes[0]===0x3c&&bytes[1]===0&&bytes[2]===0x3f&&bytes[3]===0)encoding='utf-16le';
  else if(bytes[0]===0&&bytes[1]===0x3c&&bytes[2]===0&&bytes[3]===0x3f)encoding='utf-16be';
  let text;try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes.subarray(offset));}catch{throw new Error('Invalid XML byte encoding');}
  const declaration=/^\s*<\?xml\s+([^?]*)\?>/.exec(text)?.[1]||'';
  const declared=/\bencoding\s*=\s*['"]([^'"]+)['"]/.exec(declaration)?.[1]?.toLowerCase();
  if(declared)check(encoding==='utf-8'?['utf-8','utf8'].includes(declared):['utf-16',encoding].includes(declared),'XML encoding declaration differs from supported bytes');
  check(!/\bversion\s*=\s*['"](?!1\.0['"])/.test(declaration),'Only XML 1.0 is supported');
  return {text,encoding};
}

const fields=(node,name)=>node.children.filter(child=>child.name===name);
function scalar(node,name,{required=false}={}){
  const found=fields(node,name);check(found.length<=1,'Duplicate XML issue field: '+name);
  if(!found.length){check(!required,'Missing XML issue field: '+name);return '';}
  check(found[0].children.length===0,'Unexpected nested XML scalar: '+name);
  const value=found[0].text;check(!required||value.trim(),'Empty XML issue field: '+name);return value;
}
export function auxiliaryRoutes(requests=[]){
  check(Array.isArray(requests)&&requests.length<=8,'Invalid public auxiliary-route contract');const seen=new Set();
  return requests.map(route=>{
    check(route&&['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(route.method)&&typeof route.origin==='string'&&typeof route.path==='string','Invalid public auxiliary route');
    let origin;try{origin=new URL(route.origin);}catch{throw new Error('Invalid public auxiliary origin');}
    check(['http:','https:'].includes(origin.protocol)&&origin.origin===route.origin&&origin.port!=='8099','Invalid/private auxiliary origin');
    check(route.path.startsWith('/')&&!route.path.startsWith('//')&&new URL(route.path,route.origin).pathname===route.path&&!/[?#\\%]/.test(route.path),'Invalid public auxiliary path');
    check(!['/control','/oracle','/reset','/manifest','/catalog','/measurement','/database-proof','/mail','/health'].some(privatePath=>route.path===privatePath||route.path.startsWith(privatePath+'/')),'Private/control paths cannot be auxiliary targets');
    const key=route.method+' '+route.origin+route.path;check(!seen.has(key),'Duplicate public auxiliary route');seen.add(key);return {method:route.method,origin:route.origin,path:route.path};
  });
}
export function inScope(url,{workspace,origins,extraRoutes=[]}){
  let parsed;try{parsed=new URL(url);}catch{throw new Error('Invalid issue/request URL');}
  check(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password,'Unsupported issue/request URL');
  check(parsed.port!=='8099','Private control origin is outside scanner scope');
  check(origins.includes(parsed.origin),'Issue/request origin is outside the captured scope');
  // Encoded separators/dot segments can otherwise appear in-scope while reaching
  // a different route after a second decoder. Reject ambiguous source evidence.
  check(!/%(?:2f|5c|2e|25|00)/i.test(parsed.pathname)&&!parsed.pathname.includes('\\'),'Ambiguous encoded issue/request path');
  const routes=auxiliaryRoutes(extraRoutes),auxOrigin=routes.some(route=>route.origin===parsed.origin);
  // Public methods describe normal operation/seed inputs. Audit requests may
  // change the method, just as they may change Host or other diagnostic input.
  // The offline import scope constrains the destination, not that mutation.
  const declared=routes.some(route=>route.origin===parsed.origin&&route.path===parsed.pathname);
  const primary=!auxOrigin&&(parsed.pathname===workspace||parsed.pathname.startsWith(workspace+'/'));
  check(primary||declared,'Issue/request path is outside captured workspace/declared auxiliary routes');
  return parsed;
}
function message(node,kind,reference,scope,limits){
  check(node.children.length===0,'Unexpected nested HTTP message');
  const encoded=node.attrs.base64||'false';check(['true','false'].includes(encoded),'Invalid HTTP base64 attribute');
  let bytes;
  if(encoded==='true'){
    const value=node.text.replace(/[\t\r\n ]/g,'');
    check(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'Invalid HTTP base64');
    check(value.length<=Math.ceil(limits.messageBytes/3)*4,'Decoded HTTP message limit exceeded');
    bytes=Buffer.from(value,'base64');check(bytes.toString('base64')===value,'Noncanonical HTTP base64');
  }else bytes=Buffer.from(node.text,'utf8');
  check(bytes.length<=limits.messageBytes,'HTTP message limit exceeded');
  let method='';const headersComplete=bytes.includes(Buffer.from('\r\n\r\n'))||bytes.includes(Buffer.from('\n\n'));
  const responseStart=kind==='response'&&/^HTTP\/\d(?:\.\d)? \d{3}(?: [^\r\n]*)?\r?\n/.test(bytes.subarray(0,256).toString('latin1'));
  if(kind==='request'&&bytes.length){
    const header=bytes.subarray(0,Math.min(bytes.length,65536)).toString('latin1'),line=/^([A-Z][A-Z0-9_-]*) ([^\r\n ]+) HTTP\/\d(?:\.\d)?\r?\n/.exec(header);
    check(line,'HTTP request evidence must include an unambiguous full request line');method=line[1];
    const issueUrl=new URL(scope.issueUrl);
    // A scanner can deliberately mutate/duplicate Host to test a vulnerability.
    // It is payload data, not proof of the TCP connection destination. Keep it
    // verbatim; scope comes from the issue origin and HTTP request target.
    const target=/^https?:\/\//i.test(line[2])?line[2]:new URL(line[2],issueUrl.origin).href;
    check(line[2].startsWith('/')||/^https?:\/\//i.test(line[2]),'Unsupported HTTP request target');
    inScope(target,scope);
  }
  return {reference,kind,base64:encoded==='true',bytes,sha256:sha256(bytes),byteLength:bytes.length,method,httpEnvelopePresent:headersComplete&&(kind==='request'?!!method:responseStart)};
}

export function parseBurpXml(input,scope,overrides={}){
  const limits={...XML_LIMITS,...overrides},bytes=Buffer.isBuffer(input)?input:Buffer.from(input);
  check(bytes.length>0&&bytes.length<=limits.bytes,'XML report byte limit exceeded');
  const {text,encoding}=decodeXml(bytes);let root=null,nodes=0,decoded=0;const stack=[];
  const parser=new SaxesParser({xmlns:false,position:true});
  parser.on('error',()=>{throw new Error('Malformed XML report');});
  parser.on('doctype',value=>inertDoctype(value,limits));
  parser.on('processinginstruction',()=>{throw new Error('XML processing instructions are forbidden');});
  parser.on('opentag',tag=>{
    check(++nodes<=limits.nodes&&stack.length<limits.depth,'XML structural limit exceeded');
    check(!tag.name.includes(':')&&!Object.keys(tag.attributes).some(key=>key.includes(':')||key==='xmlns'),'XML namespaces are not supported');
    const node={name:tag.name,attrs:Object.fromEntries(Object.entries(tag.attributes)),children:[],text:''};
    if(stack.length)stack.at(-1).children.push(node);else{check(!root,'Multiple XML roots');root=node;}
    stack.push(node);
  });
  const content=value=>{if(stack.length)stack.at(-1).text+=value;};parser.on('text',content);parser.on('cdata',content);parser.on('closetag',()=>stack.pop());
  parser.write(text).close();
  check(root?.name==='issues','Expected a Burp issues XML report');check(!root.text.trim(),'Unexpected issues text');
  check(root.children.every(node=>node.name==='issue'),'Unexpected report root element');
  check(root.children.length<=limits.issues,'XML issue count limit exceeded');
  const ids=new Set(),messages=[];
  const findings=root.children.map((issue,index)=>{
    const id=scalar(issue,'serialNumber',{required:true}).trim();check(/^(?:0|[1-9]\d{0,18}|-[1-9]\d{0,18})$/.test(id),'Invalid Burp issue instance serialNumber');
    const serial=BigInt(id);check(serial>=-(2n**63n)&&serial<2n**63n&&!ids.has(id),'Invalid or duplicate Burp issue instance serialNumber');ids.add(id);
    const host=scalar(issue,'host',{required:true}).trim();let hostUrl;try{hostUrl=new URL(host);}catch{throw new Error('Invalid XML issue host');}
    check(hostUrl.href===hostUrl.origin+'/'&&!hostUrl.username&&!hostUrl.password,'Issue host must be an HTTP(S) origin');
    const issuePath=scalar(issue,'path',{required:true}).trim();check(issuePath.startsWith('/')||/^https?:\/\//i.test(issuePath),'Invalid XML issue path');
    const url=inScope(new URL(issuePath,hostUrl.origin).href,scope).href;
    const exchanges=fields(issue,'requestresponse');check(exchanges.length<=limits.messagesPerIssue,'HTTP exchange count limit exceeded');
    const refs=[];let method='';
    exchanges.forEach((exchange,pairIndex)=>{
      check(!exchange.text.trim()&&exchange.children.every(child=>['request','response','responseRedirected'].includes(child.name)),'Unexpected HTTP exchange structure');
      for(const kind of ['request','response']){
        const found=fields(exchange,kind);check(found.length<=1,'Duplicate HTTP exchange message');
        if(found.length){const ref=`issue[${index}]/requestresponse[${pairIndex}]/${kind}`,entry=message(found[0],kind,ref,{...scope,issueUrl:url},limits);decoded+=entry.byteLength;check(decoded<=limits.decodedBytes,'Total decoded HTTP limit exceeded');messages.push(entry);refs.push({reference:ref,kind,sha256:entry.sha256,byteLength:entry.byteLength,base64:entry.base64});if(!method)method=entry.method;}
      }
    });
    return {id,rule:scalar(issue,'type',{required:true}).trim(),name:scalar(issue,'name',{required:true}),url,method,parameter:'',messageId:refs.map(ref=>ref.reference).join(';'),risk:scalar(issue,'severity'),confidence:scalar(issue,'confidence'),location:scalar(issue,'location'),details:{issueBackground:scalar(issue,'issueBackground'),issueDetail:scalar(issue,'issueDetail'),remediationBackground:scalar(issue,'remediationBackground'),remediationDetail:scalar(issue,'remediationDetail')},sourceEvidence:refs,verdict:'pending',evidence:[],reason:''};
  });
  return {reportSha256:sha256(bytes),encoding,exportedVersion:root.attrs.burpVersion||null,exportTime:root.attrs.exportTime||null,findings,messages};
}
