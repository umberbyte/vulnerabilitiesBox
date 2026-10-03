import {createHash} from 'node:crypto';
import {artifactReader} from './files.mjs';
import {compareSources} from './source.mjs';
import {tapSummary} from './tool-tests.mjs';
import {validEnvironment} from './environment.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const names=['unit','representative-acceptance','extended-variants','selected-smoke'];
const summaryKeys={unit:['tests','passed','failed'], 'representative-acceptance':['cells','passed','failed','checks'], 'extended-variants':['files','passed','failed','reportedCells'], 'selected-smoke':['cells','passed','failed']};

// Read evidence only. A verified log is not a vulnerability verdict or a claim
// about the current source, container images, or the truth of the stored run.
export async function auditVerification(directory){
  const reader=await artifactReader(directory,{maxBytes:8*1024*1024}),records=[],issues=[];
  async function record(path,kind){
    const result={path,kind,recordedStatus:null,evidenceStatus:'incomplete',logs:[],sourceStatus:'unrecorded',environmentStatus:'unrecorded'};
    const start=issues.length;
    const issue=(level,code,reference=path)=>issues.push({level,code,path:reference,record:path});
    let data;
    try{data=await reader.json(path);}catch(e){issue('error',e.code==='ENOENT'?'missing_record':'unreadable_record');return finish();}
    const schema=kind==='tools'?'benchmark-tools-check-0.1':'benchmark-full-regression-0.1';
    if(!data||data.schema!==schema){issue('error','unsupported_schema');return finish();}
    result.recordedStatus=kind==='tools'?data.status:data.summary?.complete===true?'complete':'incomplete';
    const started=typeof data.startedAt==='string'?Date.parse(data.startedAt):NaN,finished=typeof data.finishedAt==='string'?Date.parse(data.finishedAt):NaN;
    if(!Number.isFinite(started)||!Number.isFinite(finished)||finished<started)issue('error','invalid_execution_dates');
    if(data.environment!=null){
      const captured=Date.parse(data.environment.capturedAt);
      if(!validEnvironment(data.environment)||!Number.isFinite(started)||!Number.isFinite(finished)||captured<started||captured>finished){result.environmentStatus='invalid';issue('error','invalid_environment_snapshot');}
      else result.environmentStatus='recorded';
    }else issue('info','environment_unrecorded');
    if(data.source){
      result.sourceStatus=compareSources(data.source,data.source).status==='matched'?'recorded':'invalid';
      if(result.sourceStatus==='invalid')issue('error','invalid_source_snapshot');
      const after=data.sourceAfter;
      if(!after)issue('warning','source_after_unrecorded');
      else if(result.sourceStatus!=='invalid'&&after.status==='matched'&&after.recordedSha256===data.source.sha256&&after.currentSha256===data.source.sha256&&Array.isArray(after.changes)&&after.changes.length===0)result.sourceStatus='stable_record';
      else if(after.status==='changed'&&after.recordedSha256===data.source.sha256&&digest(after.currentSha256)&&Array.isArray(after.changes)&&after.changes.length>0){result.sourceStatus='changed_during_execution';if(result.recordedStatus==='passed'||result.recordedStatus==='complete')issue('error','passed_with_source_change');}
      else issue('error','inconsistent_source_after');
    }else issue('info','source_unrecorded');
    async function log(reference,expected,hash){
      const entry={path:expected,hashVerified:false,summaryVerified:false};result.logs.push(entry);
      if(reference!==expected){issue('error','unexpected_log_reference');return null;}
      let bytes;
      try{bytes=await reader.read(expected);}catch{issue('error','unreadable_log',expected);return null;}
      if(!digest(hash))issue('error','invalid_log_hash',expected);
      else if(sha(bytes)!==hash)issue('error','log_hash_mismatch',expected);
      else entry.hashVerified=true;
      return {entry,text:bytes.toString('utf8')};
    }
    function summary(summary,keys,reference){
      if(!summary||keys.some(key=>!integer(summary[key]))){issue('error','invalid_summary',reference);return false;}
      return true;
    }
    function unit(text,saved,entry,keys){
      try{
        const actual=tapSummary(text.split('\nSTDERR\n')[0]);
        if(!summary(saved,keys,entry.path))return;
        if(keys.some(key=>saved[key]!==actual[key]))issue('error','log_summary_mismatch',entry.path);
        else entry.summaryVerified=true;
      }catch{issue('error','invalid_tap_summary',entry.path);}
    }
    if(kind==='tools'){
      if(!['passed','failed'].includes(data.status))issue('error','invalid_status');
      if(!Array.isArray(data.testFiles)||data.testFiles.length===0||data.testFiles.length>1000||new Set(data.testFiles).size!==data.testFiles.length||data.testFiles.some(p=>typeof p!=='string'||!/^tests\/[\w.-]+\.mjs$/.test(p)||!data.source?.files||!Object.hasOwn(data.source.files,p)))issue('error','invalid_test_files');
      if(data.status==='passed'&&(data.exitCode!==0||data.stopReason!=null||data.error!=null||!data.source||result.sourceStatus!=='stable_record'))issue('error','inconsistent_passed_status');
      const read=await log(data.log,'tools-check.log',data.logSha256);
      if(read)unit(read.text,data.summary,read.entry,['tests','passed','failed','skipped','cancelled']);
      if(data.status==='passed'&&(!data.summary||data.summary.tests!==data.summary.passed||data.summary.failed!==0||data.summary.skipped!==0||data.summary.cancelled!==0))issue('error','passed_with_nonpassing_tests');
    }else{
      if(!Array.isArray(data.stages)||data.stages.length>names.length){issue('error','invalid_stages');return finish();}
      const seen=new Set();
      for(const stage of data.stages){
        if(!stage||!names.includes(stage.name)||seen.has(stage.name)){issue('error','invalid_stage');continue;}
        seen.add(stage.name);
        if(!['passed','failed'].includes(stage.status)||!integer(stage.durationMs)||stage.status==='passed'&&stage.exitCode!==0)issue('error','inconsistent_stage_status');
        // The older full harness stores an artifacts/ prefix; allow exactly
        // that known prefix, never a caller-supplied path outside this root.
        const expected=`full-regression-logs/${stage.name}.log`;
        const read=await log(stage.log==='artifacts/'+expected?expected:stage.log,expected,stage.logSha256);
        if(read){
          const keys=summaryKeys[stage.name];
          if(stage.name==='unit')unit(read.text,stage.summary,read.entry,keys);
          else if(summary(stage.summary,keys,read.entry.path)){
            const lines=read.text.split('\nSTDERR\n')[0].trim().split(/\r?\n/);let actual;
            try{actual=JSON.parse(lines.at(-1));}catch{issue('error','missing_log_summary',read.entry.path);}
            if(actual){if(keys.some(key=>actual[key]!==stage.summary[key]))issue('error','log_summary_mismatch',read.entry.path);else read.entry.summaryVerified=true;}
          }
        }
        if(stage.status==='passed'&&stage.summary){const total=stage.name==='unit'?'tests':stage.name==='extended-variants'?'files':'cells';if(stage.summary[total]<1||stage.summary.passed!==stage.summary[total]||stage.summary.failed!==0)issue('error','passed_with_nonpassing_tests');}
      }
      if(!summary(data.summary,['stages','passed','failed'],path)||data.summary.stages!==data.stages.length||data.summary.passed!==data.stages.filter(s=>s?.status==='passed').length||data.summary.failed!==data.stages.filter(s=>s?.status==='failed').length)issue('error','stage_count_mismatch');
      if(data.summary?.complete===true&&(seen.size!==names.length||data.summary.passed!==names.length||data.summary.failed!==0||data.error!=null))issue('error','inconsistent_complete_status');
    }
    return finish();
    function finish(){
      result.errors=issues.slice(start).filter(i=>i.level==='error').length;
      result.warnings=issues.slice(start).filter(i=>i.level==='warning').length;
      result.evidenceStatus=result.errors?'inconsistent':result.logs.length&&result.logs.every(l=>l.hashVerified&&l.summaryVerified)?'verified':'incomplete';
      records.push(result);return result;
    }
  }
  const entries=await reader.entries();
  for(const [path,kind] of [['tools-check.json','tools'],['full-regression.json','regression']])if(entries.some(entry=>entry.name===path))await record(path,kind);
  return {schema:'benchmark-verification-audit-0.1',generatedAt:new Date().toISOString(),summary:{records:records.length,verified:records.filter(r=>r.evidenceStatus==='verified').length,inconsistent:records.filter(r=>r.evidenceStatus==='inconsistent').length,incomplete:records.filter(r=>r.evidenceStatus==='incomplete').length,logs:records.reduce((n,r)=>n+r.logs.length,0),verifiedLogs:records.reduce((n,r)=>n+r.logs.filter(l=>l.hashVerified&&l.summaryVerified).length,0),errors:issues.filter(i=>i.level==='error').length,warnings:issues.filter(i=>i.level==='warning').length},records,issues,limitations:['Stored log hashes and summaries only; no tests or scans are run.','Source stability is a recorded declaration, not independent capture of both executions.','No signature, actual Docker image identity, dependency availability, current-source validity, or detection accuracy is established.']};
}

