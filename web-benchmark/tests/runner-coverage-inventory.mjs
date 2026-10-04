import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {collectCoverage,coverageInventory,coverageMarkdown,designCases,passedCells} from '../src/reporting/coverage.mjs';

const design={variants:[{id:'B0001',root_id:'R0001',title:'検索',comparison_track:'core_dast'},{id:'B0002',root_id:'R0001',title:'検索の変種',comparison_track:'core_dast'},{id:'B0491',root_id:'R0491',title:'native',comparison_track:'native_lab'}]};
const cell=(variant,mode,passed=true)=>({root:variant==='B0491'?'R0491':'R0001',variant,mode,passed});
const report=(path,cells)=>({path,data:{schema:'benchmark-acceptance-0.2',results:cells,summary:{cells:cells.length}}});
test('coverage retains variants and arms while root causes remain shared',()=>{
  const result=coverageInventory(design,[report('acceptance.json',['V','F','N'].map(arm=>cell('B0001',arm)))]);
  assert.equal(result.summary.designRoots,2);assert.equal(result.summary.designVariants,3);assert.equal(result.summary.variantsWithVfnRecords,1);assert.equal(result.summary.uniquePassedVariantArmRecords,3);assert.equal(result.rows[2].track,'native_lab');assert.match(coverageMarkdown(result),/現在のソースの成立確認/);
});
test('repeated records are deduplicated and partial V/F does not become V/F/N',()=>{
  const result=coverageInventory(design,[report('a', ['V','F'].map(a=>cell('B0001',a))),report('b',[cell('B0001','V')])]);
  assert.equal(result.summary.uniquePassedVariantArmRecords,2);assert.equal(result.summary.variantsWithVfnRecords,0);assert.equal(result.summary.variantsWithPartialRecords,1);
});
test('old aggregate results do not fabricate individual case evidence',()=>{
  const result=coverageInventory(design,[{path:'extended.json',data:{schema:'benchmark-extended-regression-0.1',summary:{reportedCells:168}}}]);
  assert.equal(result.summary.aggregateReports,1);assert.equal(result.summary.variantsWithoutIndividualRecords,3);assert.equal(result.summary.uniquePassedVariantArmRecords,0);
});
test('recorded acceptance source must be valid and stable before its cells count',()=>{
  const source={schema:'benchmark-source-snapshot-0.1',algorithm:'sha256-byte-files-and-sorted-path-map',files:{},sha256:createHash('sha256').update('{}').digest('hex')};
  const data={schema:'benchmark-acceptance-0.2',seed:'fixture-seed',source,sourceAfter:{status:'matched',recordedSha256:source.sha256,currentSha256:source.sha256},results:['V','F','N'].map(arm=>cell('B0001',arm))};
  const matched=coverageInventory(design,[{path:'new.json',data}]);
  assert.equal(matched.summary.variantsWithVfnRecords,1);
  assert.equal(matched.sources[0].sourceSha256,source.sha256);
  assert.equal(matched.sources[0].seed,'fixture-seed');
  for(const bad of [{...data,sourceAfter:{status:'changed'}},{...data,sourceAfter:undefined},{...data,source:{...source,sha256:'0'.repeat(64)}}]){
    const inventory=coverageInventory(design,[{path:'new.json',data:bad}]);
    assert.equal(inventory.summary.variantsWithVfnRecords,0);
    assert.deepEqual(inventory.issues,[{source:'new.json',code:'source_snapshot_unstable_or_invalid'}]);
  }
});
test('unknown, relabelled, duplicate, and summary-mismatched cells are excluded',()=>{
  for(const cells of [[cell('B9999','V')],[{...cell('B0001','V'),root:'R0002'}],[cell('B0001','V'),cell('B0001','V')]])assert.equal(coverageInventory(design,[report('a',cells)]).summary.issues,1);
  const input=report('a',[cell('B0001','V')]);input.data.summary.cells=2;assert.equal(coverageInventory(design,[input]).summary.uniquePassedVariantArmRecords,0);
});
test('failed and passed records for the same condition stay visible',()=>{
  const result=coverageInventory(design,[report('a',[cell('B0001','V')]),report('b',[cell('B0001','V',false)])]);
  assert.equal(result.summary.variantsWithConflictingOrFailedRecords,1);assert.deepEqual(result.rows[0].failedArms,['V']);
});
test('an uncovered acceptance root invalidates that report without hiding a real failure elsewhere',()=>{
  const uncovered=report('unsupported',[cell('B0001','V'),{...cell('B0002','F',false),error:'Uncovered root'}]);
  const failed=report('actual-failure',[cell('B0001','N',false)]);
  const valid=report('valid',['V','F','N'].map(arm=>cell('B0002',arm)));
  const result=coverageInventory(design,[uncovered,failed,valid]);
  assert.deepEqual(result.issues,[{source:'unsupported',code:'acceptance_root_not_implemented'}]);
  assert.equal(result.rows[0].status,'mixed_or_failed_records');
  assert.deepEqual(result.rows[0].failedArms,['N']);
  assert.equal(result.rows[1].status,'vfn_records');
  assert.equal(result.sources.some(source=>source.path==='unsupported'),false);
});
test('saved focused acceptance is included without erasing an earlier failure',async()=>{
  await mkdir('artifacts',{recursive:true});
  const directory=await mkdtemp(join(process.cwd(),'artifacts','coverage-test-'));
  try{
    await writeFile(join(directory,'acceptance.json'),JSON.stringify(report('acceptance.json',[cell('B0001','V',false)]).data));
    await writeFile(join(directory,'acceptance-saved-r0001-20261004.json'),JSON.stringify(report('saved',['V','F','N'].map(arm=>cell('B0001',arm))).data));
    const result=await collectCoverage(directory,design);
    assert.deepEqual(result.rows[0].passedArms,['F','N','V']);
    assert.deepEqual(result.rows[0].failedArms,['V']);
    assert.equal(result.rows[0].status,'mixed_or_failed_records');
    assert.equal(result.sources.length,2);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('structured extended reports can contribute exact individual outcomes',()=>{
  const result=coverageInventory(design,[{path:'extended.json',data:{schema:'benchmark-extended-regression-0.2',results:[{status:'passed',cellResults:[cell('B0002','V'),cell('B0002','F'),cell('B0002','N')]}]}}]);
  assert.equal(result.summary.variantsWithVfnRecords,1);assert.equal(result.summary.aggregateReports,0);
});
test('stable extended acceptance exposes only runtime file hashes for source linkage',()=>{
  const files={'package-lock.json':'a'.repeat(64),'package.json':'b'.repeat(64),'src/app.mjs':'c'.repeat(64),'tests/acceptance.mjs':'d'.repeat(64)};
  const sha256=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
  const source={schema:'benchmark-source-snapshot-0.1',algorithm:'sha256-byte-files-and-sorted-path-map',sha256,files};
  const data={schema:'benchmark-extended-regression-0.2',source,sourceAfter:{status:'matched',recordedSha256:sha256,currentSha256:sha256},results:[{status:'passed',cellResults:['V','F','N'].map(arm=>cell('B0001',arm))}]};
  const inventory=coverageInventory(design,[{path:'saved.json',data}]);
  assert.equal(inventory.summary.variantsWithVfnRecords,1);
  assert.deepEqual(inventory.sources[0].sourceRuntimeFiles,{'package-lock.json':files['package-lock.json'],'package.json':files['package.json'],'src/app.mjs':files['src/app.mjs']});
  data.sourceAfter={status:'changed'};
  assert.equal(coverageInventory(design,[{path:'saved.json',data}]).summary.variantsWithVfnRecords,0);
});
test('recorded target runtime proof is recomputed before acceptance cells count',()=>{
  const files={'package-lock.json':'a'.repeat(64),'package.json':'b'.repeat(64),'src/app.mjs':'c'.repeat(64)};
  const sha256=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
  const source={schema:'benchmark-source-snapshot-0.1',algorithm:'sha256-byte-files-and-sorted-path-map',sha256,files};
  const proof={schema:'benchmark-runtime-source-proof-0.1',algorithm:'sha256-byte-files-and-sorted-path-map',sha256,files,runtime:{node:'v24',platform:'linux',architecture:'arm64'}};
  const data={schema:'benchmark-extended-regression-0.2',source,sourceAfter:{status:'matched',recordedSha256:sha256,currentSha256:sha256},targetRuntimeSource:{verifier:structuredClone(proof),targetBefore:structuredClone(proof),targetAfter:structuredClone(proof)},results:[{status:'passed',cellResults:['V','F','N'].map(arm=>cell('B0001',arm))}]};
  assert.equal(coverageInventory(design,[{path:'saved.json',data}]).summary.variantsWithVfnRecords,1);
  const altered=structuredClone(data);altered.targetRuntimeSource.targetAfter.files['src/app.mjs']='d'.repeat(64);
  const invalid=coverageInventory(design,[{path:'saved.json',data:altered}]);
  assert.equal(invalid.summary.variantsWithVfnRecords,0);
  assert.deepEqual(invalid.issues,[{source:'saved.json',code:'target_runtime_source_unmatched_or_invalid'}]);
});

test('independent test files may repeat a condition without doubling coverage',()=>{
  const data={schema:'benchmark-extended-regression-0.2',results:['one','two'].map(file=>({file,status:'passed',cellResults:[cell('B0001','V')]}))};
  const result=coverageInventory(design,[{path:'extended.json',data}]);assert.equal(result.summary.issues,0);assert.equal(result.summary.uniquePassedVariantArmRecords,1);assert.equal(result.rows[0].evidence.length,2);
  data.sourceAfter={status:'changed'};assert.equal(coverageInventory(design,[{path:'extended.json',data}]).summary.uniquePassedVariantArmRecords,0);
});
test('captured results retain only IDs and outcomes and reject duplicates',()=>{
  const cases=designCases(design),line=JSON.stringify({variant:'B0001',mode:'V',result:'passed',secret:'synthetic-do-not-copy'});
  assert.deepEqual(passedCells('ordinary log\n'+line,cases),[cell('B0001','V')]);assert.throws(()=>passedCells(line+'\n'+line,cases),/Duplicate/);
  assert.throws(()=>passedCells(JSON.stringify({variant:'B9999',mode:'V',result:'passed'}),cases),/Invalid/);
});
test('design IDs and relationships must be unique and well formed',()=>{
  assert.throws(()=>designCases({variants:[design.variants[0],design.variants[0]]}),/duplicate/);assert.throws(()=>designCases({variants:[{id:'B0001',root_id:'invalid'}]}),/Invalid/);
});
