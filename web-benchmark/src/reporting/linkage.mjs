const validId=(value,prefix)=>typeof value==='string'&&new RegExp(`^${prefix}\\d{4}$`).test(value);
const text=value=>String(value??'').replace(/[|\r\n]/g,' ');

// A completed scan and an acceptance record are separate observations. Match
// their recorded runtime files only when the entire V/F/N series has one proof.
export function evidenceLinkage(coverage,audit){
  if(coverage?.schema!=='benchmark-coverage-inventory-0.1'||!Array.isArray(coverage.rows)||coverage.rows.length>1000||audit?.schema!=='benchmark-artifact-audit-0.1'||!Array.isArray(audit.ledgers)||audit.ledgers.length>1000)throw Error('Invalid linkage inputs');
  const rows=new Map(),acceptanceEvidence=new Map();
  for(const record of coverage.rows){
    if(!validId(record?.variant,'B')||!validId(record.root,'R')||rows.has(record.variant)||!Array.isArray(record.evidence)||record.evidence.length>10000)throw Error('Invalid coverage row');
    rows.set(record.variant,{variant:record.variant,root:record.root,title:record.title,track:record.track,acceptanceStatus:record.status,individualVfnRecord:record.status==='vfn_records',completeScanSeries:[]});
    acceptanceEvidence.set(record.variant,record.evidence);
  }
  const issues=[];
  for(const ledger of audit.ledgers){
    if(!Array.isArray(ledger.series)||ledger.series.length>10000)throw Error('Invalid audited series');
    for(const [index,series] of ledger.series.entries()){
      if(series.completeVfn!==true)continue;
      const row=rows.get(series.variant);
      if(ledger.planVerified!==true||!row||row.root!==series.root){issues.push({path:ledger.path,seriesIndex:index,code:'unlinked_or_unverified_series'});continue;}
      row.completeScanSeries.push({ledger:ledger.path,seed:series.seed,replicate:series.replicate,profile:series.profile,authMode:series.authMode,runtimeSourceSha256:series.runtimeSourceSha256||null});
    }
  }
  const variants=[...rows.values()].sort((a,b)=>a.variant.localeCompare(b.variant));
  const sourceReports=new Map((coverage.sources||[]).filter(source=>typeof source.path==='string'&&source.sourceRuntimeFiles&&typeof source.sourceRuntimeFiles==='object').map(source=>[source.path,source]));
  const sameFiles=(accepted,scanned)=>{
    if(!accepted||!scanned||typeof accepted!=='object'||typeof scanned!=='object')return false;
    const a=Object.keys(accepted).sort(),b=Object.keys(scanned).sort();
    return a.length===b.length&&a.length>=3&&a.every((path,index)=>path===b[index]&&accepted[path]===scanned[path]);
  };
  for(const row of variants){
    row.state=row.completeScanSeries.length===0?'no_complete_scan':row.individualVfnRecord?'source_link_unavailable':'individual_vfn_missing';
    if(row.state!=='source_link_unavailable')continue;
    const evidence=acceptanceEvidence.get(row.variant),paths=[...new Set(evidence.filter(item=>item.passed===true&&typeof item.path==='string').map(item=>item.path))];
    for(const series of row.completeScanSeries){
      const proof=audit.runtimeSources?.[series.runtimeSourceSha256];
      if(!proof)continue;
      for(const path of paths){
        const accepted=sourceReports.get(path);
        if(!accepted||!['V','F','N'].every(arm=>evidence.some(item=>item.path===path&&item.arm===arm&&item.passed===true)))continue;
        if(!sameFiles(accepted.sourceRuntimeFiles,proof.files))continue;
        row.state='runtime_source_linked_environment_unverified';
        row.sourceLink={acceptanceReport:path,scanLedger:series.ledger,runtimeSourceSha256:series.runtimeSourceSha256,files:Object.keys(proof.files).length};
        break;
      }
      if(row.sourceLink)break;
    }
  }
  const count=state=>variants.filter(row=>row.state===state).length;
  return {schema:'benchmark-evidence-linkage-0.1',generatedAt:new Date().toISOString(),summary:{variants:variants.length,withCompleteScan:variants.length-count('no_complete_scan'),withoutCompleteScan:count('no_complete_scan'),completeScanWithoutIndividualVfn:count('individual_vfn_missing'),completeScanWithIndividualVfnButSourceUnlinked:count('source_link_unavailable'),verifiedSourceLinked:count('runtime_source_linked_environment_unverified'),dependencyEnvironmentLinked:0,issues:issues.length},variants,issues,limitations:['Only scan series in audited operator ledgers are included; standalone scans without a ledger are outside this inventory.','A completed V/F/N scan series is not a finding or a validated target-specific probe.','Historical individual V/F/N records may lack a stable source snapshot; most audited scan series predate target runtime source proofs.','Runtime source agreement covers src/ and package manifests only; dependency services, container images, seeds and state are not linked.','No scan, acceptance test, TP/FP/FN classification, or product comparison is performed.']};
}

export function linkageMarkdown(linkage){
  const s=linkage.summary;
  const rows=linkage.variants.filter(row=>row.completeScanSeries.length).sort((a,b)=>a.state.localeCompare(b.state)||a.variant.localeCompare(b.variant)).map(row=>`| ${row.variant} | ${row.root} | ${text(row.title)} | ${text(row.track)} | ${row.completeScanSeries.length} | ${row.individualVfnRecord?'あり':'不足'} | ${row.state==='individual_vfn_missing'?'個別成立記録を確認':row.sourceLink?'実行ソース一致・依存環境とアラートを確認':'ソース・環境の対応付けを確認'} |`).join('\n');
  return `# 成立確認とZAP走査の証拠対応表\n\n生成: ${linkage.generatedAt}\n\n保存資料の対応を整理したもので、脆弱性の成立、ZAPの検出、見逃し、検出率を示しません。\n\n設計${s.variants}変種のうち、監査済み台帳にV/F/N完走系列がある変種は${s.withCompleteScan}。そのうち個別のV/F/N成立記録が不足するのは${s.completeScanWithoutIndividualVfn}、個別記録はあるものの走査時ソースとの一致を確認できないのは${s.completeScanWithIndividualVfnButSourceUnlinked}です。実行ソース一致を検証できた変種は${s.verifiedSourceLinked}で、依存サービスの環境一致まで確認できたものは${s.dependencyEnvironmentLinked}。台帳に完走系列がないのは${s.withoutCompleteScan}変種です。台帳のない単独走査はこの表に含めません。\n\n旧資料にはソース指紋が欠けるものがあります。実行ソースが一致しても、seed、DB・Redis・Mongo・LDAP・executorの状態やimageまで同じとはみなしません。以下の系列数は反復や設定違いを含み、独立した脆弱性の数ではありません。\n\n| 変種 | 根本原因 | 名称 | 比較領域 | 完走系列 | 個別V/F/N記録 | 次の確認 |\n|---|---|---|---|---:|---|---|\n${rows}\n\n台帳に完走系列のない変種と各系列のseed・設定・台帳は[evidence-linkage.json](evidence-linkage.json)を参照してください。除外した系列: ${s.issues}。\n`;
}
