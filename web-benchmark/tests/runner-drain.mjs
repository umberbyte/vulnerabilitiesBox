import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingState} from '../src/runner/drain.mjs';

test('A closed response with a continuing handler is not settled',()=>{
  assert.equal(pendingState({activeRequests:0,openRequests:0,pendingHandlers:1}).settled,false);
});
test('Public traffic outside the measurement window blocks settlement',()=>{
  assert.equal(pendingState({activeRequests:0,openRequests:1,pendingHandlers:0}).settled,false);
});
test('Outstanding measured responses block settlement',()=>{
  assert.equal(pendingState({activeRequests:1,openRequests:0,pendingHandlers:0}).settled,false);
});
test('Only complete zero-valued lifecycle counters establish settlement',()=>{
  assert.deepEqual(pendingState({activeRequests:0,openRequests:0,pendingHandlers:0}),{activeRequests:0,openRequests:0,pendingHandlers:0,settled:true});
  assert.equal(pendingState({activeRequests:0}).settled,false);
  assert.equal(pendingState({activeRequests:0,openRequests:0,pendingHandlers:-1}).settled,false);
});
