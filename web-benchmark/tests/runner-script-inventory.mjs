import test from 'node:test';
import assert from 'node:assert/strict';
import {hasEnabledBenchmarkScanScript} from '../src/runner/script-inventory.mjs';

test('authentication sender remains enabled in default authenticated scans',()=>{
  assert.equal(hasEnabledBenchmarkScanScript([{name:'benchmark-auth-missing-headers',enabled:'true'}]),false);
});

test('active benchmark rule still blocks default scan mode',()=>{
  assert.equal(hasEnabledBenchmarkScanScript([{name:'benchmark-auth-missing-headers',enabled:'true'},{name:'benchmark-sql-grammar',enabled:'true'}]),true);
  assert.equal(hasEnabledBenchmarkScanScript([{name:'benchmark-sql-grammar',enabled:'false'}]),false);
});
