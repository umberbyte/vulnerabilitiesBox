import {mkdtemp,mkdir,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {createServer,request as httpRequest} from 'node:http';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {SaxesParser} from 'saxes';

// The only dynamic modules are generated inside a temporary fixture directory.
const cases={
 '0061':['サーバテンプレート再評価','投稿をtemplate sourceとして再評価'],
 '0063':['テンプレートヘルパ','内部helperの公開'],
 '0064':['テンプレート環境','利用者によるengine設定の変更'],
 '0065':['JSサーバeval','JSON入力をJavaScriptとして評価'],
 '0066':['式評価の属性参照','数値式からcontext属性を参照'],
 '0067':['動的モジュール読込','文字列からmoduleを選択'],
 '0068':['関数名ディスパッチ','公開actionと内部関数の混同'],
 '0071':['shellへのコード再解釈','filenameをshell scriptへ連結'],
 '0076':['CLIオプション制御','filenameをCLI optionとして解釈'],
 '0084':['子プロセス実行ファイル探索','利用者配置の同名CLIをPATHから選択'],
 '0086':['ローダー環境','子processの環境を継承'],
 '0089':['ジョブ定義コマンド','job定義から内部commandを起動'],
 '0105':['XPath非信頼値の式化','文字列値をXPath predicateへ連結'],
 '0107':['XPathノード名','利用者のnode名をquery構文へ連結'],
 '0108':['XPath述語','利用者のpredicateを式として評価'],
 '0111':['DTD外部実体解決','外部一般entityをsandbox内で解決'],
 '0113':['XML処理の外部参照解決','XInclude hrefをsandbox内で解決'],
 '0117':['server fetchの宛先制限欠落','任意callbackへfetch'],
 '0118':['XML署名wrapping','署名済node以外の値を利用'],
 '0162':['URL解析と接続先の不一致','検査と接続で別URL parserを使用'],
 '0163':['サフィックス誤判定','hostの文字列包含だけを照合'],
 '0164':['内部IP分類と正規化','別表記のloopbackを許可'],
 '0167':['全取得先の再検査','redirect先を再検査しない'],
 '0168':['DNS再解決差','検査済IPと接続IPが異なる'],
 '0169':['非HTTPスキーム','非HTTPの内部命令を実行'],
 '0170':['ポート制限漏れ','hostだけを許可'],
 '0171':['プロキシ経由迂回','利用者指定proxyから内部宛先へ到達'],
 '0172':['HTTP CONNECT','公開APIでCONNECT tunnelを許可'],
 '0178':['任意認証ヘッダ転送','宛先をまたいで資格情報を転送']
 ,'0179':['HTTP Unix socket指定','公開入力を内部IPC socketPathへ渡す']
};
// Only roots with a real engine path and a finished V/F/N contrast are exported.
const ids=['0061','0063','0064','0065','0066','0067','0068','0071','0076','0084','0086','0089','0105','0107','0108','0111','0113','0117','0118','0162','0163','0164','0167','0168','0169','0170','0171','0172','0178','0179'];
const roots=new Set(ids.map(id=>'R'+id));
const htmlEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalInputs={'0061':{template:'Guide: {{2+2}}'},'0063':{helperName:'upper'},'0064':{template:'{{name}}',environmentOptions:{}},'0065':{evalText:'7'},'0066':{astExpression:'2+3'},'0067':{modulePath:'ordinary'},'0068':{action:'preview'},'0071':{outputName:'Guide'},'0076':{filename:'guide.txt'},'0084':{cwd:'trusted'},'0086':{processEnv:{}},'0089':{command:'summary'},'0105':{xpathValue:'alice'},'0107':{nodeName:'member'},'0108':{predicate:"@name='alice'"},'0111':{xml:'<root>Guide</root>'},'0113':{xinclude:'<root>Guide</root>'},'0117':{callback:'http://public.fixture.test/'},'0118':{signedXml:'issued normal XML'},'0162':{url:'http://public.fixture.test/'},'0163':{url:'http://public.fixture.test/'},'0164':{url:'http://public.fixture.test/'},'0167':{redirect:'http://public.fixture.test/'},'0168':{dnsName:'steady.fixture.test'},'0169':{protocol:'http:'},'0170':{port:'public service port'},'0171':{proxyUrl:'http://fixed-proxy.fixture.test/'},'0172':{method:'GET'},'0178':{credentialUrl:'http://public.fixture.test/'},'0179':{socketPath:null}};
export const definitions=ids.map(id=>({root:'R'+id,variant:'B'+id,title:cases[id][0],feature:'batch3-engines-'+id,family:cases[id][0],entry:'/r3e-'+id,allowedPaths:['r3e-'+id],requests:[['GET','/r3e-'+id,{}],['POST','/r3e-'+id,{operation:'normal',...normalInputs[id]}]],sessionProtectedPath:'/r3e-'+id,implementationNote:cases[id][1]+'。固定local fixture、有限入力、V/F/N比較。',negativeDescription:'本人の通常操作は成功し、同形の境界入力は秘密markerの読取・内部効果を生じない。'}));
let folder,records=[],servers=[],ports={};
const maxText=(value,n=512)=>typeof value==='string'&&Buffer.byteLength(value)<=n;
const marker=()=>currentRun.canary;
let currentRun;
export async function shutdown() {for(const server of servers)await new Promise(resolve=>server.close(resolve));servers=[];if(folder)await rm(folder,{recursive:true,force:true});folder=null;}
const same=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const observation=(id,operation,result,extra={})=>{records.push({id,operation,result,...extra});return result;};
export async function reset({getRun}) {currentRun=getRun();records=[];await shutdown();ports={};if(!roots.has(currentRun.root))return;folder=await mkdtemp(path.join(tmpdir(),'benchmark-engines-'));
 await writeFile(path.join(folder,'ordinary.mjs'),'export default () => "Guide";');
 await writeFile(path.join(folder,'internal.mjs'),'export default () => '+JSON.stringify(marker())+';');
 await writeFile(path.join(folder,'worker.cjs'),`const a=process.argv.slice(2);if(a[0]==='echo')process.stdout.write('Stored '+a.slice(1).join(' '));else if(a[0]==='cli'){const i=a.indexOf('--');const options=i<0?a.slice(1):a.slice(1,i);if(options.includes('--dump-marker'))process.stdout.write(${JSON.stringify(marker())});else process.stdout.write('Stored '+a.at(-1));}else if(a[0]==='job'){process.stdout.write(a[1]==='readMarker'?${JSON.stringify(marker())}:'Normal job');}else process.stdout.write('Normal job');`);
 await writeFile(path.join(folder,'marker.cjs'),'process.stdout.write('+JSON.stringify(marker())+');');
 await writeFile(path.join(folder,'secret.txt'),marker());
 if(currentRun.root==='R0084'){
  for(const [name,answer] of [['trusted','Normal tool'],['uploaded',marker()]]){
   const destination=path.join(folder,name);await mkdir(destination);
   const executable=path.join(destination,process.platform==='win32'?'fixture-tool.cmd':'fixture-tool');
   await writeFile(executable,process.platform==='win32'?'@echo off\r\necho '+answer+'\r\n':'#!/bin/sh\nprintf '+JSON.stringify(answer)+'\n');
   if(process.platform!=='win32')await chmod(executable,0o755);
  }
 }
 if(['0117','0162','0163','0164','0167','0168','0169','0170','0171','0172','0178','0179'].includes(currentRun.root.slice(1))){
  for(const [name,answer] of [['public','Public guide'],['private',marker()]]){
   const server=createServer((req,res)=>{records.push({target:name,authorization:req.headers.authorization||null,path:req.url});if(name==='public'&&req.url==='/redirect'){res.writeHead(302,{location:'http://internal.fixture.test/'});res.end();return;}res.writeHead(200,{'content-type':'text/plain'});res.end(name==='private'&&currentRun.root==='R0178'&&!req.headers.authorization?'Reached without credentials':answer);});
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});servers.push(server);ports[name]=server.address().port;
  }
  if(currentRun.root==='R0169'){
   const server=net.createServer(socket=>{socket.setTimeout(250);socket.once('data',data=>{records.push({target:'non-http',command:data.toString()});socket.end(data.toString()==='READ\n'?marker():'DENIED');});});
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});servers.push(server);ports.command=server.address().port;
  }
  if(currentRun.root==='R0171'||currentRun.root==='R0172'){
   const server=createServer(async(req,res)=>{const target=req.headers['x-fixture-target']==='private'?'private':'public';records.push({target:'proxy',destination:target});const response=await fetchLocal(target);res.statusCode=response.status;res.end(response.body);});
   server.on('connect',(req,socket)=>{records.push({target:'connect-proxy',destination:'private'});const upstream=net.connect(ports.private,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');socket.pipe(upstream);upstream.pipe(socket);});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());});
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});servers.push(server);ports.proxy=server.address().port;
  }
  if(currentRun.root==='R0179'){
   const socketPath=process.platform==='win32'?'\\\\.\\pipe\\benchmark-engines-'+process.pid+'-'+Date.now():path.join(folder,'internal.sock');
   const server=createServer((req,res)=>{records.push({target:'ipc'});res.end(marker());});
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});servers.push(server);ports.socketPath=socketPath;
  }
 }
}
export async function audit({getRun}) {return roots.has(getRun().root)?{enginesBatch:{records:[...records],ports:{...ports}}}:{};}

