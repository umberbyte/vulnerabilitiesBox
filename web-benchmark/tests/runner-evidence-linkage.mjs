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
  assert.deepEqual(result.summary,{variants:3,withCompleteScan:2,withoutCompleteScan:1,completeScanWithoutIndividualVfn:1,completeScanWithIndividualVfnButSourceUnlinked:1,scanRuntimeSourceNotRecorded:1,scanRuntimeSourceProofUnavailable:0,acceptanceScanRuntimeSourceUnmatched:0,verifiedSourceLinked:0,dependencyEnvironmentLinked:0,issues:0});
  assert.equal(result.variants.find(row=>row.variant==='B0002').completeScanSeries.length,2);
  assert.equal(result.variants.find(row=>row.variant==='B0003').state,'no_complete_scan');
  assert.equal(result.variants.find(row=>row.variant==='B0001').sourceLinkBlocker,'scan_runtime_source_not_recorded');
  assert.match(linkageMarkdown(result),/走査時ソース指紋なし。新規測定で記録/);
});
test('only a complete series with byte-matched individual V/F/N source is linked',()=>{
  const files={'package-lock.json':'a'.repeat(64),'package.json':'b'.repeat(64),'src/app.mjs':'c'.repeat(64)};
  const input={...coverage,sources:[{path:'individual.json',sourceRuntimeFiles:files}],rows:[{...coverage.rows[0],evidence:['V','F','N'].map(arm=>({path:'individual.json',arm,passed:true}))}]};
  const sha='d'.repeat(64),scan={...series('B0001','R0001'),runtimeSourceSha256:sha};
  const audit={schema:'benchmark-artifact-audit-0.1',runtimeSources:{[sha]:{files}},ledgers:[{path:'matched-ledger.json',planVerified:true,series:[scan]}]};
  const linked=evidenceLinkage(input,audit);
  assert.equal(linked.summary.verifiedSourceLinked,1);
  assert.equal(linked.summary.dependencyEnvironmentLinked,0);
  assert.equal(linked.variants[0].sourceLink.files,3);
  assert.match(linkageMarkdown(linked),/実行ソース一致・依存環境とアラートを確認/);
  const stale=structuredClone(audit);stale.runtimeSources[sha].files['src/app.mjs']='e'.repeat(64);
  const mismatched=evidenceLinkage(input,stale);
  assert.equal(mismatched.summary.verifiedSourceLinked,0);
  assert.equal(mismatched.summary.acceptanceScanRuntimeSourceUnmatched,1);
  assert.equal(mismatched.variants[0].sourceLinkBlocker,'acceptance_scan_runtime_source_unmatched');
  const missingProof=structuredClone(audit);delete missingProof.runtimeSources[sha];
  assert.equal(evidenceLinkage(input,missingProof).summary.scanRuntimeSourceProofUnavailable,1);
  input.rows[0].evidence=input.rows[0].evidence.filter(item=>item.arm!=='N');
  assert.equal(evidenceLinkage(input,audit).summary.verifiedSourceLinked,0);
});

test('a current complete pass may be source-linked while an older failure remains visible',()=>{
  const files={'package-lock.json':'a'.repeat(64),'package.json':'b'.repeat(64),'src/app.mjs':'c'.repeat(64)};
  const sha='d'.repeat(64);
  const accepted=['V','F','N'].map(arm=>({path:'current.json',arm,passed:true}));
  const input={...coverage,sources:[{path:'current.json',sourceRuntimeFiles:files}],rows:[{...coverage.rows[0],status:'mixed_or_failed_records',hasVfnRecords:true,evidence:[{path:'older.json',arm:'V',passed:false},...accepted]}]};
  const audit={schema:'benchmark-artifact-audit-0.1',runtimeSources:{[sha]:{files}},ledgers:[{path:'current-ledger.json',planVerified:true,series:[{...series('B0001','R0001'),runtimeSourceSha256:sha}]}]};
  const linked=evidenceLinkage(input,audit);
  assert.equal(linked.summary.verifiedSourceLinked,1);
  assert.equal(linked.summary.completeScanWithoutIndividualVfn,0);
  assert.equal(linked.variants[0].acceptanceStatus,'mixed_or_failed_records');
  assert.equal(linked.variants[0].hasConflictingOrFailedRecords,true);
  assert.equal(linked.variants[0].sourceLink.acceptanceReport,'current.json');
  input.rows[0].hasVfnRecords=false;
  assert.equal(evidenceLinkage(input,audit).variants[0].state,'individual_vfn_missing');
});
test('mismatched or unverified scan series cannot become completed evidence',()=>{
  const audit={schema:'benchmark-artifact-audit-0.1',ledgers:[{path:'bad-ledger.json',planVerified:false,series:[series('B0001','R0001')]},{path:'wrong-root.json',planVerified:true,series:[series('B0002','R9999')]}]};
  const result=evidenceLinkage(coverage,audit);
  assert.equal(result.summary.withCompleteScan,0);
  assert.equal(result.summary.issues,2);
});
