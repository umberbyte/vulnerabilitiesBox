import test from 'node:test';
import assert from 'node:assert/strict';
import {captureRemainingMessages} from '../src/runner/history-pages.mjs';

const page=ids=>({messages:ids.map(id=>({id:String(id)}))});

test('archives pages after the legacy first page and marks a short final page complete',async()=>{
  const complete=await captureRemainingMessages(page([0,1]),async(start,count)=>{assert.deepEqual([start,count],[2,2]);return page([2]);},{pageSize:2,maxMessages:6});
  assert.deepEqual(complete.remaining,page([2]).messages);
  assert.equal(complete.savedCount,3);
  assert.equal(complete.complete,true);
});

test('an exact cap is complete only after an empty boundary probe',async()=>{
  const calls=[];
  const complete=await captureRemainingMessages(page([0,1]),async(start,count)=>{calls.push([start,count]);return start===2?page([2,3]):page([]);},{pageSize:2,maxMessages:4});
  assert.deepEqual(calls,[[2,2],[4,1]]);
  assert.equal(complete.complete,true);
  const truncated=await captureRemainingMessages(page([0,1]),async(start)=>start===2?page([2,3]):page([4]),{pageSize:2,maxMessages:4});
  assert.equal(truncated.complete,false);
  assert.equal(truncated.savedCount,4);
});

test('a later page failure retains partial evidence without declaring completeness',async()=>{
  const result=await captureRemainingMessages(page([0,1]),async(start)=>{if(start===2)return page([2,3]);throw Error('page unavailable');},{pageSize:2,maxMessages:6});
  assert.deepEqual(result.remaining,page([2,3]).messages);
  assert.equal(result.savedCount,4);
  assert.equal(result.complete,false);
  assert.equal(result.error,'page unavailable');
});

test('a short first page needs no further API request',async()=>{
  const result=await captureRemainingMessages(page([0]),async()=>{throw Error('unexpected fetch');},{pageSize:2,maxMessages:4});
  assert.equal(result.complete,true);
  assert.equal(result.savedCount,1);
});
