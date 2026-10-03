import assert from 'node:assert/strict';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
const normalZip='UEsDBBQAAAgAAAAAAAC65bpQFwAAABcAAAAJAAAAZ3VpZGUudHh0T3JkaW5hcnkgcGFja2FnZWQgZ3VpZGVQSwECFAAUAAAIAAAAAAAAuuW6UBcAAAAXAAAACQAAAAAAAAAAAAAAAAAAAAAAZ3VpZGUudHh0UEsFBgAAAAABAAEANwAAAD4AAAAAAA==';
const table=Array.from({length:256},(_,initial)=>{let value=initial;for(let n=0;n<8;n++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const update=(crc,byte)=>((crc>>>8)^table[(crc^byte)&255])>>>0;
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=update(crc,byte);return (crc^0xffffffff)>>>0;};
function zipCrypto(data,password,crc){
  let keys=[0x12345678,0x23456789,0x34567890];
  const feed=byte=>{keys[0]=update(keys[0],byte);keys[1]=(Math.imul((keys[1]+(keys[0]&255))>>>0,134775813)+1)>>>0;keys[2]=update(keys[2],keys[1]>>>24);};
  for(const byte of Buffer.from(password))feed(byte);
  const plain=Buffer.concat([Buffer.from([0,1,2,3,4,5,6,7,8,9,10,crc>>>24]),data]);
  const encrypted=Buffer.alloc(plain.length);
  for(let i=0;i<plain.length;i++){const n=(keys[2]|2)>>>0;encrypted[i]=plain[i]^((Math.imul(n,n^1)>>>8)&255);feed(plain[i]);}
  return encrypted;
}
function encryptedZip(content){
  const filename=Buffer.from('report.html'),data=Buffer.from(content),crc=crc32(data),packed=zipCrypto(data,'Fixture-password-2026!',crc);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x801,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x801,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
  const offset=local.length+filename.length+packed.length;
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([local,filename,packed,central,filename,end]);
}
const forbidden=encryptedZip('<script>document.body.dataset.private="yes"</script>');
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0159',variant:'B0159',mode,seed:'encrypted-zip-acceptance-v1'});
  const cookieJar=[];
  async function send(path,method='GET',body){
    const response=await fetch(target+manifest.base+path,{method,headers:{'content-type':'application/json',...(cookieJar.length?{cookie:cookieJar.join('; ')}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const set=response.headers.get('set-cookie');if(set)cookieJar.push(set.split(';')[0]);return response;
  }
  assert.equal((await send('/login','POST',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  assert.equal((await send('/zip-packages')).status,200);
  assert.equal((await send('/zip-packages','POST',{zip:normalZip})).status,201);
  assert.equal((await ctl('/oracle')).caseState.batch6EncryptedZip.scanStatus,'passed_after_inspection');
  const response=await send('/zip-packages','POST',{zip:forbidden.toString('base64')});
  assert.equal(response.status,mode==='V'?201:422);
  const state=(await ctl('/oracle')).caseState.batch6EncryptedZip;
  assert.equal(state.encrypted,mode==='V');
  assert.equal(state.scanStatus,mode==='V'?'passed_without_decryption':'passed_after_inspection');
  const download=await send('/zip-download');assert.equal(download.status,200);
  if(mode==='V')assert.ok(Buffer.from(await download.arrayBuffer()).equals(forbidden));
  console.log(JSON.stringify({variant:'B0159',mode,result:'passed',encryptedPublished:state.encrypted,scanStatus:state.scanStatus}));
}
