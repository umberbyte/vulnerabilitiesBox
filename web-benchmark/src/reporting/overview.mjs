import {designCases} from './coverage.mjs';

const arms=['V','F','N'];
const armSet=value=>Array.isArray(value)&&value.length<=3&&new Set(value).size===value.length&&value.every(arm=>arms.includes(arm));
const string=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const ordered=map=>[...map.values()].sort((a,b)=>a.id.localeCompare(b.id));

export function evidenceOverview(design,{coverage,audit}){
  const cases=designCases(design);
  if(!Array.isArray(design.roots)||design.roots.length>1000)throw Error('Invalid design roots');
  const roots=new Map(),variants=new Map(),issues=[];
  for(const root of design.roots){
    if(!root||!/^R\d{4}$/.test(root.id)||roots.has(root.id)||!string(root.primary_family))throw Error('Invalid or duplicate design root');
    roots.set(root.id,{id:root.id,title:typeof root.title==='string'?root.title:root.id,family:root.primary_family,variants:[],seriesRecords:0,completeVfnSeriesRecords:0});
  }
  for(const item of cases.values()){
    const root=roots.get(item.root);
    if(!root||!string(item.track))throw Error('Invalid design relationship or track');
    const row={id:item.variant,root:item.root,title:item.title,track:item.track,family:root.family,passedArms:[],failedArms:[],status:'no_individual_record',seriesRecords:0,completeVfnSeriesRecords:0};
    variants.set(row.id,row);root.variants.push(row);
  }
  if([...roots.values()].some(root=>!root.variants.length))throw Error('Design root has no variants');
  if(coverage?.schema!=='benchmark-coverage-inventory-0.1'||!Array.isArray(coverage.rows)||coverage.rows.length!==variants.size||!Array.isArray(coverage.aggregateEvidence)||coverage.aggregateEvidence.length>1000)throw Error('Invalid coverage inventory');
  const seen=new Set();
  for(const record of coverage.rows){
    const row=variants.get(record?.variant);
    if(!row||row.root!==record.root||seen.has(row.id)||!armSet(record.passedArms)||!armSet(record.failedArms)||!Array.isArray(record.evidence)||record.evidence.length>10000)throw Error('Invalid coverage row');
    seen.add(row.id);
    for(const [label,passed]of [['passedArms',true],['failedArms',false]])for(const arm of record[label])if(!record.evidence.some(e=>e?.arm===arm&&e.passed===passed))throw Error('Coverage arm lacks evidence');
    row.passedArms=[...record.passedArms].sort();row.failedArms=[...record.failedArms].sort();
    row.status=row.failedArms.length?'mixed_or_failed_records':arms.every(arm=>row.passedArms.includes(arm))?'vfn_records':row.passedArms.length?'partial_records':'no_individual_record';
    if(record.status!==row.status)throw Error('Coverage status does not match arms');
  }
  if(audit?.schema!=='benchmark-artifact-audit-0.1'||!Array.isArray(audit.ledgers)||audit.ledgers.length>1000)throw Error('Invalid artifact audit');
  const series=[],ledgerPaths=new Set();let records=0;
  for(const ledger of audit.ledgers){
    if(!string(ledger?.path)||ledgerPaths.has(ledger.path)||!Array.isArray(ledger.series)||ledger.series.length>10000)throw Error('Invalid or duplicate audited ledger');
    ledgerPaths.add(ledger.path);
    for(const [index,record]of ledger.series.entries()){
      if(++records>10000)throw Error('Too many audited series');
      const variant=variants.get(record?.variant);
      const warn=code=>issues.push({code,path:ledger.path,seriesIndex:index});
      if(!variant||variant.root!==record.root){warn('unknown_or_relabelled_series');continue;}
      if(!Array.isArray(record.arms)||record.arms.length>3||record.arms.some(a=>!a||!arms.includes(a.arm)||typeof a.status!=='string'||typeof a.verified!=='boolean')||new Set(record.arms.map(a=>a.arm)).size!==record.arms.length||!Array.isArray(record.configurationHashes)||record.configurationHashes.length>3||record.configurationHashes.some(hash=>typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))){warn('invalid_series_metadata');continue;}
      const complete=ledger.planVerified===true&&record.arms.length===3&&record.arms.every(a=>a.status==='completed'&&a.verified)&&new Set(record.configurationHashes).size===1;
      if(typeof record.completeVfn!=='boolean'||record.completeVfn!==complete){warn('series_completion_mismatch');continue;}
      const root=roots.get(variant.root);
      variant.seriesRecords++;root.seriesRecords++;
      if(complete){variant.completeVfnSeriesRecords++;root.completeVfnSeriesRecords++;}
      series.push({path:ledger.path,seriesIndex:index,root:root.id,variant:variant.id,track:variant.track,completeVfn:complete,arms:record.arms.map(({arm,status,verified})=>({arm,status,verified}))});
    }
  }
  for(const root of roots.values()){
    root.variantCount=root.variants.length;
    root.vfnRecordVariants=root.variants.filter(v=>v.status==='vfn_records').length;
    root.partialRecordVariants=root.variants.filter(v=>v.status==='partial_records').length;
    root.noIndividualRecordVariants=root.variants.filter(v=>v.status==='no_individual_record').length;
    root.conflictingRecordVariants=root.variants.filter(v=>v.status==='mixed_or_failed_records').length;
    root.allVariantsHaveVfnRecords=root.vfnRecordVariants===root.variantCount;
  }
  function groups(field){
    const groups=new Map();
    for(const row of variants.values()){
      const id=row[field];if(!groups.has(id))groups.set(id,{id,roots:new Set(),variants:0,vfnRecordVariants:0,partialRecordVariants:0,noIndividualRecordVariants:0,conflictingRecordVariants:0,variantsWithCompleteVfnSeries:0,seriesRecords:0,completeVfnSeriesRecords:0});
      const group=groups.get(id);group.roots.add(row.root);group.variants++;
      group[{vfn_records:'vfnRecordVariants',partial_records:'partialRecordVariants',no_individual_record:'noIndividualRecordVariants',mixed_or_failed_records:'conflictingRecordVariants'}[row.status]]++;
      group.seriesRecords+=row.seriesRecords;group.completeVfnSeriesRecords+=row.completeVfnSeriesRecords;
      if(row.completeVfnSeriesRecords)group.variantsWithCompleteVfnSeries++;
    }
    return ordered(groups).map(group=>({...group,roots:group.roots.size}));
  }
  const rootRows=ordered(roots),variantRows=ordered(variants);
  return {schema:'benchmark-evidence-overview-0.1',generatedAt:new Date().toISOString(),summary:{roots:roots.size,variants:variants.size,rootsWithAnyVfnRecordVariant:rootRows.filter(r=>r.vfnRecordVariants>0).length,rootsWithAllVariantsVfnRecords:rootRows.filter(r=>r.allVariantsHaveVfnRecords).length,rootsWithoutIndividualRecords:rootRows.filter(r=>r.noIndividualRecordVariants===r.variantCount).length,variantsWithVfnRecords:variantRows.filter(v=>v.status==='vfn_records').length,variantsWithPartialRecords:variantRows.filter(v=>v.status==='partial_records').length,variantsWithoutIndividualRecords:variantRows.filter(v=>v.status==='no_individual_record').length,variantsWithConflictingRecords:variantRows.filter(v=>v.status==='mixed_or_failed_records').length,rootsWithCompleteVfnSeries:rootRows.filter(r=>r.completeVfnSeriesRecords>0).length,variantsWithCompleteVfnSeries:variantRows.filter(v=>v.completeVfnSeriesRecords>0).length,seriesRecords:series.length,completeVfnSeriesRecords:series.filter(s=>s.completeVfn).length,incompleteVfnSeriesRecords:series.filter(s=>!s.completeVfn).length,aggregateAcceptanceReports:coverage.aggregateEvidence.length,excludedSeries:issues.length},byTrack:groups('track'),byPrimaryFamily:groups('family'),roots:rootRows,series,issues,limitations:['Acceptance records and diagnostic completion metadata are separate evidence dimensions.','No test or scan is executed; no vulnerability finding, detection rate, or product equivalence is inferred.','One representative variant does not establish all variants of its root cause.','Records can come from different source versions, seeds or environments; current-source acceptance and review eligibility require separate verification.','Series records may represent repeats or settings; their number is not the number of distinct vulnerabilities or independent trials.','Family groups use the primary family of each root cause; roots can overlap between track groups.','Aggregate-only reports are not assigned to individual variants. Missing records do not prove a case is untested or defective.']};
}