function finiteExpression(source,context={}) {if(!maxText(source,80)||!/^[0-9+* ()a-zA-Z_.]+$/.test(source))throw Error('Invalid expression');return vm.runInNewContext(source,context,{timeout:30});}
function template(source,context,helpers={}) {return String(source).replace(/\{\{\s*([^{}]{1,80})\s*\}\}/g,(_,expr)=>{
  const helper=/^(\w+)\s+([\w.]+)$/.exec(expr);if(helper&&helpers[helper[1]])return String(helpers[helper[1]](context[helper[2]]));
  return String(finiteExpression(expr,context));
});}
async function engineCase(id,operation,body,v) {
 const secret=marker(),normal=operation==='normal';
 if(id==='0061') {const source=maxText(body.template,128)?body.template:normal?'Guide: {{2+2}}':'Message: {{secret}}';const rendered=v?template(source,{secret}):normal?template('Guide: {{2+2}}',{}):htmlEscape(source);return {rendered,exposed:!normal&&rendered.includes(secret)};}
 if(id==='0063') {let called=false;const name=maxText(body.helperName,32)?body.helperName:normal?'upper':'internal';const helpers={upper:s=>String(s).toUpperCase(),...(v?{internal:()=>{called=true;return secret;}}:{})};const source='{{'+name+' name}}';const rendered=helpers[name]?template(source,{name:'Guide'},helpers):htmlEscape(source);return {rendered,called};}
 if(id==='0064') {const options=body.environmentOptions&&typeof body.environmentOptions==='object'?body.environmentOptions:{};const source=maxText(body.template,80)?body.template:normal?'{{name}}':'{{secret}}';const context={name:'Guide',...(v&&options.exposeEnvironment?{secret}:{})};const rendered=normal?template(source,context):v&&options.exposeEnvironment?template(source,context):htmlEscape(source);return {rendered,exposed:!normal&&rendered.includes(secret)};}
 if(id==='0065') {const source=maxText(body.evalText,80)?body.evalText:normal?'7':'mark()';let executed=false;const result=v?vm.runInNewContext(source,{mark:()=>{executed=true;return secret;}},{timeout:30}):/^\s*[0-9]+\s*$/.test(source)?JSON.parse(source):null;return {result,executed};}
 if(id==='0066') {const expression=maxText(body.astExpression,80)?body.astExpression:normal?'2+3':'settings.secret';const result=normal?finiteExpression(expression):v?finiteExpression(expression,{settings:{secret}}):null;return {result,exposed:result===secret};}
 if(id==='0067') {const moduleName=maxText(body.modulePath,32)?body.modulePath:normal?'ordinary':'internal';if(!['ordinary','internal'].includes(moduleName))throw Error('Unknown bounded module');if(!v&&moduleName!=='ordinary')return {result:null,loadedInternal:false};const imported=await import(pathToFileURL(path.join(folder,moduleName+'.mjs')).href);const result=imported.default();return {result,loadedInternal:moduleName==='internal'};}
 if(id==='0068') {const action=maxText(body.action,32)?body.action:normal?'preview':'internalMarker';const actions={preview:()=> 'Guide',internalMarker:()=>secret};const result=(v?actions:{preview:actions.preview})[action]?.()??null;return {result,calledInternal:result===secret};}
 throw Error('Unknown engine case');
}

