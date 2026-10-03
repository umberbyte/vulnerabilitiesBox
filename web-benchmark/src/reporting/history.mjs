import {mkdir,lstat,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {artifactReader,assertOutputFiles} from './files.mjs';
import {auditVerification} from './verification.mjs';
import {readRegressionArchive} from './regression-archive.mjs';
import {compareSources} from './source.mjs';

async function historyRoot(directory,{create=false}={}){
  const reader=await artifactReader(directory),root=join(reader.root,'verification-history');
  if(create)await mkdir(root,{recursive:true});
  try{const info=await lstat(root);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Invalid verification history directory');}catch(e){if(e.code==='ENOENT'&&!create)return null;throw e;}
  return root;
}

export async function storeToolsCheck(directory,report,log,markdown){
  if(report?.schema!=='benchmark-tools-check-0.1'||typeof report.finishedAt!=='string'||!Number.isFinite(Date.parse(report.finishedAt))||typeof log!=='string'||typeof markdown!=='string')throw Error('Invalid tools check archive');
  const root=await historyRoot(directory,{create:true});
  await assertOutputFiles(directory,['tools-check.json','tools-check.log','tools-check.md']);
  const id='tools-'+new Date(report.finishedAt).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
  const archive=join(root,id);
  await mkdir(archive); // Exclusive unique run directory; never reuse a prior run.
  const stored={...report,archive:'verification-history/'+id};
  const outputs={'tools-check.log':log,'tools-check.json':JSON.stringify(stored,null,2)+'\n','tools-check.md':markdown};
  for(const [name,content] of Object.entries(outputs))await writeFile(join(archive,name),content,{flag:'wx'});
  // The complete archive exists before updating the familiar latest filenames.
  for(const [name,content] of Object.entries(outputs))await writeFile(join(directory,name),content);
  return stored;
}

export async function collectVerificationHistory(directory,{currentSource=null}={}){
  const root=await historyRoot(directory),runs=[],warnings=[];
  if(!root)return {runs,warnings};
  const entries=(await readdir(root,{withFileTypes:true})).sort((a,b)=>b.name.localeCompare(a.name));
  if(entries.length>1000)throw Error('Too many verification history entries (maximum 1000)');
  for(const entry of entries){
    const kind=/^tools-\d{4}-\d\d-\d\dT[\d-]+Z-[0-9a-f-]{36}$/.test(entry.name)?'tools':/^regression-[a-f0-9]{64}$/.test(entry.name)?'regression':null;
    if(!kind||entry.isSymbolicLink()||!entry.isDirectory()){warnings.push({path:'verification-history/'+entry.name,reason:'invalid_history_entry'});continue;}
    const path='verification-history/'+entry.name;
    try{
      const reader=await artifactReader(join(root,entry.name));
      if(kind==='regression'){
        const {manifest,report,evidence,issues}=await readRegressionArchive(join(root,entry.name));
        if(manifest.archive!==path)throw Error('inconsistent_archive_reference');
        runs.push({kind,path:path+'/full-regression.json',markdown:await reader.exists('full-regression.md')?path+'/full-regression.md':null,manifest:path+'/archive-manifest.json',startedAt:report.startedAt,status:report.summary?.complete===true?'passed':report.summary?.failed>0?'failed':'incomplete',summary:report.summary,sourceSha256:report.source?.sha256,sourceComparison:currentSource?compareSources(report.source,currentSource):{status:report.source?'unavailable':'unrecorded'},originalReportSha256:manifest.originalReportSha256,evidence,issues});
        continue;
      }
      const report=await reader.json('tools-check.json');
      if(report?.schema!=='benchmark-tools-check-0.1'||report.archive!==path)throw Error('inconsistent_archive_reference');
      const audit=await auditVerification(join(root,entry.name));
      runs.push({kind,path:path+'/tools-check.json',markdown:await reader.exists('tools-check.md')?path+'/tools-check.md':null,startedAt:report.startedAt,status:report.status,summary:report.summary,sourceSha256:report.source?.sha256,sourceComparison:currentSource?compareSources(report.source,currentSource):{status:report.source?'unavailable':'unrecorded'},evidence:audit.records.find(r=>r.kind==='tools'),issues:audit.issues});
    }catch{warnings.push({path,reason:'unreadable_history_record'});}
  }
  const revisions=new Map();
  for(const run of runs)if(run.originalReportSha256)revisions.set(run.originalReportSha256,(revisions.get(run.originalReportSha256)||0)+1);
  for(const run of runs)if(run.originalReportSha256)run.savedVersions=revisions.get(run.originalReportSha256);
  const startedAt=run=>typeof run.startedAt==='string'&&Number.isFinite(Date.parse(run.startedAt))?Date.parse(run.startedAt):0;
  runs.sort((a,b)=>startedAt(b)-startedAt(a)||a.path.localeCompare(b.path));
  return {runs,warnings};
}

export function historyMarkdown(history){
  const text=value=>(['string','number','boolean'].includes(typeof value)?String(value):'—').replace(/[\\`*_[\]()#!<>|\r\n]/g,c=>'&#'+c.charCodeAt(0)+';');
  const state={passed:'合格',failed:'失敗',incomplete:'未完了'};
  const evidence={verified:'ログ・集計一致',inconsistent:'不整合',incomplete:'証拠不足'};
  const source={matched:'現在のソースと一致',changed:'ソース変更あり',unrecorded:'ソース記録なし',invalid:'ソース記録不正',unavailable:'現在のソース未比較'};
  const link=path=>'[JSON]('+path.split('/').map(encodeURIComponent).join('/')+')';
  const rows=history.runs.map(r=>`| ${text(r.startedAt)} | ${r.kind==='regression'?'統合回帰':'評価ツール'} | ${text(state[r.status]??r.status)} | ${text(r.summary?.passed)} / ${text(r.kind==='regression'?r.summary?.stages:r.summary?.tests)} ${r.kind==='regression'?'段階':'テスト'} | ${text(evidence[r.evidence?.evidenceStatus])} | ${text(source[r.sourceComparison?.status])} | ${link(r.path)} |`).join('\n');
  const issues=history.runs.flatMap(r=>(r.issues??[]).map(i=>`| ${text(i.level)} | ${text(i.code)} | ${text(i.path)} | ${link(r.path)} |`)).concat(history.warnings.map(w=>`| warning | ${text(w.reason)} | ${text(w.path)} | — |`)).join('\n');
  return `# 検証履歴\n\n保存された単体検証と統合回帰の資料を照合した索引です。検証や診断は実行しません。ソースの一致は保存した範囲だけに適用し、500変種の成立確認や診断の検出率を示しません。\n\n| 開始時刻 | 種類 | 保存された状態 | 合格数 | 資料の整合性 | ソース | 詳細 |\n|---|---|---|---|---|---|---|\n${rows||'| — | — | 記録なし | — | — | — | — |'}\n\n## 指摘\n\n| 種別 | 理由 | ファイル | 実行記録 |\n|---|---|---|---|\n${issues||'| — | 指摘なし | — | — |'}\n\n統合回帰は元のJSON・ログ・Markdownをそのまま保存します。内容が変われば別の保存版となり、保存版の数を実行回数として数えません。原資料のMarkdown本文は機械判定の根拠に使いません。ソース記録のない結果に現在のハッシュを後付けしません。履歴のハッシュは保存資料の整合性であり、署名による真正性の証明ではありません。\n`;
}
