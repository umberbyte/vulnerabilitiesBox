import http from 'node:http';

const variant='B0176';
const normal='<resource href="http://public.fixture.test/asset"/>';
let servers=[],ports={},records=[];
function pdf(text){
  const safe=text.replace(/[^\x20-\x7e]/g,' ').replace(/[\\()]/g,'\\$&').slice(0,256);
  const drawing=`BT /F1 12 Tf 40 740 Td (${safe}) Tj ET`;
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let output='%PDF-1.4\n',offsets=[0];
  for(let i=0;i<objects.length;i++){
    offsets.push(Buffer.byteLength(output));output+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref=Buffer.byteLength(output);
  output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))output+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  output+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
function parseDocument(document){
  if(typeof document!=='string'||Buffer.byteLength(document)>1024)throw Error('Invalid document');
  const match=/^<resource href="(http:\/\/(?:public|internal)\.fixture\.test\/asset)"\/>$/.exec(document);
  if(!match)throw Error('Invalid resource');
  return new URL(match[1]);
}
async function fetchResource(url){
  const target=url.hostname==='public.fixture.test'?'public':'private';
  return new Promise((resolve,reject)=>{
    const request=http.request({host:'127.0.0.1',port:ports[target],path:url.pathname,agent:false,timeout:400},response=>{
      const parts=[];let size=0;
      response.on('data',part=>{size+=part.length;if(size>512)request.destroy(Error('Resource too large'));else parts.push(part);});
      response.on('end',()=>resolve(Buffer.concat(parts).toString('utf8')));
    });
    request.on('timeout',()=>request.destroy(Error('Resource timeout')));request.on('error',reject);request.end();
  });
}
export const definitions=[];
export const variantDefinitions=[{root:'R0117',variant,additionalVariant:true,title:'PDFレンダラURL',feature:'b6-pdf-resource',family:'PDF生成時のserver fetch',entry:'/pdf-document',allowedPaths:['pdf-document'],requests:[['GET','/pdf-document',{}],['POST','/pdf-document',{document:normal}]],sessionProtectedPath:'/pdf-document',negativeDescription:'許可された公開資源を含むPDFは生成でき、内部資源へのcallbackは生じない。',implementationNote:'小さな実PDF生成器が文書内のresource URLをloopback HTTP fixtureから取得してPDF本文へ描画。Vは内部資源も取得し、F/Nは取得前に公開宛先へ限定する。'}];
export async function reset({getRun}){
  for(const server of servers){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
  servers=[];ports={};records=[];
  if(getRun().variant!==variant)return;
  for(const [target,body] of [['public','Public PDF resource'],['private',getRun().canary]]){
    const server=http.createServer((req,res)=>{records.push({target,path:req.url});res.writeHead(200,{'content-type':'text/plain'});res.end(body);});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    servers.push(server);ports[target]=server.address().port;
  }
}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>getRun().variant===variant?next():next('route');
  router.get('/pdf-document',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    res.type('html').send(page('PDF文書','<p>文書内の関連資源を読み込み、PDFを生成します。</p>'));
  });
  router.post('/pdf-document',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    try{
      const url=parseDocument(req.body?.document);
      if(!vulnerable()&&url.hostname!=='public.fixture.test')return res.sendStatus(403);
      const body=await fetchResource(url);
      res.type('application/pdf').send(pdf(body));
    }catch{res.sendStatus(400);}
  });
}
export async function audit({getRun}){return getRun().variant===variant?{batch6Pdf:{records:[...records]}}:{};}