async function childWithEnv(environment) {return new Promise(resolve=>{
 const cp=spawn(process.execPath,[path.join(folder,'worker.cjs')],{cwd:folder,env:{PATH:process.env.PATH||'',...environment},stdio:['ignore','pipe','pipe']});
 let output='',error='';const timer=setTimeout(()=>cp.kill('SIGKILL'),350);
 cp.stdout.on('data',chunk=>{output+=chunk;if(output.length>1024)cp.kill('SIGKILL');});
 cp.stderr.on('data',chunk=>{error+=chunk;if(error.length>1024)cp.kill('SIGKILL');});
 cp.once('close',code=>{clearTimeout(timer);resolve({code,output,error});});
 cp.once('error',event=>{clearTimeout(timer);resolve({code:-1,output,error:event.message});});
});}
async function runChild(args,options={}){return new Promise(resolve=>{
 const cp=spawn(options.shell?args[0]:process.execPath,options.shell?[]:[path.join(folder,'worker.cjs'),...args],{cwd:folder,env:{PATH:process.env.PATH||''},shell:!!options.shell,stdio:['ignore','pipe','pipe']});
 let output='',error='';const timer=setTimeout(()=>cp.kill('SIGKILL'),350);
 cp.stdout.on('data',chunk=>{output+=chunk;if(output.length>1024)cp.kill('SIGKILL');});
 cp.stderr.on('data',chunk=>{error+=chunk;if(error.length>1024)cp.kill('SIGKILL');});
 cp.once('close',code=>{clearTimeout(timer);resolve({code,output,error});});
 cp.once('error',event=>{clearTimeout(timer);resolve({code:-1,output,error:event.message});});
});}
async function commandCase(id,operation,body,v){
 if(id==='0071'){
  const input=body.outputName??(operation==='normal'?'Guide':'Guide & node marker.cjs');
  if(!['Guide','Guide & node marker.cjs'].includes(input))throw Error('Outside bounded shell fixture');
  const script='"'+process.execPath+'" "'+path.join(folder,'worker.cjs')+'" echo '+input;
  const child=v?await runChild([script],{shell:true}):await runChild(['echo',input]);
  return {...child,shellInterpreted:child.output.includes(marker())};
 }
 if(id==='0076'){
  const filename=body.filename??(operation==='normal'?'guide.txt':'--dump-marker');
  if(!['guide.txt','--dump-marker'].includes(filename))throw Error('Outside bounded filename fixture');
  const child=await runChild(v?['cli',filename]:['cli','--',filename]);
  return {...child,optionUsed:child.output.includes(marker())};
 }
 if(id==='0089'){
  const command=body.command??(operation==='normal'?'summary':'readMarker');
  if(!['summary','readMarker'].includes(command))throw Error('Outside bounded job fixture');
  if(!v&&command!=='summary')return {code:null,output:null,denied:true};
  const child=await runChild(['job',command]);return {...child,executedInternal:child.output.includes(marker())};
 }
 throw Error('Unknown command case');
}
async function pathSearchCase(operation,body,v){
 const selected=body.cwd??(operation==='normal'?'trusted':'uploaded');
 if(!['trusted','uploaded'].includes(selected))throw Error('Unknown fixture directory');
 const executable=path.join(folder,'trusted',process.platform==='win32'?'fixture-tool.cmd':'fixture-tool');
 const command=v?'fixture-tool':'"'+executable+'"';
 const searchPath=path.join(folder,v?selected:'trusted')+path.delimiter+(process.env.PATH||'');
 const child=await new Promise(resolve=>{const windows=process.platform==='win32';const cp=windows
  ?spawn(command,[],{cwd:folder,shell:true,env:{...process.env,PATH:searchPath},stdio:['ignore','pipe','pipe']})
  :spawn('/bin/sh',['-c',v?'exec /bin/sh "$(command -v fixture-tool)"':'exec /bin/sh "$1"','fixture-shell',executable],{cwd:folder,env:{...process.env,PATH:searchPath},stdio:['ignore','pipe','pipe']});
  let output='',error='';const timer=setTimeout(()=>cp.kill('SIGKILL'),350);cp.stdout.on('data',part=>output+=part);cp.stderr.on('data',part=>error+=part);cp.once('close',code=>{clearTimeout(timer);resolve({code,output,error});});cp.once('error',event=>{clearTimeout(timer);resolve({code:-1,output,error:event.message});});});
 return {...child,selectedExecutable:v?selected:'trusted',loadedUploaded:child.output.includes(marker())};
}
async function environmentCase(operation,body,v){
 const requested=body.processEnv?.NODE_OPTIONS;
 if(requested!==undefined&&requested!=='--require ./preload.cjs')throw Error('Out of fixture bounds');
 await writeFile(path.join(folder,'preload.cjs'),'process.stdout.write('+JSON.stringify(marker())+');');
 const child=await childWithEnv(v&&requested?{NODE_OPTIONS:requested}:{});
 return {code:child.code,output:child.output,preloadRan:child.output.includes(marker())};
}
const signature=value=>createHmac('sha256','batch3-engine-signature-fixture').update(value).digest('hex');
const signedXml=wrapped=>{const valid='<decision id="approved">Guide</decision>',signatureValue=signature('Guide');return wrapped?'<root><decision id="unsigned">'+marker()+'</decision>'+valid+'<signature target="approved">'+signatureValue+'</signature></root>':'<root>'+valid+'<signature target="approved">'+signatureValue+'</signature></root>';};
function parseSignedXml(xml){if(!maxText(xml,2048))throw Error('XML size');const decisions=[],signatures=[];let item=null;const parser=new SaxesParser({xmlns:false});parser.on('opentag',tag=>{if(tag.name==='decision'||tag.name==='signature')item={kind:tag.name,id:tag.attributes.id,target:tag.attributes.target,text:''};});parser.on('text',text=>{if(item)item.text+=text;});parser.on('closetag',tag=>{if(item?.kind===tag.name){(item.kind==='decision'?decisions:signatures).push(item);item=null;}});parser.write(xml).close();return {decisions,signatures};}
function signatureCase(operation,body,v){const xml=maxText(body.signedXml,2048)&&body.signedXml!=='issued normal XML'?body.signedXml:signedXml(operation==='boundary');const {decisions,signatures}=parseSignedXml(xml);const proof=signatures.find(item=>item.target==='approved');const approved=decisions.find(item=>item.id==='approved');const valid=!!(proof&&approved&&same(proof.text,signature(approved.text)));if(!valid)return {valid:false,used:null};const used=v?decisions[0]?.text:approved.text;return {valid,used,wrapped:decisions.length>1};}
const memberXml=()=>'<members><member name="alice" visible="true">Guide</member><member name="bob" secret="true">'+marker()+'</member></members>';
function membersFromXml(){const members=[];let current=null;const parser=new SaxesParser({xmlns:false});parser.on('opentag',tag=>{if(tag.name==='member')current={attributes:tag.attributes,text:''};});parser.on('text',text=>{if(current)current.text+=text;});parser.on('closetag',tag=>{if(tag.name==='member'&&current){members.push(current);current=null;}});parser.write(memberXml()).close();return members;}
function selectXPath(expression){const match=/^\/members\/member(?:\[(.+)\])?$/.exec(expression);if(!match)throw Error('Outside limited XPath fixture');const terms=match[1]?match[1].split(' or '):[];if(terms.length>2)throw Error('Predicate limit');const predicates=terms.map(term=>{const m=/^@([a-z]+)=(['"])([^'"]{0,80})\2$/.exec(term);if(!m)throw Error('Predicate grammar');return [m[1],m[3]];});return membersFromXml().filter(member=>!predicates.length||predicates.some(([key,value])=>member.attributes[key]===value));}
function xpathCase(id,operation,body,v){
 if(id==='0105'){
  const value=body.xpathValue??(operation==='normal'?'alice':"missing' or @name='bob");if(!maxText(value,80))throw Error('Value size');
  const query="/members/member[@name='"+value+"']";
  const selected=v?selectXPath(query):membersFromXml().filter(member=>member.attributes.name===value);
  return {query,selected:selected[0]?.text??null};
 }
 if(id==='0107'){
  const name=body.nodeName??(operation==='normal'?'member':"member[@secret='true']");if(!maxText(name,80))throw Error('Node name size');
  if(!v&&name!=='member')return {selected:null,denied:true};
  const query='/members/'+name,selected=selectXPath(query);return {query,selected:selected[0]?.text??null};
 }
 if(id==='0108'){
  const predicate=body.predicate??(operation==='normal'?"@name='alice'":"@secret='true'");if(!maxText(predicate,80))throw Error('Predicate size');
  if(!v&&predicate!=="@name='alice'")return {selected:null,denied:true};
  const query='/members/member['+predicate+']',selected=selectXPath(query);return {query,selected:selected[0]?.text??null};
 }
 throw Error('Unknown XPath case');
}
function xmlText(xml){let value='';const parser=new SaxesParser({xmlns:false});parser.on('text',part=>{value+=part;if(value.length>2048)throw Error('Expanded XML limit');});parser.write(xml).close();return value;}
async function externalXmlCase(id,operation,body,v){
 const input=id==='0111'?body.xml:body.xinclude;
 const xml=maxText(input,2048)?input:operation==='normal'?'<root>Guide</root>':id==='0111'?'<!DOCTYPE root [<!ENTITY ext SYSTEM "fixture:secret">]><root>&ext;</root>':'<root><include href="fixture:secret"/></root>';
 if(id==='0111'){
  const external=xml.includes('SYSTEM "fixture:secret"');
  if(!external)return {text:xmlText(xml),resolved:false};
  if(!v)return {status:403,text:null,resolved:false};
  const resolved=xml.replace('<!DOCTYPE root [<!ENTITY ext SYSTEM "fixture:secret">]>','').replace('&ext;',await readFile(path.join(folder,'secret.txt'),'utf8'));
  return {text:xmlText(resolved),resolved:true};
 }
 const include=xml.includes('<include href="fixture:secret"/>');
 if(!include)return {text:xmlText(xml),resolved:false};
 if(!v)return {status:403,text:null,resolved:false};
 const resolved=xml.replace('<include href="fixture:secret"/>',await readFile(path.join(folder,'secret.txt'),'utf8'));
 return {text:xmlText(resolved),resolved:true};
}
async function fetchLocal(target,headers={},pathname='/'){return new Promise((resolve,reject)=>{const req=httpRequest({host:'127.0.0.1',port:ports[target],path:pathname,headers,timeout:250,agent:false},res=>{let body='';res.on('data',chunk=>{body+=chunk;if(body.length>1024)req.destroy(Error('response cap'));});res.on('end',()=>resolve({status:res.statusCode,body,location:res.headers.location}));});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('deadline')));req.end();});}
async function commandFetch(){return new Promise((resolve,reject)=>{const socket=net.connect(ports.command,'127.0.0.1',()=>socket.write('READ\n'));let body='';socket.setTimeout(250,()=>socket.destroy(Error('deadline')));socket.on('data',part=>{body+=part;if(body.length>1024)socket.destroy(Error('response cap'));});socket.on('end',()=>resolve({status:200,body}));socket.on('error',reject);});}
async function proxyFetch(target){return new Promise((resolve,reject)=>{const req=httpRequest({host:'127.0.0.1',port:ports.proxy,path:'http://public.fixture.test/',headers:{'x-fixture-target':target},timeout:250,agent:false},res=>{let body='';res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,body}));});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('deadline')));req.end();});}
async function connectFetch(){return new Promise((resolve,reject)=>{const req=httpRequest({host:'127.0.0.1',port:ports.proxy,path:'internal.fixture.test:80',method:'CONNECT',timeout:350,agent:false});req.on('connect',(res,socket)=>{let raw='';const timer=setTimeout(()=>socket.destroy(Error('deadline')),350);socket.on('data',part=>{raw+=part;if(raw.length>2048)socket.destroy(Error('response cap'));});socket.on('end',()=>{clearTimeout(timer);resolve({status:res.statusCode,body:raw.split('\r\n\r\n')[1]||''});});socket.on('error',reject);socket.end('GET / HTTP/1.1\r\nHost: internal.fixture.test\r\nConnection: close\r\n\r\n');});req.on('error',reject);req.end();});}
async function ipcFetch(){return new Promise((resolve,reject)=>{const req=httpRequest({socketPath:ports.socketPath,path:'/',timeout:250},res=>{let body='';res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,body}));});req.on('error',reject);req.end();});}
async function fetchCase(id,operation,body,v){
 if(id==='0169'){
  const protocol=body.protocol??(operation==='normal'?'http:':'fixture:');
  if(!['http:','fixture:'].includes(protocol))throw Error('Unknown fixture scheme');
  if(protocol==='fixture:'&&!v)return {status:403,body:null,reachedPrivate:false};
  const response=protocol==='fixture:'?await commandFetch():await fetchLocal('public');
  return {...response,reachedPrivate:protocol==='fixture:'};
 }
 if(id==='0171'){
  const proxy=body.proxyUrl??(operation==='normal'?'http://fixed-proxy.fixture.test/':'http://internal-proxy.fixture.test/');
  if(!['http://fixed-proxy.fixture.test/','http://internal-proxy.fixture.test/'].includes(proxy))throw Error('Unknown bounded proxy');
  const target=proxy.includes('internal-proxy')&&v?'private':'public';
  const response=await proxyFetch(target);return {...response,reachedPrivate:target==='private'};
 }
 if(id==='0172'){
  const method=body.method??(operation==='normal'?'GET':'CONNECT');
  if(!['GET','CONNECT'].includes(method))throw Error('Unknown method');
  if(method==='CONNECT'&&!v)return {status:403,body:null,reachedPrivate:false};
  const response=method==='CONNECT'?await connectFetch():await fetchLocal('public');
  return {...response,reachedPrivate:method==='CONNECT'};
 }
 if(id==='0179'){
  const selected=body.socketPath??(operation==='normal'?null:'internal-fixture');
  if(selected!==null&&selected!=='internal-fixture')throw Error('Unknown socket fixture');
  if(selected&&!v)return {status:403,body:null,reachedPrivate:false};
  const response=selected?await ipcFetch():await fetchLocal('public');
  return {...response,reachedPrivate:!!selected};
 }
 if(id==='0168'){
  const name=body.dnsName??(operation==='normal'?'steady.fixture.test':'flip.fixture.test');
  if(!['steady.fixture.test','flip.fixture.test'].includes(name))throw Error('Unknown run-local DNS name');
  const checked='public',connected=name==='flip.fixture.test'&&v?'private':'public';
  records.push({dnsName:name,checked,connected});const response=await fetchLocal(connected);
  return {...response,reachedPrivate:connected==='private'};
 }
 const defaultUrl=operation==='normal'?'http://public.fixture.test/':id==='0163'?'http://public.fixture.test.attacker.test/':'http://internal.fixture.test/';
 const input=body.callback??body.url??body.credentialUrl??body.redirect??defaultUrl;
 if(!maxText(input,256))throw Error('URL size');const url=new URL(input);
 if(url.protocol!=='http:'||(!['/','/redirect'].includes(url.pathname))||url.search||url.hash||id!=='0162'&&(url.username||url.password))throw Error('Fixture URL only');
 const host=url.hostname;let target='public';
 if(id==='0162'){
  if(!['public.fixture.test','internal.fixture.test'].includes(host))throw Error('Unknown fixture host');
  const rawHost=input.slice('http://'.length).split('/')[0];const checked=v?rawHost.split('@')[0]:host;
  if(checked!=='public.fixture.test')return {status:403,body:null,reachedPrivate:false};
  target=host==='public.fixture.test'?'public':'private';
  const response=await fetchLocal(target);return {...response,reachedPrivate:target==='private',checkedHost:checked,connectedHost:host};
 }
 if(id==='0164'){
  const mapped=['[::ffff:7f00:1]','[::ffff:127.0.0.1]'].includes(host);
  if(host!=='public.fixture.test'&&!mapped)throw Error('Unknown IP fixture');
  if(mapped&&!v)return {status:403,body:null,reachedPrivate:false};
  target=mapped?'private':'public';const response=await fetchLocal(target);return {...response,reachedPrivate:mapped};
 }
 if(id==='0167'){
  if(host!=='public.fixture.test')throw Error('Initial public URL required');
  const first=await fetchLocal('public',{},url.pathname);
  if(first.status!==302)return {...first,reachedPrivate:false};
  if(!v)return {status:403,body:null,reachedPrivate:false,redirect: first.location};
  const second=await fetchLocal('private');return {...second,reachedPrivate:true,redirect:first.location};
 }
 if(id==='0163'){
  if(!['public.fixture.test','public.fixture.test.attacker.test'].includes(host))throw Error('Unknown fixture host');
  const allowed=v?host.includes('public.fixture.test'):host==='public.fixture.test';
  if(!allowed)return {status:403,body:null,reachedPrivate:false};
  target=host==='public.fixture.test'?'public':'private';
 } else {
  if(!['public.fixture.test','internal.fixture.test'].includes(host))throw Error('Unknown fixture host');
  target=host==='public.fixture.test'?'public':'private';
  if(id==='0117'&&target==='private'&&!v)return {status:403,body:null,reachedPrivate:false};
 }
 if(id==='0170'){
  const selected=Number(url.port||ports.public);
  if(![ports.public,ports.private].includes(selected))throw Error('Unknown fixture port');
  if(!v&&selected!==ports.public)return {status:403,body:null,reachedPrivate:false};
  target=selected===ports.public?'public':'private';
 }
 const headers=id==='0178'&&(v||target==='public')?{authorization:'Bearer '+marker()}:{};
 const response=await fetchLocal(target,headers);
 return {...response,reachedPrivate:target==='private',forwardedSecret:target==='private'&&!!headers.authorization};
}

