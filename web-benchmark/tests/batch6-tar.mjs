import assert from 'node:assert/strict';
import {variantDefinitions} from '../src/cases/batch6-archives.mjs';

const key=process.env.BENCHMARK_CONTROL_KEY;
if(!key)throw new Error('BENCHMARK_CONTROL_KEY is required');
const control=process.env.CONTROL_URL||'http://app:8099';
const target=process.env.TARGET_URL||'https://app:8443';
async function ctl(path,body){
  const response=await fetch(control+path,{method:body?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
}
function header(name,type,data=Buffer.alloc(0),link=''){
  const block=Buffer.alloc(512);
  block.write(name,0);block.write('0000644\0',100);block.write('0000000\0',108);block.write('0000000\0',116);
  block.write(data.length.toString(8).padStart(11,'0')+'\0',124);block.write('00000000000\0',136);
  block.fill(0x20,148,156);block.write(type,156);block.write(link,157);block.write('ustar\0',257);block.write('00',263);
  block.write(block.reduce((sum,byte)=>sum+byte,0).toString(8).padStart(6,'0')+'\0 ',148);
  return Buffer.concat([block,data,Buffer.alloc((512-data.length%512)%512)]);
}
const attack=Buffer.concat([
  header('public/link','2',Buffer.alloc(0),'../private'),
  header('public/link/proof.txt','0',Buffer.from('archive-proof')),
  Buffer.alloc(1024)
]).toString('base64');
const normal=variantDefinitions[0].requests.find(([method])=>method==='POST')[2].tar;
for(const mode of ['V','F','N']){
  const manifest=await ctl('/reset',{root:'R0132',variant:'B0133',mode,seed:'tar-link-acceptance-v1'});
  const cookieJar=[];
  const send=async(path,method='GET',body)=>{
    const response=await fetch(target+manifest.base+path,{method,headers:{'content-type':'application/json',...(cookieJar.length?{cookie:cookieJar.join('; ')}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const set=response.headers.get('set-cookie');if(set)cookieJar.push(set.split(';')[0]);return response;
  };
  assert.equal((await send('/login','POST',{username:'alice',password:'Fixture-alice-2026!'})).status,200);
  assert.equal((await (await send('/tar-files?name=guide.txt')).text()),'Public package guide');
  assert.equal((await send('/tar-packages','POST',{tar:normal})).status,200);
  const response=await send('/tar-packages','POST',{tar:attack});
  assert.equal(response.status,mode==='V'?200:400);
  const state=(await ctl('/oracle')).caseState.batch6Tar;
  assert.equal(state.protectedWrite,mode==='V');
  console.log(JSON.stringify({variant:'B0133',mode,result:'passed',protectedWrite:state.protectedWrite}));
}
