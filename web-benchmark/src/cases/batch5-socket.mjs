import {WebSocketServer} from 'ws';
import {groups} from './batch5-selection.mjs';

const ids=['B0342','B0343','B0344'],active=new Set(ids);
const rootOf=Object.fromEntries(Object.entries(groups.transport).flatMap(([root,variants])=>variants.map(variant=>[variant,root])));
const titles={B0342:'会員メッセージ',B0343:'会員ルーム',B0344:'管理メッセージ'};
export const definitions=[];
export const variantDefinitions=ids.map(variant=>({root:rootOf[variant],variant,additionalVariant:true,title:titles[variant],feature:'v5-socket-'+variant.slice(1),family:'WebSocketのメッセージ単位認可',entry:'/v5-socket',allowedPaths:['v5-socket'],requests:[['GET','/v5-socket',{}]],sessionProtectedPath:'/v5-socket',negativeDescription:'認証済み接続の本人操作は成功し、frameの主体・room・管理actionの変更では権限を越えない。',implementationNote:'既存HTTPサーバのWebSocket upgradeへ接続し、frame単位でDB主体を比較する。'}));
const sockets=new Set(),ws=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
export async function reset(){for(const client of sockets)client.terminate();sockets.clear();}
export function register(router,{getRun,requireLogin,page}){
 router.get('/v5-socket',(req,res,next)=>{
  if(!active.has(getRun().variant))return next('route');if(!requireLogin(req,res))return;
  res.type('html').send(page(titles[getRun().variant],'<p>会員向けのリアルタイムAPIです。</p>'));
 });
}
const deny=(socket,status)=>{socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);};
export async function tryUpgrade(req,socket,head,{db,redis,getRun,vulnerable}){
 const run=getRun();if(!active.has(run.variant))return false;
 if(req.url!==run.base+'/v5-socket'){deny(socket,'404 Not Found');return true;}
 if(sockets.size>=8){deny(socket,'429 Too Many Requests');return true;}
 const sid=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sid='))?.slice(4);
 const data=sid?await redis.get('sid:'+sid):null,state=data?JSON.parse(data):null;
 if(!state?.username){deny(socket,'401 Unauthorized');return true;}
 const owner=state.username,id=run.variant,base=run.base;
 ws.handleUpgrade(req,socket,head,client=>{
  sockets.add(client);client.on('close',()=>sockets.delete(client));client.on('error',()=>{});
  let count=0;
  client.on('message',async bytes=>{
   try{
    if(++count>8||getRun().base!==base||getRun().variant!==id)return client.close(1008);
    const frame=JSON.parse(bytes.toString());if(!frame||typeof frame!=='object')return client.close(1008);
    if(id==='B0344'){
     if(frame.action!=='rebuild')return client.close(1008);
     const member=(await db.query('SELECT role FROM users WHERE name=$1',[owner])).rows[0];
     if(!vulnerable()&&member?.role!=='admin')return client.send(JSON.stringify({error:'forbidden'}));
     await db.query('INSERT INTO operations(username,action) VALUES($1,$2)',[owner,'v5-ws-rebuild']);
     return client.send(JSON.stringify({completed:true}));
    }
    if(!['read','subscribe'].includes(frame.action))return client.close(1008);
    const requested=id==='B0342'?String(frame.user||owner):String(frame.room||owner+'-private').replace(/-private$/,'');
    if(!['alice','bob','carol'].includes(requested))return client.send(JSON.stringify({error:'unknown'}));
    if(!vulnerable()&&requested!==owner)return client.send(JSON.stringify({error:'forbidden'}));
    const item=(await db.query('SELECT body FROM documents WHERE owner=$1 AND shared=false ORDER BY id LIMIT 1',[requested])).rows[0];
    client.send(JSON.stringify({owner:requested,body:item?.body||null}));
   }catch{client.close(1008);}
  });
 });
 return true;
}
export async function audit({getRun}){return active.has(getRun().variant)?{batch5Socket:{variant:getRun().variant,openConnections:sockets.size}}:{};}