export function verificationMarkdown(audit){
  const clean=v=>String(v??'—').replace(/[|\r\n]/g,' ');
  const labels={verified:'ログ・集計一致',inconsistent:'不整合',incomplete:'証拠不足',stable_record:'実行前後一致の記録',recorded:'ソース記録あり',unrecorded:'ソース記録なし',invalid:'ソース記録不正',changed_during_execution:'実行中にソース変更'};
  return `# 検証結果の整合性監査\n\n生成: ${audit.generatedAt}\n\n保存済みの検証JSONとログのSHA-256、集計、終了状態、ソース記録を照合しました。検証や診断は実行しません。過去結果のソース記録がない場合は、その不足を残します。\n\n| 記録 | 保存された状態 | 証拠の整合性 | ログ確認 | ソース |\n|---|---|---|---|---|\n${audit.records.map(r=>`| ${clean(r.path)} | ${clean(r.recordedStatus)} | ${labels[r.evidenceStatus]} | ${r.logs.filter(l=>l.hashVerified&&l.summaryVerified).length}/${r.logs.length} | ${labels[r.sourceStatus]} |`).join('\n')||'| — | — | 記録なし | — | — |'}\n\n## 指摘\n\n| 種別 | 理由 | ファイル |\n|---|---|---|\n${audit.issues.map(i=>`| ${clean(i.level)} | ${clean(i.code)} | ${clean(i.path)} |`).join('\n')||'| — | 指摘なし | — |'}\n\nハッシュは資料どうしの一致を確認するもので、真正性の証明ではありません。ソース一致は記録上の宣言です。実際のDockerイメージ、ホスト資源、検証対象外の処理、500変種の成立、診断の検出率は保証しません。詳細: verification-audit.json。\n`;
}