const clean=value=>(['string','number','boolean'].includes(typeof value)?String(value):'—').replace(/[\\`*_[\]()#!<>|\r\n]/g,c=>'&#'+c.charCodeAt(0)+';');
export function overviewMarkdown(overview){
  const s=overview.summary;
  const groupTable=rows=>'| 領域 | 根本原因 | 変種 | 個別V/F/N記録 | 一部条件のみ | 個別記録未確認 | 相反・失敗 | 完走資料のある変種 | 系列記録（V/F/N完走） |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n'+rows.map(g=>`| ${clean(g.id)} | ${g.roots} | ${g.variants} | ${g.vfnRecordVariants} | ${g.partialRecordVariants} | ${g.noIndividualRecordVariants} | ${g.conflictingRecordVariants} | ${g.variantsWithCompleteVfnSeries} | ${g.seriesRecords}（${g.completeVfnSeriesRecords}） |`).join('\n');
  const rootRows=overview.roots.map(r=>`| ${r.id} | ${clean(r.title)} | ${clean(r.family)} | ${r.variantCount} | ${r.vfnRecordVariants} | ${r.partialRecordVariants} | ${r.noIndividualRecordVariants} | ${r.conflictingRecordVariants} | ${r.allVariantsHaveVfnRecords?'あり':'未確認'} | ${r.seriesRecords}（${r.completeVfnSeriesRecords}） |`).join('\n');
  return `# 評価資料の領域別一覧\n\n生成: ${overview.generatedAt}\n\n設計は${s.roots}根本原因・${s.variants}変種です。代表となる一部変種にV/F/N個別合格記録がある根本原因は${s.rootsWithAnyVfnRecordVariant}、全変種に個別V/F/N記録がある根本原因は${s.rootsWithAllVariantsVfnRecords}です。個別記録が根本原因内の全変種で未確認なのは${s.rootsWithoutIndividualRecords}根本原因です。\n\n成立確認資料と診断の終了資料は別々に数えます。V/F/Nの完走資料があるのは${s.rootsWithCompleteVfnSeries}根本原因・${s.variantsWithCompleteVfnSeries}変種、系列記録は${s.completeVfnSeriesRecords}/${s.seriesRecords}です。この数は脆弱性の検出数、誤検出率、現在のソースの成立確認、製品の優劣を示しません。\n\n## 比較領域\n\n${groupTable(overview.byTrack)}\n\n同じ根本原因が複数の比較領域に属する場合、根本原因の列を合計しません。native&#95;labは通常のWeb DASTと別の評価領域です。\n\n## 主分類\n\n${groupTable(overview.byPrimaryFamily)}\n\n主分類は根本原因ごとに一つで、別分類に属する同根の変種も、その根本原因の主分類へまとめます。\n\n## 根本原因ごとの資料\n\n| 根本原因 | 名称 | 主分類 | 変種数 | 個別V/F/N | 一部条件のみ | 個別記録未確認 | 相反・失敗 | 全変種のV/F/N記録 | 系列記録（V/F/N完走） |\n|---|---|---|---:|---:|---:|---:|---:|---|---:|\n${rootRows}\n\n集計しか残っていない成立確認資料は${s.aggregateAcceptanceReports}件です。個別行へ推測で配分しません。記録未確認は未実施や欠陥の証明ではありません。各記録のソース・seed・環境と、人間による証拠レビューは別途確認してください。系列記録の反復や設定比較を新しい脆弱性として数えません。除外した系列記録: ${s.excludedSeries}。詳細はevidence-overview.json、元の棚卸しはcoverage-inventory.jsonとartifact-audit.jsonを参照してください。\n`;
}
