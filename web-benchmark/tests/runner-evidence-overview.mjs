import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageInventory} from '../src/reporting/coverage.mjs';
import {evidenceOverview,overviewMarkdown} from '../src/reporting/overview.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateReports} from '../src/reporting/index.mjs';

const design={roots:[{id:'R0001',title:'入力境界',primary_family:'SQL'},{id:'R0491',title:'native境界',primary_family:'NATIVE'}],variants:[{id:'B0001',root_id:'R0001',title:'検索',comparison_track:'core_dast'},{id:'B0002',root_id:'R0001',title:'別の入力',comparison_track:'workflow'},{id:'B0491',root_id:'R0491',title:'native',comparison_track:'native_lab'}]};
const cell=(variant,mode,passed=true)=>({variant,root:variant==='B0491'?'R0491':'R0001',mode,passed});
const coverage=(cells=[])=>coverageInventory(design,[{path:'acceptance.json',data:{schema:'benchmark-acceptance-0.2',results:cells,summary:{cells:cells.length}}}]);
const series=(variant='B0001',selected=['V','F','N'])=>({root:variant==='B0491'?'R0491':'R0001',variant,configurationHashes:['a'.repeat(64)],completeVfn:selected.length===3,arms:selected.map(arm=>({arm,status:'completed',verified:true}))});
const audit=(records=[],path='panel-ledger.json')=>({schema:'benchmark-artifact-audit-0.1',ledgers:[{path,planVerified:true,series:records}]});

