import {readFile,readdir,lstat,realpath,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,sep,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const limit=4*1024*1024;
const escape=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const href=path=>path.split('/').map(encodeURIComponent).join('/');
const labels={completed:'完走',budget_stopped:'上限で停止',failed:'失敗',halted:'中断',running:'実行中の記録',starting:'開始中の記録',not_run:'未実行',passed:'合格'};
const label=value=>labels[value]||String(value??'未記録');
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const date=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',hour12:false})+' JST':'未記録';
const link=(path,title)=>path?`<a href="${escape(href(path))}" target="_blank" rel="noopener noreferrer">${escape(title)}</a>`:'なし';

export async function collectReports(directory,{sourceSummary={},generatedAt=new Date().toISOString()}={}) {
  await mkdir(directory,{recursive:true});
  const root=await realpath(directory),warnings=[];
  async function file(path){
    const full=resolve(root,path),rel=relative(root,full);
    if(rel==='..'||rel.startsWith('..'+sep)||rel===''||resolve(full)===root)throw Error('invalid_path');
    // Reject symlinks in every component; an artifact cannot redirect reads outside its directory.
    let current=root;
    for(const part of rel.split(sep)){
      current=join(current,part);
      const stat=await lstat(current);
      if(stat.isSymbolicLink())throw Error('symlink');
    }
    const stat=await lstat(full);
    if(!stat.isFile())throw Error('not_file');
    if(stat.size>limit)throw Error('oversized');
    return full;
  }
  async function json(path){return JSON.parse(await readFile(await file(path),'utf8'));}
  async function exists(path){try{await file(path);return path;}catch{return null;}}
  const entries=(await readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  if(entries.length>5000)throw Error('Too many artifact entries (maximum 5000)');
  const runs=[],ledgers=[],notes=[];
  let regression=null;
  for(const entry of entries){
    if(entry.isSymbolicLink())continue;
    if(entry.isFile()&&entry.name.startsWith('zap-')&&entry.name.endsWith('.md')&&await exists(entry.name))notes.push(entry.name);
    const path=entry.isDirectory()&&entry.name.startsWith('zap-')?entry.name+'/run.json':entry.isFile()&&entry.name.endsWith('ledger.json')?entry.name:entry.name==='full-regression.json'?entry.name:null;
    if(!path)continue;
    try{
      const data=await json(path);
      if(data.schema==='benchmark-scanner-run-0.2'){
        runs.push({id:String(data.runId??entry.name),path,startedAt:data.startedAt,status:data.status,profile:data.profile,tool:data.tool,toolVersion:data.toolVersion,requests:count(data.measurement?.count),trafficSettled:data.measurement?.settled??data.trafficSettled??null,identityVerified:data.authReachability?.identityVerified===true,report:await exists(entry.name+'/zap-report.html')});
      }else if(data.schema==='benchmark-operator-panel-ledger-0.1'){
        if(!Array.isArray(data.cells)||data.cells.length>10000)throw Error('invalid_cells');
        const states=Object.create(null);
        for(const cell of data.cells){const state=String(cell.status??'unknown');states[state]=(states[state]||0)+1;}
        ledgers.push({path,status:data.status,startedAt:data.startedAt,total:data.cells.length,states,roots:[...new Set(data.cells.map(cell=>String(cell.root??'?')))].sort(),arms:[...new Set(data.cells.map(cell=>String(cell.arm??'?')))].sort()});
      }else if(path==='full-regression.json'&&data.schema==='benchmark-full-regression-0.1'){
        if(!Array.isArray(data.stages))throw Error('invalid_stages');
        regression={path,startedAt:data.startedAt,finishedAt:data.finishedAt,complete:data.summary?.complete===true,scope:data.scope,stages:data.stages.map(stage=>({name:stage.name,status:stage.status,summary:stage.summary}))};
      }else warnings.push({path,reason:'unsupported_schema'});
    }catch(error){warnings.push({path,reason:error.code==='ENOENT'?'missing_file':error instanceof SyntaxError?'invalid_json':error.message});}
  }
  const newest=(a,b)=>(Date.parse(b.startedAt)||0)-(Date.parse(a.startedAt)||0)||a.path.localeCompare(b.path);
  runs.sort(newest);ledgers.sort(newest);
  const states=Object.create(null);for(const run of runs)states[String(run.status??'unknown')]=(states[String(run.status??'unknown')]||0)+1;
  return {schema:'benchmark-report-index-0.1',generatedAt,source:{roots:count(sourceSummary.implemented_roots),variants:count(sourceSummary.implemented_positive_variants)},summary:{runs:runs.length,ledgers:ledgers.length,runStates:states,warnings:warnings.length},regression,runs,ledgers,notes,warnings,limitations:['Stored results only; this command does not run a scan or test.','Completion is taken from metadata, not inferred from alerts or browser execution.','No TP/FP/FN, detection rate, or remedial success is computed.','Past results do not prove the current source passes.','A running ledger is a stored state, not evidence of a currently running process.']};
}

export function renderReports(index){
  const table=(headers,rows)=>`<div class="scroll"><table><thead><tr>${headers.map(h=>'<th>'+escape(h)+'</th>').join('')}</tr></thead><tbody>${rows.length?rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join(''):`<tr><td colspan="${headers.length}">記録なし</td></tr>`}</tbody></table></div>`;
  const regression=index.regression;
  const tests=regression?`<p>保存された実行: ${escape(date(regression.startedAt))}。${regression.complete?'全段階の終了記録あり':'未完了または失敗の記録'}。${link(regression.path,'結果JSON')}</p>`+table(['検証','状態','保存された集計'],regression.stages.map(s=>[escape(s.name),escape(label(s.status)),escape(JSON.stringify(s.summary??{}))])):'<p>統合回帰の結果はまだありません。verify.cmd または sh verify.sh で生成できます。</p>';
  const runRows=index.runs.map(r=>[escape(date(r.startedAt)),escape(r.id),escape(label(r.status)),escape(r.profile),escape([r.tool,r.toolVersion].filter(Boolean).join(' ')),escape(r.requests),link(r.report,'ZAP HTML')+' / '+link(r.path,'実行JSON')]);
  const ledgerRows=index.ledgers.map(l=>[escape(date(l.startedAt)),link(l.path,l.path),escape(label(l.status)),escape(l.roots.join(', ')),escape(l.arms.join('/')),escape(l.total),escape(Object.entries(l.states).map(([k,v])=>label(k)+': '+v).join('、'))]);
  const warnings=index.warnings.length?'<section><h2>読み取りできなかった記録</h2>'+table(['ファイル','理由'],index.warnings.map(w=>[escape(w.path),escape(w.reason)]))+'</section>':'';
  const reviews='<section><h2>検出漏れ・改善のレビュー記録</h2>'+table(['記録'],index.notes.map(path=>[link(path,path)]))+'</section>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>ベンチマーク結果一覧</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#f4f6fa;color:#18243a}main{max-width:1500px;margin:auto;padding:32px}h1{font-size:28px}h2{font-size:21px}section{background:white;padding:24px;margin:22px 0;border-radius:12px;border:1px solid #dbe2eb}p{line-height:1.8}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #dbe2eb;padding:12px;overflow-wrap:anywhere}th{background:#eef2f7}a{color:#175bbb}.note{color:#4b5b70}.metrics{display:flex;gap:14px;flex-wrap:wrap}.metrics div{padding:16px 22px;background:#eaf0fa;border-radius:8px}.metrics strong{display:block;font-size:24px}</style></head><body><main><h1>ベンチマーク結果一覧</h1><p class="note">生成: ${escape(date(index.generatedAt))}。保存済みの結果を一覧化しています。</p><div class="metrics"><div>ソースの根本原因<strong>${escape(index.source.roots)}</strong></div><div>ソースの変種<strong>${escape(index.source.variants)}</strong></div><div>保存された診断実行<strong>${escape(index.summary.runs)}</strong></div><div>実験台帳<strong>${escape(index.summary.ledgers)}</strong></div></div><section><h2>読み方</h2><p>完走は診断処理の終了を示します。脆弱性の検出や対策の成功は、通信証拠とV/F/Nのレビューで判定します。上限停止・未対応・失敗を見逃しとして集計しません。ここでは検出率を算出しません。</p><p>「実行中の記録」は台帳に保存された状態です。現在動いているプロセスの確認ではありません。過去の回帰結果も、現在のソース全体の合格を保証しません。</p></section><section><h2>統合回帰</h2>${tests}<p class="note">検証範囲は保存されたJSONのscopeを確認してください。500変種すべての成立確認と製品比較は別の評価です。</p></section><section><h2>実験台帳</h2>${table(['開始時刻','台帳','状態','根本原因','条件','セル数','内訳'],ledgerRows)}</section>${reviews}<section><h2>ZAP生成レポート</h2>${table(['開始時刻','実行ID','状態','設定系列','製品','公開通信数','資料'],runRows)}</section>${warnings}<p class="note">この一覧はローカルの管理者用資料です。診断ツールへ正解情報として渡さないでください。${link('report-index.json','一覧JSON')}</p></main></body></html>\n`;
}

export async function generateReports(directory,{statusPath='implementation-status.json'}={}){
  const status=JSON.parse(await readFile(statusPath,'utf8'));
  const index=await collectReports(directory,{sourceSummary:status.summary});
  // Never follow a pre-existing output symlink.
  for(const name of ['report-index.json','index.html']){
    const path=join(directory,name);
    try{const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Invalid output file');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await writeFile(join(directory,'report-index.json'),JSON.stringify(index,null,2)+'\n');
  await writeFile(join(directory,'index.html'),renderReports(index));
  return index.summary;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{if(process.argv.length>2)throw Error('No arguments accepted; use the local artifacts directory');console.log(JSON.stringify(await generateReports('artifacts')));}catch(e){console.error(e.message);process.exitCode=1;}
}
