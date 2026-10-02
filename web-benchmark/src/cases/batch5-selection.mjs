// This batch uses the existing Node/PostgreSQL/Redis/browser runtime.
// Primary roots are separate from additional variants of existing roots.
export const groups={
 browser:{R0048:['B0049'],R0054:['B0054','B0056'],R0041:['B0059'],R0062:['B0062'],R0348:['B0348']},
 files:{R0126:['B0127'],R0455:['B0459','B0460','B0467','B0468','B0469']},
 auth:{R0185:['B0186'],R0200:['B0200'],R0210:['B0217'],R0221:['B0222'],R0201:['B0223'],R0251:['B0252'],R0258:['B0259'],R0316:['B0328'],R0329:['B0329']},
 parsing:{R0150:['B0150','B0359','B0360','B0361','B0370']},
 cache:{R0377:['B0378','B0379'],R0380:['B0381'],R0371:['B0389']},
 errors:{R0481:['B0482']},
 transport:{R0331:['B0339'],R0271:['B0349','B0342','B0343'],R0291:['B0344'],R0461:['B0462']}
};
export const primaryRoots=new Set(['R0054','R0062','R0200','R0329','R0348']);
export const selected=Object.entries(groups).flatMap(([group,roots])=>Object.entries(roots).flatMap(([root,ids])=>ids.map(variant=>({group,root,variant,primary:primaryRoots.has(root)&&ids[0]===variant}))));
if(selected.length!==37||new Set(selected.map(x=>x.variant)).size!==37)throw Error('Batch 05 selection mismatch');
