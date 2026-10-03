import {MongoClient} from 'mongodb';

const normal={
  B0091:{filter:'alice'},
  B0092:{where:'this.username === "alice"'},
  B0093:{pipeline:[{$match:{tenant:'A'}},{$project:{_id:0,username:1,note:1}}]},
  B0095:{patch:{$set:{displayName:'Alice Updated'}}},
  B0096:{collection:'public'},
  B0097:{pattern:'Guide'},
  B0098:{condition:{kind:'team',allowed:true}}
};
const titles={B0091:'Mongo演算子オブジェクト',B0092:'Mongo whereコード',B0093:'Mongo pipeline段階',B0095:'Mongo更新演算子',B0096:'Mongo collection',B0097:'Mongo正規表現構文',B0098:'Mongo配列条件'};
const active=new Set(Object.keys(normal));
let client,database,records=[];
async function getDb(){
  if(!client){client=new MongoClient(process.env.MONGODB_URL,{serverSelectionTimeoutMS:1200,maxPoolSize:2});await client.connect();database=client.db('benchmark');}
  return database;
}
const all=Object.keys(normal).map(variant=>({root:'R'+variant.slice(1),variant,...(variant==='B0095'?{additionalVariant:true}:{}),title:titles[variant],feature:'b6-mongo-'+variant.slice(1),family:'MongoDB構造化クエリ境界',entry:'/mongo-workbook',allowedPaths:['mongo-workbook'],requests:[['GET','/mongo-workbook',{}],['POST','/mongo-workbook',normal[variant]]],sessionProtectedPath:'/mongo-workbook',negativeDescription:'公開データの正常な検索・更新は成功し、クエリ構造やcollection指定から内部データと保護属性へ到達しない。',implementationNote:'Docker内の実MongoDB 7と公式Nodeドライバを使用。Vは演算子、$where、集約段階、更新、collection、正規表現、配列条件の構造を利用者入力から採用し、F/Nは入力型と操作を固定する。'}));
export const definitions=all.filter(item=>!item.additionalVariant);
export const variantDefinitions=all.filter(item=>item.additionalVariant);
export async function reset({getRun}){
  records=[];if(!active.has(getRun().variant))return;
  const db=await getDb();await db.dropDatabase();
  await db.collection('members').insertMany([
    {username:'alice',tenant:'A',note:'Public member',role:'user',displayName:'Alice',join:'sealed',tags:[{kind:'team',allowed:true},{kind:'secret',allowed:false}]},
    {username:'bob',tenant:'B',note:getRun().canary,role:'user',displayName:'Bob',join:'sealed',tags:[{kind:'team',allowed:false},{kind:'secret',allowed:true}]}
  ]);
  await db.collection('internal').insertOne({join:'sealed',value:getRun().canary});
  await db.collection('public').insertOne({value:'Public guide'});
  await db.collection('records').insertMany([{name:'Guide',value:'Public record'},{name:'Private note',value:getRun().canary}]);
}
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function validatePipeline(stages){
  if(!Array.isArray(stages)||stages.length<1||stages.length>4)return false;
  return stages.every(stage=>plain(stage)&&Object.keys(stage).length===1&&['$match','$lookup','$unwind','$project'].includes(Object.keys(stage)[0]));
}
async function evaluate(variant,body,v,canary){
  const db=await getDb();let rows;
  if(variant==='B0091'){
    const filter=body.filter;
    if(v?!(typeof filter==='string'||plain(filter)&&Object.keys(filter).length===1&&['$ne','$eq'].includes(Object.keys(filter)[0])&&typeof Object.values(filter)[0]==='string'):typeof filter!=='string')throw Error('Invalid filter');
    rows=await db.collection('members').find({username:v?filter:String(filter),...(!v?{tenant:'A'}:{})},{projection:{_id:0,username:1,note:1},maxTimeMS:250}).toArray();
  }else if(variant==='B0092'){
    const where=body.where;
    if(typeof where!=='string'||where.length>120||!v&&where!==normal.B0092.where)throw Error('Invalid where');
    rows=await db.collection('members').find(v?{$where:where}:{username:'alice'},{projection:{_id:0,username:1,note:1},maxTimeMS:250}).toArray();
  }else if(variant==='B0093'){
    const pipeline=body.pipeline;
    if(!validatePipeline(pipeline)||!v&&JSON.stringify(pipeline)!==JSON.stringify(normal.B0093.pipeline))throw Error('Invalid pipeline');
    rows=await db.collection('members').aggregate(v?pipeline:normal.B0093.pipeline,{maxTimeMS:250}).toArray();
  }else if(variant==='B0095'){
    const patch=body.patch;
    if(!plain(patch)||Object.keys(patch).length!==1||!plain(patch.$set)||Object.keys(patch.$set).length!==1||!Object.keys(patch.$set).every(key=>['displayName','role'].includes(key)&&typeof patch.$set[key]==='string')||!v&&Object.keys(patch.$set)[0]!=='displayName')throw Error('Invalid patch');
    await db.collection('members').updateOne({username:'alice'},v?patch:{$set:{displayName:patch.$set.displayName}});
    rows=await db.collection('members').find({username:'alice'},{projection:{_id:0,username:1,displayName:1,role:1}}).toArray();
  }else if(variant==='B0096'){
    const collection=body.collection;
    if(!['public','internal'].includes(collection)||!v&&collection!=='public')throw Error('Invalid collection');
    rows=await db.collection(v?collection:'public').find({},{projection:{_id:0},maxTimeMS:250}).toArray();
  }else if(variant==='B0097'){
    const pattern=body.pattern;
    if(typeof pattern!=='string'||pattern.length>30)throw Error('Invalid pattern');
    const expression=v?new RegExp(pattern):new RegExp('^'+pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
    rows=await db.collection('records').find({name:expression},{projection:{_id:0},maxTimeMS:250}).toArray();
  }else{
    const condition=body.condition;
    const normalCondition=plain(condition)&&condition.kind==='team'&&condition.allowed===true&&Object.keys(condition).length===2;
    const crossElement=plain(condition)&&Array.isArray(condition.$and)&&condition.$and.length===2&&JSON.stringify(condition.$and)===JSON.stringify([{'tags.kind':'team'},{'tags.allowed':true}]);
    if(!(normalCondition||v&&crossElement))throw Error('Invalid condition');
    const query=v&&crossElement?condition:{tags:{$elemMatch:{kind:'team',allowed:true}}};
    rows=await db.collection('members').find(query,{projection:{_id:0,username:1,note:1},maxTimeMS:250}).toArray();
  }
  const exposed=JSON.stringify(rows).includes(canary);
  return {rows,exposed};
}
export function register(router,{getRun,vulnerable,requireLogin,page}){
  const selected=(req,res,next)=>active.has(getRun().variant)?next():next('route');
  router.get('/mongo-workbook',selected,(req,res)=>{if(!requireLogin(req,res))return;res.type('html').send(page('文書データ操作','<p>文書データの検索・集計・更新を行います。</p>'));});
  router.post('/mongo-workbook',selected,async(req,res)=>{
    if(!requireLogin(req,res))return;
    const variant=getRun().variant;
    try{
      const result=await evaluate(variant,req.body||{},vulnerable(),getRun().canary);
      records.push({variant,exposed:result.exposed,roleChanged:variant==='B0095'&&result.rows[0]?.role==='admin'});
      res.json(result);
    }catch(error){if(error.message.startsWith('Invalid'))return res.sendStatus(400);res.sendStatus(422);}
  });
}
export async function audit({getRun}){
  if(!active.has(getRun().variant))return {};
  const db=await getDb(),alice=await db.collection('members').findOne({username:'alice'},{projection:{_id:0,role:1}});
  return {batch6Mongo:{records:[...records],aliceRole:alice?.role}};
}
