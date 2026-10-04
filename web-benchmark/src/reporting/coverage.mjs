import {artifactReader} from './files.mjs';
import {compareSources,compareRuntimeSourceProof} from './source.mjs';

export function designCases(design){
  if(!Array.isArray(design.variants)||design.variants.length>1000)throw Error('Invalid design variants');
  const cases=new Map();
  for(const v of design.variants){
    if(typeof v.id!=='string'||!/^B\d{4}$/.test(v.id)||typeof v.root_id!=='string'||!/^R\d{4}$/.test(v.root_id)||cases.has(v.id))throw Error('Invalid or duplicate design case');
    cases.set(v.id,{variant:v.id,root:v.root_id,title:typeof v.title==='string'?v.title:'',track:typeof v.comparison_track==='string'?v.comparison_track:'unknown'});
  }
  return cases;
}

// Capture only IDs and outcomes, never fixture secrets or raw attack output.
export function passedCells(output,cases){
  const cells=[],seen=new Set();
  for(const line of output.split(/\r?\n/)){
    let value;try{value=JSON.parse(line);}catch{continue;}
    if(!value||value.result!=='passed')continue;
    const item=cases.get(value.variant);
    if(!item||!['V','F','N'].includes(value.mode)||value.root!==undefined&&value.root!==item.root)throw Error('Invalid reported acceptance cell');
    const key=item.variant+':'+value.mode;if(seen.has(key))throw Error('Duplicate reported acceptance cell');seen.add(key);
    cells.push({root:item.root,variant:item.variant,mode:value.mode,passed:true});
  }
  return cells;
}

export function coverageInventory(design,reports){
  const cases=designCases(design),rows=[...cases.values()].sort((a,b)=>a.variant.localeCompare(b.variant)).map(item=>({...item,passedArms:[],failedArms:[],evidence:[]})),byVariant=new Map(rows.map(row=>[row.variant,row]));
  const issues=[],aggregateEvidence=[],sources=[];
  const warn=(source,code)=>issues.push({source,code});
  for(const {path,data}of reports){
    if(data.schema==='benchmark-extended-regression-0.1'){
      aggregateEvidence.push({path,scope:'file-level aggregate only; individual variant and arm evidence was not retained',summary:data.summary});continue;
    }
    const sourceRuntimeFiles=data.source?.files?Object.fromEntries(Object.entries(data.source.files).filter(([file])=>file==='package.json'||file==='package-lock.json'||file.startsWith('src/'))):null;
    if(['benchmark-acceptance-0.2','benchmark-extended-regression-0.2'].includes(data.schema)&&data.source){
      const stable=compareSources(data.source,data.source).status==='matched'&&data.sourceAfter?.status==='matched'&&data.sourceAfter.recordedSha256===data.source.sha256&&data.sourceAfter.currentSha256===data.source.sha256;
      if(!stable){warn(path,'source_snapshot_unstable_or_invalid');continue;}
    }
    if(data.targetRuntimeSource){
      const proof=data.targetRuntimeSource;
      const sameFiles=sourceRuntimeFiles&&JSON.stringify(Object.entries(sourceRuntimeFiles).sort())===JSON.stringify(Object.entries(proof.verifier?.files||{}).sort());
      if(!sameFiles||compareRuntimeSourceProof(proof.verifier,proof.targetBefore).status!=='matched'||compareRuntimeSourceProof(proof.targetBefore,proof.targetAfter).status!=='matched'){
        warn(path,'target_runtime_source_unmatched_or_invalid');continue;
      }
    }
    let cells,allowed=['V','F','N'];
    if(data.schema==='benchmark-acceptance-0.2')cells=data.results;
    else if(data.schema==='benchmark-docker-smoke-selected-0.1'){cells=data.results;allowed=['V','F'];}
    else if(data.schema==='benchmark-extended-regression-0.2'){
      if(!Array.isArray(data.results)){warn(path,'invalid_report');continue;}
      if(data.sourceAfter&&data.sourceAfter.status!=='matched'){warn(path,'source_changed_during_execution');continue;}
      cells=data.results.filter(r=>r.status==='passed').flatMap((r,index)=>Array.isArray(r.cellResults)?r.cellResults.map(cell=>({...cell,testFile:typeof r.file==='string'?r.file:String(index)})):[]);
    }else{warn(path,'unsupported_schema');continue;}
    if(!Array.isArray(cells)||cells.length>10000){warn(path,'invalid_cells');continue;}
    const accepted=[],seen=new Set();let invalid=false;
    for(const cell of cells){
      const item=cases.get(cell?.variant);
      const passed=typeof cell?.passed==='boolean'?cell.passed:cell?.status==='passed'?true:cell?.status==='failed'?false:null;
      if(!item||cell.root!==item.root||!allowed.includes(cell.mode)||passed===null||typeof cell.passed==='boolean'&&cell.status!==undefined&&cell.status!==(passed?'passed':'failed')){invalid=true;break;}
      const key=cell.variant+':'+cell.mode+(data.schema==='benchmark-extended-regression-0.2'?':'+cell.testFile:'');
      if(seen.has(key)){invalid=true;break;}seen.add(key);
      accepted.push({cell,item,passed});
    }
    if(invalid){warn(path,'invalid_or_duplicate_case');continue;}
    if(data.summary?.cells!==undefined&&data.summary.cells!==cells.length){warn(path,'summary_cell_count_mismatch');continue;}
    sources.push({path,startedAt:data.started||data.startedAt,cells:accepted.length,sourceSnapshotRecorded:Boolean(data.source),...(data.source?.sha256?{sourceSha256:data.source.sha256}:{}),...(sourceRuntimeFiles?{sourceRuntimeFiles}:{}),...(data.seed?{seed:data.seed}:{})});
    for(const {cell,passed}of accepted){
      const row=byVariant.get(cell.variant),arms=passed?row.passedArms:row.failedArms;
      if(!arms.includes(cell.mode))arms.push(cell.mode);
      row.evidence.push({path,arm:cell.mode,passed,...(typeof cell.testFile==='string'?{testFile:cell.testFile}: {})});
    }
  }
  for(const row of rows){row.passedArms.sort();row.failedArms.sort();row.hasVfnRecords=['V','F','N'].every(arm=>row.passedArms.includes(arm));row.status=row.failedArms.length?'mixed_or_failed_records':row.hasVfnRecords?'vfn_records':row.passedArms.length?'partial_records':'no_individual_record';}
  const passed=rows.reduce((n,r)=>n+r.passedArms.length,0),vfn=rows.filter(r=>r.status==='vfn_records').length,partial=rows.filter(r=>r.status==='partial_records').length;
  return {schema:'benchmark-coverage-inventory-0.1',generatedAt:new Date().toISOString(),summary:{designRoots:new Set(rows.map(r=>r.root)).size,designVariants:rows.length,requiredVariantArmCells:rows.length*3,uniquePassedVariantArmRecords:passed,variantsWithVfnRecords:vfn,variantsWithPartialRecords:partial,variantsWithoutIndividualRecords:rows.filter(r=>r.status==='no_individual_record').length,variantsWithConflictingOrFailedRecords:rows.filter(r=>r.status==='mixed_or_failed_records').length,aggregateReports:aggregateEvidence.length,issues:issues.length},sources,aggregateEvidence,rows,issues,limitations:['Inventory of stored acceptance records, not current-source acceptance or scanner detection.','Presence of all three arms does not establish identical seeds, source, hardware, or protocol unless separately recorded and verified.','Repeated records are deduplicated by variant and arm; variants do not become independent root-cause scoring units.','File-level aggregates without individual cells are retained separately and never distributed to variant rows.','Missing individual evidence is not proof that a case is untested or defective.']};
}

