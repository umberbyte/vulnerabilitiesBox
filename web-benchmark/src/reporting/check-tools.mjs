import {createHash} from 'node:crypto';
import {sourceSnapshot,compareSources} from './source.mjs';
import {unitTestFiles,runNode,tapSummary} from './tool-tests.mjs';
import {artifactReader,assertOutputFiles} from './files.mjs';
import {storeToolsCheck} from './history.mjs';
import {environmentSnapshot,environmentMarkdown} from './environment.mjs';

const source=await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'}),files=await unitTestFiles('.'),startedAt=new Date().toISOString();
if(!files.length)throw Error('No unit test files selected');
const environment=await environmentSnapshot();
await artifactReader('artifacts');await assertOutputFiles('artifacts',['tools-check.json','tools-check.md','tools-check.log']);
const result=await runNode(['--test','--test-concurrency=2','--test-reporter=tap',...files]);
const log=result.output+(result.error?'\nSTDERR\n'+result.error:'');
const report={schema:'benchmark-tools-check-0.1',startedAt,finishedAt:new Date().toISOString(),scope:'Offline unit tests of benchmark tooling and contracts; no application acceptance or scanner execution',runtime:{node:process.version,platform:process.platform,architecture:process.arch},environment,source,testFiles:files,exitCode:result.exitCode,stopReason:result.stopReason,log:'tools-check.log',logSha256:createHash('sha256').update(log).digest('hex'),status:'failed'};
try{
  report.summary=tapSummary(result.output);
  report.sourceAfter=compareSources(source,await sourceSnapshot('.',{designPath:'../benchmark-design-v2.json'}));
  if(result.exitCode===0&&!result.stopReason&&report.summary.passed===report.summary.tests&&report.sourceAfter.status==='matched')report.status='passed';
}catch(e){report.error=e.message;}
const stored=await storeToolsCheck('artifacts',report,log,`# 評価ツールの単体検証\n\n実行: ${report.startedAt} – ${report.finishedAt}\n\n結果: ${report.status}。${report.summary?report.summary.passed+'/'+report.summary.tests+' テスト、'+files.length+' ファイル':'集計未確定'}。\n\nアプリ、ZAP、外部サイトへの診断は行いません。500変種の成立確認や脆弱性の検出率を示すものではありません。src、tests、Dockerfile、.dockerignore、package manifests、Compose、起動スクリプト、設計JSONをファイル単位のSHA-256で記録しました。実行前後のソース一致: ${report.sourceAfter?.status??'未確認'}。\n\nソースSHA-256: ${source.sha256}\n\n詳細: tools-check.json、実行ログ: tools-check.log。再実行時もverification-historyに過去の結果を保持します。${environmentMarkdown(environment)}${report.stopReason?'停止理由: '+report.stopReason:''}\n`);
console.log(JSON.stringify({status:report.status,...report.summary,files:files.length,sourceSha256:source.sha256,archive:stored.archive}));
if(report.status!=='passed')process.exitCode=1;
