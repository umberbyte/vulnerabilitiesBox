import net from 'node:net';

const variant='B0355';
const preface=Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n');
let records=[];
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
function frame(type,flags,stream,payload){
  const head=Buffer.alloc(9);head.writeUIntBE(payload.length,0,3);head[3]=type;head[4]=flags;head.writeUInt32BE(stream,5);
  return Buffer.concat([head,payload]);
}
function literal(name,value){
  const key=Buffer.from(name),data=Buffer.from(value);
  if(key.length>127||data.length>127)throw Error('Header too large');
  return Buffer.concat([Buffer.from([0,key.length]),key,Buffer.from([data.length]),data]);
}
function headerBlock(value){
  return Buffer.concat([
    literal(':method','GET'),literal(':scheme','http'),literal(':path','/public'),
    literal(':authority','public.lab'),literal('x-note',value)
  ]);
}
function decodeHeaders(block){
  let cursor=0;const headers={};
  while(cursor<block.length){
    if(block[cursor++]!==0)throw Error('Only literal HPACK is supported');
    const keyLength=block[cursor++];if(!keyLength||keyLength>64||cursor+keyLength>block.length)throw Error('Invalid HPACK name');
    const key=block.subarray(cursor,cursor+keyLength).toString('latin1');cursor+=keyLength;
    const valueLength=block[cursor++];if(valueLength===undefined||valueLength>127||cursor+valueLength>block.length)throw Error('Invalid HPACK value');
    const value=block.subarray(cursor,cursor+valueLength).toString('latin1');cursor+=valueLength;
    if(Object.hasOwn(headers,key))throw Error('Duplicate header');headers[key]=value;
  }
  if(headers[':method']!=='GET'||headers[':scheme']!=='http'||headers[':path']!=='/public'||headers[':authority']!=='public.lab'||typeof headers['x-note']!=='string')throw Error('Invalid H2 request');
  return headers;
}
async function downstream(raw,canary){
  const server=net.createServer(socket=>{
    let data=Buffer.alloc(0);
    socket.on('data',part=>{
      data=Buffer.concat([data,part]);const end=data.indexOf('\r\n\r\n');
      if(end<0||end>2048)return;
      const lines=data.subarray(0,end).toString('latin1').split('\r\n');
      const admin=lines.some(line=>/^x-admin:\s*yes$/i.test(line));
      const body=admin?canary:'Public downstream response';
      socket.end(`HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
    });
  });
  const port=await listen(server);
  try{return await new Promise((resolve,reject)=>{
    const client=net.connect(port,'127.0.0.1'),parts=[];
    const timer=setTimeout(()=>{client.destroy();reject(Error('H1 deadline'));},800);
    client.on('connect',()=>client.end(raw));client.on('data',part=>parts.push(part));
    client.on('end',()=>{clearTimeout(timer);const response=Buffer.concat(parts).toString('latin1');resolve({response,adminReached:response.includes(canary)});});
    client.on('error',error=>{clearTimeout(timer);reject(error);});
  });}finally{await new Promise(resolve=>server.close(resolve));}
}
async function exchange(value,unsafe,canary){
  const block=headerBlock(value),wire=Buffer.concat([preface,frame(4,0,0,Buffer.alloc(0)),frame(1,5,1,block)]);
  const sockets=new Set();let complete,fail;
  const result=new Promise((resolve,reject)=>{complete=resolve;fail=reject;});
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let data=Buffer.alloc(0);
    socket.on('data',async part=>{
      data=Buffer.concat([data,part]);
      if(data.length<42)return;
      try{
        if(!data.subarray(0,24).equals(preface)||data.readUIntBE(24,3)!==0||data[27]!==4||data.readUInt32BE(29)!==0)throw Error('Invalid H2 preface/settings');
        const start=33,length=data.readUIntBE(start,3);
        if(data.length<start+9+length)return;
        if(data[start+3]!==1||data[start+4]!==5||data.readUInt32BE(start+5)!==1||length>512)throw Error('Invalid H2 HEADERS');
        const headers=decodeHeaders(data.subarray(start+9,start+9+length));
        if(!unsafe&&/[\x00-\x1f\x7f]/.test(headers['x-note'])){complete({status:400,converted:false,adminReached:false,h2Bytes:wire.length});socket.end();return;}
        const h1=`GET /public HTTP/1.1\r\nHost: public.lab\r\nX-Note: ${headers['x-note']}\r\n\r\n`;
        const downstreamResult=await downstream(Buffer.from(h1,'latin1'),canary);
        complete({status:200,converted:true,h1Headers:h1.slice(0,-4),h2Bytes:wire.length,...downstreamResult});socket.end();
      }catch(error){fail(error);socket.destroy();}
    });
  });
  const port=await listen(server),client=net.connect(port,'127.0.0.1');
  const timer=setTimeout(()=>fail(Error('H2 deadline')),1200);
  try{client.end(wire);return await result;}
  finally{clearTimeout(timer);client.destroy();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
}
export const definitions=[{root:'R0355',variant,title:'H2ヘッダCRLF変換',feature:'b6-h2-header',family:'H2ヘッダからH1への制御文字変換',entry:'/h2-header',allowedPaths:['h2-header'],requests:[['GET','/h2-header',{}],['POST','/h2-header',{note:'Guide'}]],sessionProtectedPath:'/h2-header',negativeDescription:'通常のH2ヘッダは下流へ渡り、制御文字を含む値から新しいH1ヘッダを作らない。',implementationNote:'raw TCPで実H2 preface・SETTINGS・HEADERS frameを受け、HPACK literal subsetを解釈する小さなgateway fixture。VはCRLFを含むx-noteをH1へ直結し、F/Nは変換前に制御文字を拒否。下流は実H1 TCP接続。Node標準HTTP/2 parserの欠陥を主張しない。'}];
export const variantDefinitions=[];
export async function reset(){records=[];}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>getRun().variant===variant?next():next('route');
  router.get('/h2-header',selected,(req,res)=>{if(!requireLogin(req,res))return;res.type('html').send(page('H2ヘッダ変換','<p>注記ヘッダを下流へ転送します。</p>'));});
  router.post('/h2-header',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    const note=req.body?.note;
    if(typeof note!=='string'||Buffer.byteLength(note)>100)return res.sendStatus(400);
    try{const result=await exchange(note,vulnerable(),getRun().canary);records.push({status:result.status,h2Bytes:result.h2Bytes,converted:result.converted,adminReached:result.adminReached});res.status(result.status).json(result);}
    catch{res.sendStatus(400);}
  });
}
export async function audit({getRun}){return getRun().variant===variant?{batch6H2Header:{records:[...records]}}:{};}
