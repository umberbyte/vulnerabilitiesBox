import Busboy from 'busboy';

const variant='B0369';
let privatePublished=false,lastFields=[];
export const definitions=[];
export const variantDefinitions=[{
  root:'R0150',variant,additionalVariant:true,title:'multipart境界差',feature:'b6-multipart',family:'前後段のmultipart解釈差',
  entry:'/multipart-document',allowedPaths:['multipart-document'],requests:[['GET','/multipart-document',{}]],
  sessionProtectedPath:'/multipart-document',negativeDescription:'通常のmultipart文書保存は成功し、field内容中の擬似終端で検査対象を切り落とさない。',
  implementationNote:'前段の素朴なboundary終端探索と、後段の実Busboy multipart parserを比較する。Vだけ前段がfield本文中の終端風文字列で早期停止し、F/Nは後段で解釈した全fieldを検査する。'
}];
export async function reset(){privatePublished=false;lastFields=[];}
async function boundedBody(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>8192)throw Error('Body budget');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function parseFields(bytes,contentType){
  const parser=Busboy({headers:{'content-type':contentType},limits:{fields:4,fieldSize:2048,parts:4}});
  const fields=[];let limited=false;
  parser.on('field',(name,value)=>fields.push({name,value}));
  parser.on('fieldsLimit',()=>{limited=true;});parser.on('partsLimit',()=>{limited=true;});
  await new Promise((resolve,reject)=>{parser.on('error',reject);parser.on('close',resolve);parser.end(bytes);});
  if(limited)return null;
  return fields;
}
export function register(router,{getRun,vulnerable,requireLogin,page,db}){
  const selected=(req,res,next)=>getRun().variant===variant?next():next('route');
  router.get('/multipart-document',selected,(req,res)=>{
    if(!requireLogin(req,res))return;
    res.type('html').send(page('文書更新','<form method="post" enctype="multipart/form-data"><input name="description"><input name="action" value="save"><button>保存</button></form>'));
  });
  router.post('/multipart-document',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    const contentType=String(req.headers['content-type']||'');
    const match=/^multipart\/form-data;\s*boundary=([A-Za-z0-9-]{1,40})$/.exec(contentType);
    if(!match)return res.sendStatus(415);
    let bytes,fields;
    try{bytes=await boundedBody(req);fields=await parseFields(bytes,contentType);}catch{return res.sendStatus(400);}
    if(!fields||fields.some(field=>!['description','action'].includes(field.name)))return res.sendStatus(400);
    lastFields=fields.map(field=>field.name);
    const actual=fields.findLast(field=>field.name==='action')?.value||'save';
    if(!['save','publish_private'].includes(actual))return res.sendStatus(400);
    let checked=fields;
    if(vulnerable()){
      const raw=bytes.toString('utf8'),close=raw.indexOf('--'+match[1]+'--');
      if(close<0)return res.sendStatus(400);
      const visible=raw.slice(0,close);
      checked=fields.filter(field=>visible.includes(`name="${field.name}"`));
    }
    if(checked.some(field=>field.name==='action'&&field.value!=='save'))return res.sendStatus(403);
    if(actual==='publish_private'){
      privatePublished=true;
      await db.query('INSERT INTO operations(username,action) VALUES($1,$2)',[req.member.name,'multipart-private-publish']);
    }
    res.json({saved:true,published:actual==='publish_private'});
  });
}
export async function audit({getRun}){return getRun().variant===variant?{batch6Multipart:{privatePublished,lastFields:[...lastFields]}}:{};}
