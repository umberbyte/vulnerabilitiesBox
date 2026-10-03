import {PNG} from 'pngjs';
import {SaxesParser} from 'saxes';

const variants=new Set(['B0144','B0160']);
const png=new PNG({width:1,height:1});
png.data.set([40,120,200,255]);
const normalPng=PNG.sync.write(png);
const normalSvg='<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="blue"/></svg>';
let saved=null,scriptReceipts=0;
const active=getRun=>variants.has(getRun().variant);

function checkedSvg(source){
  let depth=0,root=false,shapes=0;
  const parser=new SaxesParser({xmlns:true});
  parser.on('opentag',tag=>{
    depth++;
    if(depth===1){if(tag.uri!=='http://www.w3.org/2000/svg'||tag.local!=='svg')throw Error('Not SVG');root=true;}
    if(tag.local==='rect'&&tag.uri==='http://www.w3.org/2000/svg')shapes++;
  });
  parser.on('closetag',()=>depth--);
  parser.write(source).close();
  if(!root||depth!==0||shapes<1)throw Error('No image shape');
}
function canonicalSvg(source){
  let rects=[];
  const parser=new SaxesParser({xmlns:true});
  parser.on('opentag',tag=>{
    if(tag.uri!=='http://www.w3.org/2000/svg'||!['svg','rect'].includes(tag.local))throw Error('Unsupported SVG element');
    if(tag.local==='rect'){
      const width=Number(tag.attributes.width?.value),height=Number(tag.attributes.height?.value);
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16||height>16)throw Error('Invalid shape');
      rects.push(`<rect width="${width}" height="${height}" fill="blue"/>`);
    }
  });
  parser.write(source).close();
  if(rects.length<1||rects.length>4)throw Error('Invalid shape count');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">${rects.join('')}</svg>`;
}
export const definitions=[];
export const variantDefinitions=[
  {root:'R0142',variant:'B0144',additionalVariant:true,title:'HTML polyglot',feature:'b6-image-polyglot',family:'画像構造とHTML配信境界',entry:'/image-library',allowedPaths:['image-library','image-preview','image-script-marker'],requests:[['GET','/image-library',{}],['POST','/image-library',{filename:'shape.svg',content:Buffer.from(normalSvg).toString('base64')}],['GET','/image-preview',{}]],sessionProtectedPath:'/image-library',negativeDescription:'正常SVGは表示でき、HTMLとして画像内のscriptを実行しない。',implementationNote:'実SVG XML parserで形状を確認する。Vは元バイト列をfilename由来のHTML型で配信。F/Nは許可した形状だけからSVGを再生成し固定MIME/nosniffで配信。Chromiumで実行差を検証。'},
  {root:'R0142',variant:'B0160',additionalVariant:true,title:'署名型スニッフィング',feature:'b6-image-signature',family:'画像magicと完全解析境界',entry:'/image-library',allowedPaths:['image-library','image-preview','image-script-marker'],requests:[['GET','/image-library',{}],['POST','/image-library',{filename:'pixel.png',content:normalPng.toString('base64')}],['GET','/image-preview',{}]],sessionProtectedPath:'/image-library',negativeDescription:'正常PNGは表示でき、magicだけを持つHTMLを有効画像として配信しない。',implementationNote:'VはPNG先頭署名のみで受理し、filename由来のHTML型を配信。F/NはpngjsでPNGを完全decode/再encodeし固定MIME/nosniffで配信。Chromiumでscript実行差を検証。'}
];
export async function reset(){saved=null;scriptReceipts=0;}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>active(getRun)?next():next('route');
  router.get('/image-library',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    res.type('html').send(page('画像ライブラリ','<p>画像を登録し、プレビューで確認できます。</p>'));
  });
  router.post('/image-library',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    const {filename,content}=req.body||{};
    if(typeof filename!=='string'||!/^[-a-z0-9.]{1,40}$/.test(filename)||typeof content!=='string'||content.length>16000||!/^[A-Za-z0-9+/]*={0,2}$/.test(content))return res.sendStatus(400);
    const bytes=Buffer.from(content,'base64');if(bytes.length>8000||bytes.length===0)return res.sendStatus(400);
    const isSvg=getRun().variant==='B0144';
    try{
      if(isSvg){
        const source=bytes.toString('utf8');checkedSvg(source);
        saved={bytes:Buffer.from(vulnerable()?source:canonicalSvg(source)),type:vulnerable()&&filename.endsWith('.html')?'text/html':'image/svg+xml'};
      }else{
        if(!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error('Not PNG');
        if(!vulnerable()&&(bytes.length<33||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)>16||bytes.readUInt32BE(20)>16))throw Error('Invalid PNG dimensions');
        const encoded=vulnerable()?bytes:PNG.sync.write(PNG.sync.read(bytes,{checkCRC:true}));
        saved={bytes:encoded,type:vulnerable()&&filename.endsWith('.html')?'text/html':'image/png'};
      }
    }catch{return res.sendStatus(400);}
    res.status(201).json({stored:true,preview:getRun().base+'/image-preview'});
  });
  router.get('/image-preview',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    if(!saved)return res.sendStatus(404);
    if(!vulnerable())res.set('X-Content-Type-Options','nosniff');
    res.type(saved.type).send(saved.bytes);
  });
  router.post('/image-script-marker',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    if(scriptReceipts>=4)return res.sendStatus(429);
    scriptReceipts++;res.sendStatus(204);
  });
}
export async function audit({getRun}){return active(getRun)?{batch6Uploads:{scriptReceipts,storedType:saved?.type||null}}:{};}
