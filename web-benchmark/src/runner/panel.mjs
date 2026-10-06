import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {cases} from '../catalog.mjs';
import {SCAN_PROFILES} from './policy.mjs';

export const PANEL_SCHEMA='benchmark-operator-panel-0.1';
export const MAX_PANEL_CELLS=10000;
const ARMS=['V','F','N'];
const PROFILES=SCAN_PROFILES;
const AUTH=['anonymous','session','bearer'];
const USERS=['alice','bob','carol','approver','admin'];
const optionNames=['roots','seeds','arms','replicates','profiles','auth','user','wallSeconds','requests','concurrency','maxCells'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function integer(value,fallback,min,max,name) {
  const result=value===undefined?fallback:value;
  if(!Number.isSafeInteger(result)||result<min||result>max)throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return result;
}
function list(value,name) {
  if(!Array.isArray(value)||value.length===0)throw new Error(`${name} must be a nonempty list.`);
  const result=value.map(item=>{
    if(typeof item!=='string'||!item.trim()||/[\u0000-\u001f\u007f]/.test(item))throw new Error(`${name} must contain nonempty text without control characters.`);
    return item.trim();
  });
  if(new Set(result).size!==result.length)throw new Error(`${name} contains duplicate values.`);
  return result;
}
function choices(value,fallback,allowed,name) {
  const result=list(value===undefined?fallback:value,name);
  if(result.some(item=>!allowed.includes(item)))throw new Error(`${name} contains an unsupported value.`);
  return result.sort((a,b)=>allowed.indexOf(a)-allowed.indexOf(b));
}
function catalogRows(catalog) {
  if(!Array.isArray(catalog)||catalog.length===0)throw new Error('The implemented catalog must not be empty.');
  const result=catalog.map(item=>{
    if(!object(item)||typeof item.root!=='string'||!item.root.trim()||typeof item.variant!=='string'||!item.variant.trim())throw new Error('The implemented catalog needs root and representative variant identities.');
    return {root:item.root,variant:item.variant};
  }).sort((a,b)=>compare(a.root,b.root));
  if(new Set(result.map(item=>item.root)).size!==result.length)throw new Error('The implemented catalog contains duplicate roots.');
  return result;
}
function selection(options,catalog) {
  if(!object(options)||Object.keys(options).some(name=>!optionNames.includes(name)))throw new Error('Unknown plan option.');
  const implemented=catalogRows(catalog);
  const byRoot=new Map(implemented.map(item=>[item.root,item]));
  const roots=options.roots==='all'?implemented.map(item=>item.root):list(options.roots,'roots').sort(compare);
  if(roots.some(root=>!byRoot.has(root)))throw new Error('Every selected root must be in the implemented catalog.');
  const seeds=list(options.seeds,'seeds').sort(compare);
  if(seeds.some(seed=>seed.length>256))throw new Error('Seeds must be at most 256 characters.');
  const arms=choices(options.arms,ARMS,ARMS,'arms');
  const profiles=choices(options.profiles,['baseline'],PROFILES,'profiles');
  const auth=choices(options.auth,['anonymous'],AUTH,'auth');
  const user=options.user===undefined?'alice':options.user;
  if(!USERS.includes(user))throw new Error('user must name a supported fixture subject.');
  const replicates=integer(options.replicates,1,1,3,'replicates');
  const wallSeconds=integer(options.wallSeconds,30,10,1200,'wallSeconds');
  const requests=integer(options.requests,100,10,10000,'requests');
  const concurrency=integer(options.concurrency,2,2,8,'concurrency');
  if(![2,4,6,8].includes(concurrency))throw new Error('concurrency must be 2, 4, 6, or 8.');
  const maxCells=integer(options.maxCells,MAX_PANEL_CELLS,1,MAX_PANEL_CELLS,'maxCells');
  const cellCount=roots.length*arms.length*seeds.length*replicates*profiles.length*auth.length;
  if(!Number.isSafeInteger(cellCount)||cellCount>maxCells)throw new Error(`Plan exceeds the maximum of ${maxCells} cells.`);
  return {implemented,byRoot,roots,seeds,arms,profiles,auth,user,replicates,wallSeconds,requests,concurrency,maxCells,cellCount};
}
export function createPanel(options,{catalog=cases,createdAt=new Date().toISOString()}={}) {
  const selected=selection(options,catalog);
  if(typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt)))throw new Error('createdAt must be a valid timestamp.');
  const {implemented,byRoot,roots,seeds,arms,profiles,auth,user,replicates,wallSeconds,requests,concurrency,maxCells,cellCount}=selected;
  const cells=[];
  for(const root of roots)for(const arm of arms)for(const seed of seeds)for(let replicate=1;replicate<=replicates;replicate++)for(const profile of profiles)for(const authMode of auth) {
    const variant=byRoot.get(root).variant;
    const condition={profile,authMode,subject:authMode==='anonymous'?null:user,wallSeconds,requestedHttpRequests:requests,requestedConcurrency:concurrency};
    const identity=[root,variant,arm,seed,replicate,condition];
    cells.push({cellId:'cell-'+hash(JSON.stringify(identity)),root,variant,arm,seed,replicate,expectedWorkspace:'/w/'+hash(seed+root).slice(0,12),condition,status:'not_run',run:null});
  }
  const normalizedSelection={rootSelection:options.roots==='all'?'all_implemented':'explicit',roots,arms,seeds,replicates,profiles,auth,user,wallSeconds,requestedHttpRequests:requests,requestedConcurrency:concurrency,maxCells};
  return {schema:PANEL_SCHEMA,visibility:'private operator plan; never supply this JSON to a scanner',execution:'planning_only',status:'not_run',planId:'panel-'+hash(JSON.stringify([implemented,normalizedSelection,cells.map(cell=>cell.cellId)])),createdAt,catalogSnapshot:{implementedRootCount:implemented.length,representativeCases:implemented},selection:normalizedSelection,cellCount,cells};
}
export function validatePanel(panel,{catalog=cases}={}) {
  if(!object(panel)||!object(panel.selection)||!object(panel.catalogSnapshot)||!Array.isArray(panel.cells)||panel.cells.length>MAX_PANEL_CELLS)throw new Error('Expected a bounded, unrun operator panel.');
  const frozen=catalogRows(panel.catalogSnapshot.representativeCases);
  const implemented=new Map(catalogRows(catalog).map(item=>[item.root,item.variant]));
  if(frozen.some(item=>implemented.get(item.root)!==item.variant))throw new Error('The plan catalog includes a root or representative variant that is not currently implemented.');
  const s=panel.selection;
  if(!['all_implemented','explicit'].includes(s.rootSelection))throw new Error('Unsupported root selection.');
  const expected=createPanel({roots:s.rootSelection==='all_implemented'?'all':s.roots,seeds:s.seeds,arms:s.arms,replicates:s.replicates,profiles:s.profiles,auth:s.auth,user:s.user,wallSeconds:s.wallSeconds,requests:s.requestedHttpRequests,concurrency:s.requestedConcurrency,maxCells:s.maxCells},{catalog:frozen,createdAt:panel.createdAt});
  if(!isDeepStrictEqual(panel,expected))throw new Error('Plan identities, conditions, order, or unrun state do not match the generated plan.');
  return structuredClone(expected);
}
function outputName(value) {
  if(typeof value!=='string'||!value.trim()||value.startsWith('-')||/[\u0000-\u001f\u007f]/.test(value))throw new Error('An explicit output filename is required.');
  return value;
}
export async function savePanel(output,panel) {
  outputName(output);
  if(!object(panel)||panel.schema!==PANEL_SCHEMA||!Array.isArray(panel.cells))throw new Error('Expected an operator panel.');
  const content=JSON.stringify(panel,null,2)+'\n';
  await mkdir(path.dirname(path.resolve(output)),{recursive:true});
  await writeFile(output,content,{flag:'wx',mode:0o600});
  return output;
}
export function parsePanelArgs(argv) {
  if(!Array.isArray(argv)||argv.some(value=>typeof value!=='string'))throw new Error('Arguments must be text.');
  if(argv.length===1&&['help','--help','-h'].includes(argv[0]))return {command:'help'};
  if(argv.length===1&&argv[0]==='list')return {command:'list'};
  if(argv[0]!=='generate'||argv.length<2)throw new Error('Use generate OUTPUT.json with explicit --roots and --seeds, or list/help.');
  const output=outputName(argv[1]);
  const flags={'--roots':'roots','--seeds':'seeds','--arms':'arms','--replicates':'replicates','--profiles':'profiles','--auth':'auth','--user':'user','--wall-seconds':'wallSeconds','--requests':'requests','--concurrency':'concurrency','--max-cells':'maxCells'};
  const csv=new Set(['roots','seeds','arms','profiles','auth']);
  const numeric=new Set(['replicates','wallSeconds','requests','concurrency','maxCells']);
  const options={};
  for(let index=2;index<argv.length;index+=2) {
    const flag=argv[index],value=argv[index+1];
    if(!Object.hasOwn(flags,flag))throw new Error('Unknown plan flag.');
    const name=flags[flag];
    if(Object.hasOwn(options,name))throw new Error('Plan flags must not be repeated.');
    if(value===undefined||value.startsWith('--'))throw new Error('Every plan flag needs a value.');
    if(csv.has(name))options[name]=name==='roots'&&value==='all'?'all':value.split(',').map(item=>item.trim());
    else if(numeric.has(name)){if(!/^\d+$/.test(value))throw new Error('Numeric plan flags require integer values.');options[name]=Number(value);}
    else options[name]=value;
  }
  selection(options,cases);
  return {command:'generate',output,options};
}
