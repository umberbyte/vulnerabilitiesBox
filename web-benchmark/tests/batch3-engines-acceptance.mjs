import {definitions} from '../src/cases/batch3-engines.mjs';
import {boundary,blockedInSafeModes} from './batch3-engines-fixtures.mjs';

if(definitions.length!==Object.keys(boundary).length||definitions.some(item=>!Object.hasOwn(boundary,item.root)))throw new Error('Engine acceptance coverage is incomplete');

export const checks=Object.fromEntries(definitions.map(item=>[item.root,async t=>{
 await t.login();
 const normal=await t.post(item.entry,item.requests[1][2]);
 t.check(normal.status()===200,'Documented normal engine request succeeds');
 t.check(!(await normal.text()).includes(t.c),'Normal request does not reveal the private marker');
 const input={operation:'boundary',...boundary[item.root]};
 if(item.root==='R0170')input.url='http://public.fixture.test:'+(await t.oracle()).caseState.enginesBatch.ports.private+'/';
 const response=await t.post(item.entry,input);
 t.check(response.status()===(t.v?200:blockedInSafeModes.has(item.root)?403:200),'Engine boundary has the expected HTTP status');
 t.check((await response.text()).includes(t.c)===t.v,'Only V reveals the marker through the real engine path');
 const state=(await t.oracle()).caseState.enginesBatch;
 t.check(state.records.length>=2,'Normal and boundary operations are recorded');
}]));
