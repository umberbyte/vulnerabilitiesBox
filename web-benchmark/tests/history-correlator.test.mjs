import test from 'node:test';
import assert from 'node:assert/strict';
import {correlateErrorCache} from '../src/runner/history-correlator.mjs';

function message(id,{url='https://app.example.test/news',header='',status=200,body='Normal news'}={}) {
  return {
    id:String(id),
    requestHeader:`GET ${url} HTTP/1.1\r\nhost: app.example.test\r\n${header?'X-News-Preview: '+header+'\r\n':''}\r\n`,
    responseHeader:`HTTP/1.1 ${status} Result\r\n\r\n`,
    responseBody:body
  };
}

test('correlates a reflected header error with a later headerless error',()=>{
  const history=[message(1),message(2,{header:'probe-1234',status:503,body:'Error: probe-1234'}),message(3,{status:503,body:'Error: probe-1234'})];
  assert.deepEqual(correlateErrorCache(history).map(({baselineMessageId,triggerMessageId,followupMessageId})=>[baselineMessageId,triggerMessageId,followupMessageId]),[['1','2','3']]);
});

test('does not correlate fixed behavior, unrelated URLs, or unreflected errors',()=>{
  assert.deepEqual(correlateErrorCache([message(1),message(2,{header:'probe-1234',status:503,body:'Error: probe-1234'}),message(3)]),[]);
  assert.deepEqual(correlateErrorCache([message(1),message(2,{header:'probe-1234',status:503,body:'Error: probe-1234'}),message(3,{url:'https://app.example.test/other',status:503,body:'Error: probe-1234'})]),[]);
  assert.deepEqual(correlateErrorCache([message(1),message(2,{header:'probe-1234',status:503,body:'Generic error'}),message(3,{status:503,body:'Generic error'})]),[]);
  assert.deepEqual(correlateErrorCache([message(1,{status:503,body:'Error: probe-1234'}),message(2,{header:'probe-1234',status:503,body:'Error: probe-1234'}),message(3,{status:503,body:'Error: probe-1234'})]),[]);
});
