import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceLinkage,linkageMarkdown} from '../src/reporting/linkage.mjs';

const coverage={schema:'benchmark-coverage-inventory-0.1',rows:[
  {variant:'B0001',root:'R0001',title:'first',track:'core_dast',status:'vfn_records',evidence:[{arm:'V'},{arm:'F'},{arm:'N'}]},
  {variant:'B0002',root:'R0001',title:'second',track:'core_dast',status:'no_individual_record',evidence:[]},
  {variant:'B0003',root:'R0003',title:'third',track:'workflow',status:'vfn_records',evidence:[{arm:'V'},{arm:'F'},{arm:'N'}]}
]};
const series=(variant,root,seed='one')=>({variant,root,seed,replicate:1,profile:'active',authMode:'anonymous',completeVfn:true});
test('linkage separates missing truth from unlinked source without claiming detection',()=>{
  const audit={schema:'benchmark-artifact-audit-0.1',ledgers:[{path:'one-ledger.json',planVerified:true,series:[series('B0001','R0001'),series('B0002','R0001'),series('B0002','R0001','two')]}]};
  const result=evidenceLinkage(coverage,audit);
  assert.deepEqual(result.summary,{variants:3,withCompleteScan:2,withoutCompleteScan:1,completeScanWithoutIndividualVfn:1,completeScanWithIndividualVfnButSourceUnlinked:1,verifiedSourceLinked:0,issues:0});
  assert.equal(result.variants.find(row=>row.variant==='B0002').completeScanSeries.length,2);
  assert.equal(result.variants.find(row=>row.variant==='B0003').state,'no_complete_scan');
  assert.match(linkageMarkdown(result),/ソース・環境の対応付けを確認/);
});
test('mismatched or unverified scan series cannot become completed evidence',()=>{
  const audit={schema:'benchmark-artifact-audit-0.1',ledgers:[{path:'bad-ledger.json',planVerified:false,series:[series('B0001','R0001')]},{path:'wrong-root.json',planVerified:true,series:[series('B0002','R9999')]}]};
  const result=evidenceLinkage(coverage,audit);
  assert.equal(result.summary.withCompleteScan,0);
  assert.equal(result.summary.issues,2);
});