export async function collectCoverage(directory,design){
  const reader=await artifactReader(directory),reports=[],unreadable=[];
  const saved=(await reader.entries()).filter(entry=>entry.isFile()&&/^(?:acceptance-saved|extended-regression-(?:saved|source-link))-[A-Za-z0-9-]+\.json$/.test(entry.name)).map(entry=>entry.name).sort();
  if(saved.length>100)throw Error('Too many saved extended-regression reports');
  for(const path of ['acceptance.json','extended-regression.json',...saved,'docker-smoke-selected-run.json']){
    try{reports.push({path,data:await reader.json(path)});}catch(e){if(e.code!=='ENOENT')unreadable.push({source:path,code:'unreadable_report'});}
  }
  const inventory=coverageInventory(design,reports);inventory.issues.push(...unreadable);inventory.summary.issues=inventory.issues.length;return inventory;
}

export function coverageMarkdown(inventory){
  const text=value=>String(value??'—').replace(/[|\r\n]/g,' ');
  const labels={vfn_records:'V/F/Nの個別合格記録あり',partial_records:'一部条件の合格記録あり',no_individual_record:'個別記録未確認',mixed_or_failed_records:'失敗・相反する記録あり'};
  const s=inventory.summary,rows=inventory.rows.map(r=>`| ${r.variant} | ${r.root} | ${text(r.title)} | ${text(r.track)} | ${labels[r.status]} | ${r.passedArms.join('/')} |`).join('\n');
  return `# 500変種の成立確認資料の棚卸し\n\n生成: ${inventory.generatedAt}\n\nこれは保存された個別の実行記録の索引であり、現在のソースの成立確認や診断ツールの検出率ではありません。V/F/Nの記録が揃う場合も、同じseed・ソース・環境であるかは別途確認します。個別記録がない場合、未実施や欠陥があるとは判断しません。\n\n設計: ${s.designRoots}根本原因／${s.designVariants}変種。個別のV/F/N合格記録が揃う変種: ${s.variantsWithVfnRecords}。一部条件だけの合格記録: ${s.variantsWithPartialRecords}。個別記録未確認: ${s.variantsWithoutIndividualRecords}。重複を除いた変種・条件の合格記録: ${s.uniquePassedVariantArmRecords}。\n\nファイル単位の集計しか残っていない資料は${s.aggregateReports}件あり、その件数を個別行へ割り振りません。詳細はcoverage-inventory.jsonのaggregateEvidenceとissuesを参照してください。\n\n| 変種 | 根本原因 | 名称 | 比較領域 | 記録の状態 | 合格条件 |\n|---|---|---|---|---|---|\n${rows}\n\n同根の変種を別々の脆弱性として採点しません。native_labは通常のWeb DAST検出率へ混ぜません。\n`;
}
