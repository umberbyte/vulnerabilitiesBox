import http2 from 'node:http2';
import net from 'node:net';

const variant='B0354';
let records=[];
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
function parseH1(buffer){
  const headerEnd=buffer.indexOf('\r\n\r\n');if(headerEnd<0)return null;
  if(headerEnd>2048)throw Error('Header budget');
  const lines=buffer.subarray(0,headerEnd).toString('latin1').split('\r\n'),first=lines.shift().split(' ');
  if(first.length!==3||!['GET','POST'].includes(first[0])||first[2]!=='HTTP/1.1')throw Error('Request line');
  const headers={};for(const line of lines){const i=line.indexOf(':');if(i<1)throw Error('Header');const name=line.slice(0,i).toLowerCase();if(headers[name])throw Error('Duplicate header');headers[name]=line.slice(i+1).trim();}
  const length=headers['content-length']===undefined?0:Number(headers['content-length']);
  if(!Number.isInteger(length)||length<0||length>4096)return null;
  const used=headerEnd+4+length;if(buffer.length<used)return null;
  return {method:first[0],target:first[1],used};
}
async function downstream(raw,canary){
  const trace=[],sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
    let buffer=Buffer.alloc(0);
    socket.on('data',part=>{
      buffer=Buffer.concat([buffer,part]);if(buffer.length>8192){socket.destroy();return;}
      try{for(let count=0;count<4;count++){
        const request=parseH1(buffer);if(!request)break;
        buffer=buffer.subarray(request.used);trace.push({method:request.method,target:request.target});
        const body=request.target==='/admin'?canary:'Public H1 response';
        socket.write(`HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
      }}catch{socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');}
    });
  });
  const port=await listen(server);
  try{return await new Promise((resolve,reject)=>{
    const socket=net.connect(port,'127.0.0.1'),chunks=[];
    const timer=setTimeout(()=>{socket.destroy();resolve({trace,rawResponse:Buffer.concat(chunks).toString('latin1')});},180);
    socket.on('connect',()=>socket.write(raw));socket.on('data',part=>chunks.push(part));
    socket.on('error',error=>{clearTimeout(timer);reject(error);});
  });}finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
}
async function h2Exchange(body,declaredLength,vulnerable,canary){
  const server=http2.createServer();
  server.on('stream',(stream,headers)=>{
    const chunks=[];let length=0;
    stream.on('data',part=>{length+=part.length;if(length>4096)stream.close();else chunks.push(part);});
    stream.on('end',async()=>{
      try{
        const received=Buffer.concat(chunks),downstreamLength=vulnerable?Number(headers['x-downstream-length']):received.length;
        if(!Number.isInteger(downstreamLength)||downstreamLength<0||downstreamLength>4096)throw Error('Invalid length');
        const h1=Buffer.concat([Buffer.from(`POST /public HTTP/1.1\r\nHost: public.lab\r\nContent-Length: ${downstreamLength}\r\n\r\n`),received]);
        const result=await downstream(h1,canary);
        stream.respond({':status':200,'content-type':'application/json'});stream.end(JSON.stringify({...result,h2BodyBytes:received.length,h1ContentLength:downstreamLength}));
      }catch{stream.respond({':status':400});stream.end();}
    });
  });
  const port=await listen(server),client=http2.connect(`http://127.0.0.1:${port}`);
  try{return await new Promise((resolve,reject)=>{
    const request=client.request({':method':'POST',':path':'/transfer','x-downstream-length':String(declaredLength)}),parts=[];
    const timer=setTimeout(()=>{request.close();reject(Error('H2 timeout'));},1500);
    request.on('data',part=>parts.push(part));request.on('end',()=>{clearTimeout(timer);try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch(error){reject(error);}});
    request.on('error',error=>{clearTimeout(timer);reject(error);});request.end(body);
  });}finally{client.close();await new Promise(resolve=>server.close(resolve));}
}
export const definitions=[];
export const variantDefinitions=[{root:'R0351',variant,additionalVariant:true,title:'H2長さ変換不一致',feature:'b6-h2-length',family:'H2からH1への要求境界',entry:'/h2-transfer',allowedPaths:['h2-transfer'],requests:[['GET','/h2-transfer',{}],['POST','/h2-transfer',{body:'Guide',downstreamLength:5}]],sessionProtectedPath:'/h2-transfer',negativeDescription:'正常なH2 DATAはH1へ転送でき、下流Content-Lengthが実body長と異なって新しい要求を作らない。',implementationNote:'Node HTTP/2の実フレームをloopback adapterが受信し、H1 downstreamの実TCP接続へ変換。Vだけ申告長をH1 Content-Lengthへ採用し、F/Nは受信DATA長から再計算する。'}];
export async function reset(){records=[];}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>getRun().variant===variant?next():next('route');
  router.get('/h2-transfer',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    res.type('html').send(page('H2転送','<p>文書をH2入口から下流へ転送します。</p>'));
  });
  router.post('/h2-transfer',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    const body=req.body?.body,declared=req.body?.downstreamLength;
    if(typeof body!=='string'||Buffer.byteLength(body)>2048||!Number.isInteger(declared)||declared<0||declared>2048)return res.sendStatus(400);
    const result=await h2Exchange(body,declared,vulnerable(),getRun().canary);
    records.push({h2BodyBytes:result.h2BodyBytes,h1ContentLength:result.h1ContentLength,adminReached:result.trace.some(item=>item.target==='/admin')});
    if(records.length>8)records.shift();
    res.json(result);
  });
}
export async function audit({getRun}){return getRun().variant===variant?{batch6H2:{records:[...records]}}:{};}
