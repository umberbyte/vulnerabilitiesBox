import {createHash} from 'node:crypto';
import {artifactReader} from './files.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const declaredPath=(path,type)=>{
  if(typeof path!=='string'||!path.startsWith('artifacts/'))throw Error('invalid_reference_path');
  const rel=path.slice('artifacts/'.length);
  if(type==='plan'&&!/^[^/\\]+\.json$/.test(rel))throw Error('invalid_reference_path');
  if(type==='run'&&!/^zap-[^/\\]+\/run\.json$/.test(rel))throw Error('invalid_reference_path');
  return rel;
};
const selected=cell=>Object.fromEntries(['cellId','root','variant','arm','seed','replicate','expectedWorkspace','condition'].map(key=>[key,cell[key]]));
const metadataFields=['status','profile','requests','scannerConfigurationSha256'];

// An offline evidence audit. Passing it establishes metadata consistency only.
export async function auditArtifacts(directory){
  const reader=await artifactReader(directory),entries=await reader.entries(),issues=[],ledgers=[],references=new Map(),cache=new Map();
  let errorCount=0;
  const issue=(level,code,path,cellId)=>{if(level==='error')errorCount++;issues.push({level,code,path,...(typeof cellId==='string'?{cellId}: {})});};
  async function document(path){if(!cache.has(path)){const bytes=await reader.read(path);cache.set(path,{sha256:hash(bytes),value:JSON.parse(bytes.toString('utf8'))});}return cache.get(path);}
  for(const entry of entries){
    if(!entry.isFile()||!entry.name.endsWith('ledger.json'))continue;
    const path=entry.name;
    let ledger;
    try{ledger=(await document(path)).value;if(ledger.schema!=='benchmark-operator-panel-ledger-0.1')continue;if(!Array.isArray(ledger.cells)||ledger.cells.length>10000)throw Error('invalid_cells');}
    catch{issue('error','unreadable_ledger',path);continue;}
    const before=issues.length,result={path,status:ledger.status,planVerified:false,referencedRuns:0,verifiedRuns:0,series:[]},series=new Map();
    let planCells;
    try{
      const plan=await document(declaredPath(ledger.plan?.path,'plan'));
      if(plan.sha256!==ledger.plan?.sha256)throw Error('plan_hash_mismatch');
      if(plan.value.schema!=='benchmark-operator-panel-0.1'||plan.value.planId!==ledger.plan?.planId||!Array.isArray(plan.value.cells))throw Error('plan_metadata_mismatch');
      planCells=new Map(plan.value.cells.map(cell=>[cell.cellId,cell]));
      if(planCells.size!==plan.value.cells.length||plan.value.cells.length!==ledger.cells.length)throw Error('plan_cell_count_mismatch');
      result.planVerified=true;
    }catch(error){issue('error',['plan_hash_mismatch','plan_metadata_mismatch','plan_cell_count_mismatch'].includes(error.message)?error.message:'plan_unavailable',path);}
    const ids=new Set(),paths=new Set();
    for(const cell of ledger.cells){
      const errorsBefore=errorCount;
      if(!cell||typeof cell!=='object'){issue('error','invalid_cell',path);continue;}
      if(typeof cell.cellId!=='string'||typeof cell.root!=='string'||!/^R\d{4}$/.test(cell.root)||typeof cell.variant!=='string'||!/^B\d{4}$/.test(cell.variant)||typeof cell.seed!=='string'||typeof cell.arm!=='string'||typeof cell.status!=='string'||!Number.isSafeInteger(cell.replicate)||cell.replicate<1||!['baseline','active','active-low'].includes(cell.condition?.profile)||!['anonymous','session','bearer'].includes(cell.condition?.authMode)){issue('error','invalid_cell_labels',path);continue;}
      if(ids.has(cell.cellId))issue('error','duplicate_cell_id',path,cell.cellId);ids.add(cell.cellId);
      if(planCells&&!same(selected(cell),selected(planCells.get(cell.cellId)||{})))issue('error','cell_plan_mismatch',path,cell.cellId);
      const seriesKey=JSON.stringify(canonical({root:cell.root,variant:cell.variant,seed:cell.seed,replicate:cell.replicate,condition:cell.condition}));
      if(!series.has(seriesKey))series.set(seriesKey,{root:cell.root,variant:cell.variant,seed:cell.seed,replicate:cell.replicate,profile:cell.condition?.profile,authMode:cell.condition?.authMode,arms:[],configurationHashes:[],completeVfn:false});
      const group=series.get(seriesKey),arm={arm:cell.arm,status:cell.status,verified:false};group.arms.push(arm);
      if(!['V','F','N'].includes(cell.arm))issue('error','invalid_arm',path,cell.cellId);
      if(cell.run){
        result.referencedRuns++;
        try{
          const runPath=declaredPath(cell.run.path,'run');
          if(paths.has(runPath))issue('error','duplicate_run_in_ledger',path,cell.cellId);paths.add(runPath);
          references.set(runPath,(references.get(runPath)||0)+1);
          const run=await document(runPath),value=run.value;
          if(run.sha256!==cell.run.sha256)throw Error('run_hash_mismatch');
          if(value.schema!=='benchmark-scanner-run-0.2'||value.runId!==cell.run.runId||value.status!==cell.run.status)throw Error('run_metadata_mismatch');
          if(cell.status!==value.status)throw Error('cell_run_status_mismatch');
          const workspace=value.measurement?.workspace||value.workspace;
          if(workspace&&workspace!==cell.expectedWorkspace)throw Error('workspace_mismatch');
          if(value.status==='completed'&&!workspace)throw Error('missing_workspace');
          if(value.status==='completed'){
            if(value.trafficSettled!==true||value.errors?.length!==0)throw Error('incomplete_completed_run');
            if(!/^[a-f0-9]{64}$/.test(value.scannerConfigurationSha256||''))throw Error('missing_configuration_hash');
            if(value.profile!==cell.condition?.authMode+'-'+cell.condition?.profile)throw Error('profile_mismatch');
            const expected={wallSeconds:cell.condition?.wallSeconds,requestedHttpRequests:cell.condition?.requestedHttpRequests,requestedConcurrency:cell.condition?.requestedConcurrency};
            for(const[k,v]of Object.entries(expected))if(value.budgets?.[k]!==v)throw Error('budget_mismatch');
            const summary={status:value.status,profile:value.profile,requests:value.measurement?.count,scannerConfigurationSha256:value.scannerConfigurationSha256};
            for(const key of metadataFields)if(cell.run.summary?.[key]!==undefined&&cell.run.summary[key]!==summary[key])throw Error('run_summary_mismatch');
            group.configurationHashes.push(value.scannerConfigurationSha256);
          }
          arm.verified=result.planVerified&&errorCount===errorsBefore;
          if(arm.verified)result.verifiedRuns++;
        }catch(error){issue('error',/^(run_hash_mismatch|run_metadata_mismatch|cell_run_status_mismatch|workspace_mismatch|missing_workspace|incomplete_completed_run|missing_configuration_hash|profile_mismatch|budget_mismatch|run_summary_mismatch)$/.test(error.message)?error.message:'run_unavailable',path,cell.cellId);}
      }else if(cell.status==='completed')issue('error','completed_cell_without_run',path,cell.cellId);
    }
    for(const group of series.values()){
      const configs=new Set(group.configurationHashes);
      group.configurationHashes=[...configs];
      group.completeVfn=group.arms.length===3&&new Set(group.arms.map(a=>a.arm)).size===3&&group.arms.every(a=>['V','F','N'].includes(a.arm)&&a.status==='completed'&&a.verified)&&configs.size===1;
      if(configs.size>1)issue('warning','configuration_changed_within_series',path);
      if(!group.completeVfn)issue('info','incomplete_vfn_series',path);
      result.series.push(group);
    }
    if(['running','starting'].includes(ledger.status))issue('info','unfinished_ledger_record',path);
    result.errors=issues.slice(before).filter(i=>i.level==='error').length;
    ledgers.push(result);
  }
  const orphanRuns=[];
  for(const entry of entries){if(entry.isDirectory()&&entry.name.startsWith('zap-')&&!references.has(entry.name+'/run.json'))orphanRuns.push(entry.name+'/run.json');}
  const reusedRuns=[...references].filter(([,count])=>count>1).map(([path,count])=>({path,references:count}));
  const groups=ledgers.flatMap(l=>l.series);
  return {schema:'benchmark-artifact-audit-0.1',generatedAt:new Date().toISOString(),summary:{ledgers:ledgers.length,verifiedPlans:ledgers.filter(l=>l.planVerified).length,referencedCells:ledgers.reduce((n,l)=>n+l.referencedRuns,0),verifiedCells:ledgers.reduce((n,l)=>n+l.verifiedRuns,0),series:groups.length,completeVfnSeries:groups.filter(g=>g.completeVfn).length,incompleteVfnSeries:groups.filter(g=>!g.completeVfn).length,errors:issues.filter(i=>i.level==='error').length,warnings:issues.filter(i=>i.level==='warning').length,orphanRuns:orphanRuns.length,reusedRuns:reusedRuns.length},ledgers,issues,orphanRuns,reusedRuns,limitations:['No scan, exploit, browser execution, vulnerability scoring, or source-result freshness verification.','Complete V/F/N means metadata-matched finished runs, not proof of reachability or detection.','Hashes check agreement with stored ledgers; no external signature or immutable trust anchor is provided.','Unreferenced runs may be deliberate standalone experiments and are not automatically invalid.']};
}

