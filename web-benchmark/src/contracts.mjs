import {definitions as caseDefinitions,variantDefinitions} from './cases/index.mjs';

// Delivered equally to both scanners. No root IDs, arm, oracle, or attack payloads.
const defs={
  search:[['GET','/search',{q:'Apple'}]],
  message:[['GET','/message',{text:'Hello'}]],
  preview:[['GET','/preview',{}]],
  files:[['GET','/files',{name:'public/readme.txt'}]],
  extensions:[['GET','/extensions',{}],['POST','/extensions',{name:'hello',source:"console.log('Hello extension')"}],['GET','/extensions/{id}',{}, {id:'hello'}]],
  account:[],session:[],
  recovery:[['GET','/recovery',{}],['POST','/recovery',{username:'alice'}],['POST','/reset',{token:'supplied-by-own-inbox',password:'Changed-alice-2026!'}]],
  api:[['GET','/token',{}],['GET','/member-api',{}]],
  connect:[['GET','/connect',{}],['GET','/idp/authorize',{state:'from-connect'}],['POST','/idp/authorize',{username:'alice',password:'Fixture-alice-2026!',state:'from-connect'}],['GET','/callback',{code:'from-idp',state:'from-connect'}]],
  documents:[['GET','/documents/{id}',{}, {id:101}]],
  management:[['GET','/management',{}],['POST','/management',{action:'rebuild-report'}]],
  profile:[['GET','/profile',{}],['POST','/profile',{contact:'normal@example.test',csrf:'from-session'}]],
  integration:[['GET','/integration',{}],['GET','/integration-data',{}]],
  news:[['GET','/news',{}]],
  shop:[['GET','/shop',{}],['POST','/shop',{product:'book',price:1000}]]
};
// Document optional non-secret inputs so both scanners can discover them from
// the same public schema. Empty examples never trigger the diagnostic branch.
const requestHeaders={news:{'X-News-Preview':''}};
export function requests(feature,base) {
  const definition=[...caseDefinitions,...variantDefinitions].find(item=>item.feature===feature);
  const extra=definition?.requests||[];
  const loginPath=definition?.loginPath||(feature==='signin'?'/signin':'/login');
  const logoutPath=definition?.logoutPath||(feature==='signout'?'/signout':'/logout');
  const candidates=[['GET',loginPath,{}],['POST',loginPath,{username:'alice',password:'Fixture-alice-2026!',...definition?.loginFields}],['GET','/session',{}],['POST',logoutPath,{}],...(defs[feature]||[]),...extra];
  const seen=new Set();
  return candidates.filter(([method,p])=>{const key=method+' '+p;if(seen.has(key))return false;seen.add(key);return true;}).map(([method,p,values,pathValues])=>({method,path:base+p,values,...(pathValues?{pathValues}:{}),...(requestHeaders[feature]&&p==='/news'?{headers:requestHeaders[feature]}:{})}));
}
function normalValueSchema(value) {
  if(Array.isArray(value)) {
    const types=value.map(normalValueSchema);
    const distinct=[...new Map(types.map(type=>[JSON.stringify(type),type])).values()];
    return {type:'array',items:distinct.length===1?distinct[0]:distinct.length?{oneOf:distinct}:{}};
  }
  if(value!==null&&typeof value==='object')return {type:'object',properties:Object.fromEntries(Object.entries(value).map(([name,item])=>[name,normalValueSchema(item)])),additionalProperties:false};
  if(typeof value==='number')return {type:Number.isInteger(value)?'integer':'number'};
  if(typeof value==='boolean')return {type:'boolean'};
  if(value===null)return {nullable:true};
  return {type:'string'};
}
export function openapi(feature,base) {
  const paths={};
  for(const request of requests(feature,base)) {
    const parameters=[];const pathNames=[...request.path.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]);
    for(const name of pathNames)parameters.push({name,in:'path',required:true,schema:{type:typeof request.pathValues?.[name]==='number'?'integer':'string'},example:request.pathValues?.[name]});
    if(request.method==='GET')for(const [name,value]of Object.entries(request.values))parameters.push({name,in:'query',schema:normalValueSchema(value),example:value});
    for(const [name,value]of Object.entries(request.headers||{}))parameters.push({name,in:'header',required:false,schema:normalValueSchema(value),example:value});
    const operation={responses:{'200':{description:'Successful operation'},'400':{description:'Invalid input'},'401':{description:'Authentication required'},'403':{description:'Forbidden'}},...(parameters.length?{parameters}:{})};
    if(['POST','PATCH','PUT','DELETE'].includes(request.method)) {
      const content={'application/json':{schema:{type:'object',properties:Object.fromEntries(Object.entries(request.values).map(([k,v])=>[k,{...normalValueSchema(v),example:v}])),additionalProperties:false}}};
      // No implicit form flattening for a structured JSON-only normal input.
      if(!Object.values(request.values).some(value=>value!==null&&typeof value==='object'))content['application/x-www-form-urlencoded']={schema:{type:'object',properties:Object.fromEntries(Object.entries(request.values).map(([k,v])=>[k,{type:'string',example:String(v)}]))}};
      operation.requestBody={required:true,content};
    }
    if(!paths[request.path])paths[request.path]={};paths[request.path][request.method.toLowerCase()]=operation;
  }
  return {openapi:'3.0.3',info:{title:'Workspace API',version:'1.0.0'},servers:[{url:'/'}],paths};
}
