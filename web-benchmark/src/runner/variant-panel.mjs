import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {variantCases} from '../catalog.mjs';

export const VARIANT_PANEL_SCHEMA='benchmark-operator-variant-panel-0.1';
const sha=value=>createHash('sha256').update(value).digest('hex');
const variants=variantCases.map(({root,variant,sessionProtectedPath})=>({root,variant,authMode:sessionProtectedPath?'session':'anonymous'})).sort((a,b)=>a.variant.localeCompare(b.variant));
export function createVariantPanel({seed='batch4-2026',arms=['V','F','N'],wallSeconds=30,requests=100,profile='baseline',variantIds,createdAt=new Date().toISOString()}={}) {
 if(typeof seed!=='string'||!seed||seed.length>256||!Array.isArray(arms)||arms.length<1||new Set(arms).size!==arms.length||arms.some(x=>!['V','F','N'].includes(x)))throw Error('Invalid variant panel selection');
 if(!Number.isInteger(wallSeconds)||wallSeconds<10||wallSeconds>1200||!Number.isInteger(requests)||requests<10||requests>3000||profile!=='baseline')throw Error('Invalid variant panel budget/profile');
 if(!Number.isFinite(Date.parse(createdAt)))throw Error('Invalid creation time');
 if(variantIds!==undefined&&(!Array.isArray(variantIds)||!variantIds.length||new Set(variantIds).size!==variantIds.length||variantIds.some(id=>typeof id!=='string'||!variants.some(v=>v.variant===id))))throw Error('Invalid variant selection');
 const chosen=variantIds===undefined?variants:variants.filter(item=>variantIds.includes(item.variant));
 const selection={seed,arms,wallSeconds,requests,profile,...(variantIds===undefined?{}:{variantIds:chosen.map(item=>item.variant)})};
 const cells=chosen.flatMap(item=>arms.map(arm=>{
  const condition={profile,authMode:item.authMode,subject:item.authMode==='session'?'alice':null,wallSeconds,requestedHttpRequests:requests,requestedConcurrency:2};
  return {cellId:'cell-'+sha(JSON.stringify([item.root,item.variant,arm,seed,condition])),root:item.root,variant:item.variant,arm,seed,replicate:1,expectedWorkspace:'/w/'+sha(seed+item.root+item.variant).slice(0,12),condition,status:'not_run',run:null};
 }));
 return {schema:VARIANT_PANEL_SCHEMA,visibility:'private operator plan; never supply this JSON to a scanner',execution:'planning_only',status:'not_run',planId:'variant-panel-'+sha(JSON.stringify([chosen,selection])),createdAt,catalogSnapshot:{additionalVariantCount:chosen.length,variants:chosen},selection,cellCount:cells.length,cells};
}
export function validateVariantPanel(plan) {
 if(plan?.schema!==VARIANT_PANEL_SCHEMA||!plan.selection||!Array.isArray(plan.cells)||plan.cells.length>10000)throw Error('Invalid variant panel');
 const legacy=plan.selection.variantIds===undefined;
 const expected=createVariantPanel({...plan.selection,variantIds:legacy?plan.catalogSnapshot?.variants?.map(item=>item.variant):plan.selection.variantIds,createdAt:plan.createdAt});
 if(legacy){delete expected.selection.variantIds;expected.planId='variant-panel-'+sha(JSON.stringify([expected.catalogSnapshot.variants,expected.selection]));}
 if(!isDeepStrictEqual(plan,expected))throw Error('Variant panel identities or catalog differ from current source');
 return structuredClone(expected);
}