export function auditMarkdown(audit){
  const text=value=>String(value??'—').replace(/[|\r\n]/g,' ');
  const rows=audit.ledgers.map(l=>`| ${text(l.path)} | ${l.planVerified?'一致':'未確認'} | ${l.verifiedRuns}/${l.referencedRuns} | ${l.series.filter(s=>s.completeVfn).length}/${l.series.length} | ${l.errors} |`).join('\n');
  const issues=audit.issues.map(i=>`| ${text(i.level)} | ${text(i.code)} | ${text(i.path)} | ${text(i.cellId)} |`).join('\n');
  const unfinished=audit.ledgers.flatMap(l=>l.series.filter(s=>!s.completeVfn).map(s=>`| ${text(s.root)} / ${text(s.variant)} | ${text(s.seed)} / ${text(s.replicate)} | ${text(s.profile)} / ${text(s.authMode)} | ${s.arms.map(a=>text(a.arm)+': '+text(a.status)+(a.verified?'':'（参照未確認）')).join('、')} | ${text(l.path)} |`)).join('\n');
  return `# 保存資料の整合性監査\n\n生成: ${audit.generatedAt}\n\n診断や採点は行わず、保存された計画と台帳、実行JSONのハッシュ・条件・状態を照合しています。V/F/Nが揃っていても、到達や検出の成功を示しません。未参照の実行は単独試験である可能性があり、自動的に無効とは判定しません。\n\n| 台帳 | 計画ハッシュ | 参照確認 | V/F/N完走系列 | エラー |\n|---|---|---:|---:|---:|\n${rows}\n\n## 未完了の比較系列\n\n同じ根本原因の反復や設定比較も別系列であり、行数を脆弱性の件数として数えません。\n\n| ケース | seed / 反復 | 設定 / 認証 | 条件ごとの状態 | 台帳 |\n|---|---|---|---|---|\n${unfinished||'| — | — | — | 未完了系列なし | — |'}\n\n## 指摘\n\n| 重要度 | 理由 | 台帳 | セル |\n|---|---|---|---|\n${issues||'| — | 指摘なし | — | — |'}\n\n未参照の実行: ${audit.orphanRuns.map(text).join('、')||'なし'}。\n\n機械向けの詳細はartifact-audit.jsonを参照してください。ハッシュの一致は保存資料どうしの整合性であり、外部署名や現在のソースとの一致を保証しません。\n`;
}
