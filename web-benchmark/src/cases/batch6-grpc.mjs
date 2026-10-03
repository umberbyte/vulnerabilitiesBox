import http2 from 'node:http2';
import {gzipSync,gunzipSync} from 'node:zlib';

const variant='B0310';
let events=[];
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
function encodeOperation(action){
  const bytes=Buffer.from(action);
  if(bytes.length>32)throw Error('Operation too long');
  return Buffer.concat([Buffer.from([0x0a,bytes.length]),bytes]);
}
function decodeOperation(bytes){
  if(bytes.length<2||bytes[0]!==0x0a||bytes[1]!==bytes.length-2)throw Error('Invalid protobuf operation');
  const action=bytes.subarray(2).toString('utf8');
  if(!['read','archive'].includes(action))throw Error('Unknown action');
  return action;
}
function frame(bytes,compressed){
  const header=Buffer.alloc(5);header[0]=compressed?1:0;header.writeUInt32BE(bytes.length,1);
  return Buffer.concat([header,bytes]);
}
function decodeFrame(raw,encoding){
  if(raw.length<5||raw[0]>1||raw.readUInt32BE(1)!==raw.length-5||raw.length>4096)throw Error('Invalid gRPC frame');
  if((raw[0]===1)!==(encoding==='gzip'))throw Error('Compression metadata mismatch');
  return raw[0]===1?gunzipSync(raw.subarray(5),{maxOutputLength:1024}):raw.subarray(5);
}
async function grpcExchange(action,compressed,vulnerable,db,actor,role){
  const server=http2.createServer();
  server.on('stream',(stream,headers)=>{
    const chunks=[];let size=0;
    stream.on('data',part=>{size+=part.length;if(size>4096)stream.close();else chunks.push(part);});
    stream.on('end',async()=>{
      try{
        if(headers['content-type']!=='application/grpc'||headers[':path']!=='/fixture.Authorization/Execute')throw Error('Invalid gRPC route');
        const raw=Buffer.concat(chunks),encoding=headers['grpc-encoding'];
        if(!['identity','gzip'].includes(encoding))throw Error('Unsupported compression');
        const decoded=decodeOperation(decodeFrame(raw,encoding));
        // The vulnerable interceptor authorizes the still-compressed frame as a default read.
        const checked=vulnerable&&raw[0]===1?'read':decoded;
        const permitted=checked!=='archive'||role==='admin';
        events.push({actor,role,decoded,checked,compressed:raw[0]===1,permitted});
        if(!permitted){stream.respond({':status':200,'content-type':'application/grpc','grpc-status':'7'});stream.end(frame(Buffer.from('permission denied'),false));return;}
        if(decoded==='archive')await db.query('INSERT INTO operations(username,action) VALUES($1,$2)',[actor,'grpc-archive']);
        const answer=Buffer.from(decoded==='archive'?'Archived private record':'Public record');
        stream.respond({':status':200,'content-type':'application/grpc','grpc-status':'0'});stream.end(frame(answer,false));
      }catch{stream.respond({':status':200,'content-type':'application/grpc','grpc-status':'13'});stream.end(frame(Buffer.from('invalid message'),false));}
    });
  });
  const port=await listen(server),client=http2.connect(`http://127.0.0.1:${port}`);
  try{return await new Promise((resolve,reject)=>{
    const request=client.request({':method':'POST',':path':'/fixture.Authorization/Execute','content-type':'application/grpc','grpc-encoding':compressed?'gzip':'identity'}),chunks=[];
    let responseHeaders={};const timer=setTimeout(()=>{request.close();reject(Error('gRPC timeout'));},1500);
    request.on('response',headers=>responseHeaders=headers);
    request.on('data',part=>chunks.push(part));
    request.on('end',()=>{
      clearTimeout(timer);
      const bytes=Buffer.concat(chunks);
      try{if(bytes.length<5||bytes.readUInt32BE(1)!==bytes.length-5)throw Error('Invalid response frame');resolve({grpcStatus:Number(responseHeaders['grpc-status']),message:bytes.subarray(5).toString('utf8')});}catch(error){reject(error);}
    });
    request.on('error',error=>{clearTimeout(timer);reject(error);});
    const payload=encodeOperation(action),packed=compressed?gzipSync(payload):payload;
    request.end(frame(packed,compressed));
  });}finally{client.close();await new Promise(resolve=>server.close(resolve));}
}
export const definitions=[{root:'R0310',variant,title:'gRPC interceptor順序',feature:'b6-grpc-interceptor',family:'gRPC認可と復号順序',entry:'/grpc-operations',allowedPaths:['grpc-operations'],requests:[['GET','/grpc-operations',{}],['POST','/grpc-operations',{action:'read',compressed:false}]],sessionProtectedPath:'/grpc-operations',negativeDescription:'通常のgRPC readは使え、圧縮された管理actionが復号後に認可をすり抜けない。',implementationNote:'Node HTTP/2上にgRPCの5-byte message envelopeと小さなprotobuf operationを実装。gzip圧縮frameをV interceptorだけ復号前にread扱いし、handlerは復号後のactionを実行する。F/Nは復号済み同一messageで認可する。'}];
export const variantDefinitions=[];
export async function reset(){events=[];}
export function register(router,{db,getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>getRun().variant===variant?next():next('route');
  router.get('/grpc-operations',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    res.type('html').send(page('gRPC操作','<p>圧縮可能な操作メッセージを処理します。</p>'));
  });
  router.post('/grpc-operations',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    if(!['read','archive'].includes(req.body?.action)||typeof req.body?.compressed!=='boolean')return res.sendStatus(400);
  const result=await grpcExchange(req.body.action,req.body.compressed,vulnerable(),db,req.member.name,req.member.role);
    res.status(result.grpcStatus===0?200:result.grpcStatus===7?403:400).json(result);
  });
}
export async function audit({db,getRun}){
  if(getRun().variant!==variant)return {};
  const archived=(await db.query("SELECT count(*)::integer AS n FROM operations WHERE action='grpc-archive'")).rows[0].n;
  return {batch6Grpc:{events:[...events],archived}};
}