test('a representative variant does not establish all variants of its root cause',()=>{
  const result=evidenceOverview(design,{coverage:coverage(['V','F','N'].map(a=>cell('B0001',a))),audit:audit()});
  assert.equal(result.summary.rootsWithAnyVfnRecordVariant,1);assert.equal(result.summary.rootsWithAllVariantsVfnRecords,0);assert.equal(result.summary.rootsWithoutIndividualRecords,1);
  assert.equal(result.roots[0].variantCount,2);assert.equal(result.roots[0].vfnRecordVariants,1);assert.equal(result.roots[0].noIndividualRecordVariants,1);
});
test('track groups may share a root while primary family counts remain disjoint',()=>{
  const result=evidenceOverview(design,{coverage:coverage(),audit:audit()});
  assert.equal(result.byTrack.reduce((n,g)=>n+g.roots,0),3);assert.equal(result.summary.roots,2);assert.equal(result.byPrimaryFamily.reduce((n,g)=>n+g.roots,0),2);assert.equal(result.byPrimaryFamily.find(g=>g.id==='SQL').variants,2);
});
test('acceptance records and diagnostic completion do not imply each other',()=>{
  const result=evidenceOverview(design,{coverage:coverage(['V','F','N'].map(a=>cell('B0001',a))),audit:audit([series('B0491')])});
  assert.equal(result.roots.find(r=>r.id==='R0001').completeVfnSeriesRecords,0);assert.equal(result.roots.find(r=>r.id==='R0491').vfnRecordVariants,0);assert.equal(result.summary.variantsWithCompleteVfnSeries,1);assert.equal(result.detectionRate,undefined);
});
test('V and F/N in different series cannot be joined into one complete experiment',()=>{
  const input=audit([series('B0001',['V'])]);input.ledgers.push({path:'other-ledger.json',planVerified:true,series:[series('B0001',['F','N'])]});
  const result=evidenceOverview(design,{coverage:coverage(),audit:input});assert.equal(result.summary.seriesRecords,2);assert.equal(result.summary.completeVfnSeriesRecords,0);assert.equal(result.summary.rootsWithCompleteVfnSeries,0);
});
test('repeated completed series do not multiply unique root or variant counts',()=>{
  const input=audit([series()]);input.ledgers.push({path:'other-ledger.json',planVerified:true,series:[series()]});
  const result=evidenceOverview(design,{coverage:coverage(),audit:input});assert.equal(result.summary.completeVfnSeriesRecords,2);assert.equal(result.summary.variantsWithCompleteVfnSeries,1);assert.equal(result.summary.rootsWithCompleteVfnSeries,1);
});
test('unknown, relabelled, or falsely completed series are excluded visibly',()=>{
  const wrongRoot={...series(),root:'R0491'},wrongComplete={...series('B0001',['V']),completeVfn:true},wrongVerification=series();wrongVerification.arms[0].verified=false;
  const result=evidenceOverview(design,{coverage:coverage(),audit:audit([series('B9999'),wrongRoot,wrongComplete,wrongVerification])});
  assert.equal(result.summary.excludedSeries,4);assert.equal(result.summary.seriesRecords,0);assert.ok(result.issues.some(i=>i.code==='series_completion_mismatch'));
});
test('configuration mismatches and unverified plans cannot become complete series',()=>{
  const differentConfig=series();differentConfig.configurationHashes.push('b'.repeat(64));
  assert.equal(evidenceOverview(design,{coverage:coverage(),audit:audit([differentConfig])}).summary.completeVfnSeriesRecords,0);
  const input=audit([series()]);input.ledgers[0].planVerified=false;assert.equal(evidenceOverview(design,{coverage:coverage(),audit:input}).summary.excludedSeries,1);
});
test('conflicting outcomes stay visible instead of becoming fully accepted variants',()=>{
  const input=coverageInventory(design,[{path:'pass.json',data:{schema:'benchmark-acceptance-0.2',results:['V','F','N'].map(a=>cell('B0001',a))}},{path:'fail.json',data:{schema:'benchmark-acceptance-0.2',results:[cell('B0001','V',false)]}}]);
  const result=evidenceOverview(design,{coverage:input,audit:audit()});assert.equal(result.summary.variantsWithConflictingRecords,1);assert.equal(result.summary.variantsWithVfnRecords,0);assert.equal(result.roots[0].allVariantsHaveVfnRecords,false);
});
test('aggregate-only records remain separate from individual variants',()=>{
  const input=coverageInventory(design,[{path:'extended.json',data:{schema:'benchmark-extended-regression-0.1',summary:{reportedCells:168}}}]);
  const result=evidenceOverview(design,{coverage:input,audit:audit()});assert.equal(result.summary.aggregateAcceptanceReports,1);assert.equal(result.summary.variantsWithoutIndividualRecords,3);assert.equal(result.summary.rootsWithAnyVfnRecordVariant,0);
});
test('coverage rows require consistent IDs, unique arms, status, and evidence',()=>{
  for(const mutate of [c=>c.rows[0].root='R0491',c=>c.rows[0].passedArms=['V','V'],c=>c.rows[0].status='vfn_records',c=>{c.rows[0].passedArms=['V'];c.rows[0].status='partial_records';},c=>c.rows[1]=c.rows[0]]){
    const input=coverage();mutate(input);assert.throws(()=>evidenceOverview(design,{coverage:input,audit:audit()}),/Coverage|coverage/);
  }
});
test('metadata names cannot pollute objects or inject active Markdown',()=>{
  const input=structuredClone(design);input.roots[0].primary_family='__proto__';input.roots[0].title='![external](https://example.test/pixel)<script>x</script>';
  const result=evidenceOverview(input,{coverage:coverage(),audit:audit()}),markdown=overviewMarkdown(result);
  assert.equal(result.byPrimaryFamily.find(g=>g.id==='__proto__').roots,1);assert.equal(Object.getPrototypeOf(result.summary),Object.prototype);assert.ok(!markdown.includes('![external]'));assert.ok(!markdown.includes('<script>'));assert.match(markdown,/製品の優劣を示しません/);
});
test('duplicate roots and ledger paths are rejected',()=>{
  const input=structuredClone(design);input.roots.push(input.roots[0]);assert.throws(()=>evidenceOverview(input,{coverage:coverage(),audit:audit()}),/duplicate/);
  const records=audit();records.ledgers.push(records.ledgers[0]);assert.throws(()=>evidenceOverview(design,{coverage:coverage(),audit:records}),/duplicate/);
});
test('Docker report entry point generates an overview without changing acceptance records',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'benchmark-overview-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const designPath=join(dir,'design.json'),statusPath=join(dir,'status.json'),input={schema:'benchmark-acceptance-0.2',results:['V','F','N'].map(a=>cell('B0001',a)),summary:{cells:3}};
  await writeFile(designPath,JSON.stringify(design));await writeFile(statusPath,JSON.stringify({summary:{implemented_roots:2,implemented_positive_variants:3}}));await writeFile(join(dir,'acceptance.json'),JSON.stringify(input));
  const original=await readFile(join(dir,'acceptance.json'));
  await generateReports(dir,{statusPath,sourceDesign:designPath});
  const index=JSON.parse(await readFile(join(dir,'report-index.json'),'utf8')),overview=JSON.parse(await readFile(join(dir,'evidence-overview.json'),'utf8')),linkage=JSON.parse(await readFile(join(dir,'evidence-linkage.json'),'utf8')),html=await readFile(join(dir,'index.html'),'utf8');
  assert.equal(linkage.summary.withCompleteScan,0);assert.equal(linkage.summary.withoutCompleteScan,3);assert.match(html,/evidence-linkage.md/);
  assert.equal(index.evidenceOverview.summary.rootsWithAllVariantsVfnRecords,0);assert.equal(overview.summary.rootsWithAnyVfnRecordVariant,1);assert.equal(overview.summary.completeVfnSeriesRecords,0);assert.deepEqual(await readFile(join(dir,'acceptance.json')),original);assert.match(html,/評価資料の領域別一覧/);assert.match(html,/evidence-overview.md/);
});
