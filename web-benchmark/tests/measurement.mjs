import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {RequestMeter} from '../src/measurement.mjs';

const arrive=(meter,path='/',method='GET')=>{const response=new EventEmitter();meter.middleware()({path,method},response,()=>{});return response;};
test('health excluded; every other arrival counted and finish/close counted once',()=>{
  const meter=new RequestMeter();meter.start('one','/w/test');
  const health=arrive(meter,'/health');health.emit('finish');
  const request=arrive(meter,'/login','POST');
  assert.equal(meter.snapshot().count,1);assert.equal(meter.busy,true);
  request.emit('finish');request.emit('close');
  assert.equal(meter.snapshot().activeRequests,0);assert.equal(meter.openRequests,0);
  assert.deepEqual(meter.snapshot().byMethod,{POST:1});
});
test('stop freezes arrivals while retaining live pending response state',()=>{
  const meter=new RequestMeter();meter.start('one','/w/test');const request=arrive(meter);
  meter.stop();assert.throws(()=>meter.start('two','/w/next'),/still running/);
  const later=arrive(meter);later.emit('finish');assert.equal(meter.snapshot().count,1);
  request.emit('finish');assert.equal(meter.snapshot().activeRequests,0);assert.equal(meter.busy,false);
  assert.equal(meter.start('two','/w/next').count,0);
});
test('new measurement cannot start over a request outside measurement',()=>{
  const meter=new RequestMeter();const request=arrive(meter);
  assert.throws(()=>meter.start('one','/w/test'),/still running/);request.emit('close');
  meter.start('one','/w/test');assert.throws(()=>meter.start('two','/w/test'),/already active/);
});
test('disconnected async handler blocks reset/start until processing completes',async()=>{
  const meter=new RequestMeter(),registered=[];
  const router={use:()=>{},get:(...args)=>registered.push(args.at(-1)),post:()=>{}};
  let release;const gate=new Promise(resolve=>{release=resolve;});
  meter.track(router).get('/work',async()=>{await gate;});
  meter.start('one','/w/test');const request=arrive(meter);
  const processing=registered[0]({},request,()=>{});request.emit('close');meter.stop();
  assert.equal(meter.openRequests,0);assert.equal(meter.pendingHandlers,1);assert.equal(meter.busy,true);
  assert.throws(()=>meter.start('two','/w/test'),/still running/);
  release();await processing;assert.equal(meter.busy,false);meter.start('two','/w/test');
});
test('handler errors release guards and preserve Express error handler signature',async()=>{
  const meter=new RequestMeter(),registered=[];
  const router={use:(...args)=>registered.push(args.at(-1)),get:()=>{},post:()=>{}};
  meter.track(router).use(async()=>{throw new Error('fixture');});
  await assert.rejects(registered[0]({},new EventEmitter(),()=>{}),/fixture/);
  assert.equal(meter.pendingHandlers,0);
  router.use((error,req,res,next)=>{throw error;});assert.equal(registered[1].length,4);
  assert.throws(()=>registered[1](new Error('parse'),{},{},()=>{}),/parse/);assert.equal(meter.pendingHandlers,0);
});