export function register(router,{getRun,vulnerable,requireLogin,page}) {
 const only=(id,handler)=>(req,res,next)=>getRun().root==='R'+id?handler(req,res,next):next();
 for(const id of ids) {
  router.get('/r3e-'+id,only(id,(req,res)=>{if(!requireLogin(req,res))return;res.type('html').send(page(cases[id][0],'<p>Member operation: '+htmlEscape(cases[id][0])+'</p>'));}));
  router.post('/r3e-'+id,only(id,async(req,res)=>{
   if(!requireLogin(req,res))return;
   const operation=req.body?.operation;if(!['normal','boundary'].includes(operation))return res.sendStatus(400);
   try {
    let result;
    if(Number(id)<=68)result=await engineCase(id,operation,req.body,vulnerable());
    else if(['0071','0076','0089'].includes(id))result=await commandCase(id,operation,req.body,vulnerable());
    else if(id==='0084')result=await pathSearchCase(operation,req.body,vulnerable());
    else if(id==='0086')result=await environmentCase(operation,req.body,vulnerable());
    else if(['0105','0107','0108'].includes(id))result=xpathCase(id,operation,req.body,vulnerable());
    else if(['0111','0113'].includes(id))result=await externalXmlCase(id,operation,req.body,vulnerable());
    else if(id==='0118')result=signatureCase(operation,req.body,vulnerable());
    else result=await fetchCase(id,operation,req.body,vulnerable());
    observation(id,operation,result);
    res.status(result.status===403?403:200).json(result);
   } catch(error) {observation(id,operation,{error:error.message});res.status(400).json({error:'Invalid bounded fixture input'});}
  }));
 }
}
