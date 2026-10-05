import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {cases} from '../src/catalog.mjs';
import {createPanel,parsePanelArgs,savePanel,validatePanel} from '../src/runner/panel.mjs';

const createdAt='2026-10-02T00:00:00.000Z';
const catalog=[
  {root:'R0103',variant:'B0103',title:'Third',feature:'third',family:'fixture'},
  {root:'R0101',variant:'B0101',title:'First',feature:'first',family:'fixture'},
  {root:'R0102',variant:'B0102',title:'Second',feature:'second',family:'fixture'}
];
const make=(options={})=>createPanel({roots:['R0101'],seeds:['seed-a'],...options},{catalog,createdAt});
const workspace=(root,seed)=>'/w/'+createHash('sha256').update(seed+root).digest('hex').slice(0,12);
const identity=cell=>[cell.root,cell.arm,cell.seed,cell.replicate,cell.condition.profile,cell.condition.authMode];
const uniqueRoots=panel=>[...new Set(panel.cells.map(cell=>cell.root))];

test('Default panel covers V/F/N without claiming any scan or diagnosis was run',()=>{
  const panel=make();
  assert.equal(panel.createdAt,createdAt);
  assert.equal(panel.cells.length,3);
  assert.deepEqual(panel.cells.map(cell=>cell.arm),['V','F','N']);
  for(const cell of panel.cells) {
    assert.equal(cell.root,'R0101');assert.equal(cell.variant,'B0101');
    assert.equal(cell.seed,'seed-a');assert.equal(cell.replicate,1);
    assert.equal(cell.expectedWorkspace,workspace('R0101','seed-a'));
    assert.deepEqual(cell.condition,{profile:'baseline',authMode:'anonymous',subject:null,wallSeconds:30,requestedHttpRequests:100,requestedConcurrency:2});
    assert.equal(cell.status,'not_run');assert.equal(cell.run,null);
    assert.equal(typeof cell.cellId,'string');assert.ok(cell.cellId.length>0);
  }
  assert.equal(new Set(panel.cells.map(cell=>cell.cellId)).size,3);
});

test('The faster local condition is explicit and does not change old plan identities',()=>{
  const standard=make();const fast=make({concurrency:4});
  assert.equal(standard.selection.requestedConcurrency,2);
  assert.equal(fast.selection.requestedConcurrency,4);
  assert.ok(fast.cells.every(cell=>cell.condition.requestedConcurrency===4));
  assert.notEqual(fast.planId,standard.planId);
  assert.deepEqual(validatePanel(fast,{catalog}),fast);
  assert.equal(parsePanelArgs(['generate','plans/fast.json','--roots','R0001','--seeds','fast','--concurrency','4']).options.concurrency,4);
  assert.throws(()=>make({concurrency:3}));
});

test('Roots and seeds must be supplied explicitly',()=>{
  for(const options of [undefined,null,{},[],{roots:['R0101']},{seeds:['seed-a']},{roots:'all'}]) {
    assert.throws(()=>createPanel(options,{catalog,createdAt}));
  }
});

test('Panel expands every selected condition once in the documented order',()=>{
  const panel=make({roots:['R0103','R0101'],seeds:['seed-z','seed-a'],arms:['N','V','F'],replicates:2,profiles:['active','baseline'],auth:['bearer','session','anonymous']});
  const expected=[];
  for(const root of ['R0101','R0103'])for(const arm of ['V','F','N'])for(const seed of ['seed-a','seed-z'])for(const replicate of [1,2])for(const profile of ['baseline','active'])for(const authMode of ['anonymous','session','bearer'])expected.push([root,arm,seed,replicate,profile,authMode]);
  assert.equal(panel.cells.length,144);
  assert.deepEqual(panel.cells.map(identity),expected);
  assert.equal(new Set(panel.cells.map(cell=>cell.cellId)).size,144);
  assert.ok(panel.cells.every(cell=>cell.variant==='B'+cell.root.slice(1)));
});

test('Equivalent selections give stable cell identities with an injected creation time',()=>{
  const options={roots:['R0101','R0103'],seeds:['seed-a','seed-z'],arms:['V','F','N'],replicates:2,profiles:['baseline','active'],auth:['anonymous','session','bearer']};
  const first=make(options);const repeated=make(options);
  const reordered=make({...options,roots:[...options.roots].reverse(),seeds:[...options.seeds].reverse(),arms:[...options.arms].reverse(),profiles:[...options.profiles].reverse(),auth:[...options.auth].reverse()});
  assert.deepEqual(first,repeated);
  assert.deepEqual(first.cells,reordered.cells);
});

test('active-low extends explicit selections while frozen baseline/active plans and identities remain valid',()=>{
  const single=[catalog.find(row=>row.root==='R0101')];
  const old=createPanel({roots:['R0101'],seeds:['seed-a'],profiles:['baseline','active']},{catalog:single,createdAt});
  assert.equal(old.planId,'panel-a1ec7f9b2161179aac6d1522dd2d938533d243c6d2fddfd7802141cdbdbae48e');
  assert.equal(old.cells[0].cellId,'cell-307027972a387a43c986915ea63084fdf31e178e25a8a614666c89faeceee870');
  assert.equal(old.cells[1].cellId,'cell-361a712214a9ccd3c7514555d44d6fe5e298f5d593596c303b199e983957a3bf');
  assert.deepEqual(validatePanel(old,{catalog}),old);
  const expanded=createPanel({roots:['R0101'],seeds:['seed-a'],profiles:['active-low','active','baseline']},{catalog:single,createdAt});
  assert.equal(expanded.cells.length,9);assert.deepEqual(expanded.selection.profiles,['baseline','active','active-low']);
  assert.deepEqual(expanded.cells.filter(cell=>cell.condition.profile!=='active-low'),old.cells);
  assert.equal(new Set(expanded.cells.map(cell=>cell.expectedWorkspace)).size,1);
  assert.deepEqual(validatePanel(expanded,{catalog}),expanded);
  const parsed=parsePanelArgs(['generate','plans/low.json','--roots','R0001','--seeds','paired','--profiles','baseline,active-low']);
  assert.deepEqual(parsed.options.profiles,['baseline','active-low']);
});

test('Workspace derives only from root and seed, remaining paired across arms and repetitions',()=>{
  const panel=make({roots:['R0101','R0103'],seeds:['seed-a','seed-z'],replicates:3,profiles:['baseline','active'],auth:['anonymous','session','bearer']});
  const grouped=new Map();
  for(const cell of panel.cells) {
    assert.equal(cell.expectedWorkspace,workspace(cell.root,cell.seed));
    assert.match(cell.expectedWorkspace,/^\/w\/[a-f0-9]{12}$/);
    const key=JSON.stringify([cell.root,cell.seed]);
    if(!grouped.has(key))grouped.set(key,new Set());
    grouped.get(key).add(cell.expectedWorkspace);
  }
  assert.equal(grouped.size,4);
  assert.ok([...grouped.values()].every(values=>values.size===1));
  assert.equal(new Set(panel.cells.map(cell=>cell.expectedWorkspace)).size,4);
});

test('Anonymous conditions have no subject; authenticated conditions use the selected fixture subject',()=>{
  for(const user of ['alice','bob','carol','approver','admin']) {
    const panel=make({user,arms:['V'],auth:['anonymous','session','bearer']});
    assert.deepEqual(panel.cells.map(cell=>cell.condition.subject),[null,user,user]);
  }
  const defaults=make({arms:['V'],auth:['session','bearer']});
  assert.ok(defaults.cells.every(cell=>cell.condition.subject==='alice'));
});

test('All follows the supplied implemented catalog and picks up additional roots',()=>{
  const original=createPanel({roots:'all',seeds:['seed-a']},{catalog,createdAt});
  assert.deepEqual(uniqueRoots(original),['R0101','R0102','R0103']);
  assert.equal(original.cells.length,catalog.length*3);
  const extended=[...catalog,{root:'R0104',variant:'B0104',title:'Fourth',feature:'fourth',family:'fixture'}];
  const expanded=createPanel({roots:'all',seeds:['seed-a']},{catalog:extended,createdAt});
  assert.deepEqual(uniqueRoots(expanded),['R0101','R0102','R0103','R0104']);
  assert.equal(expanded.cells.filter(cell=>cell.root==='R0104').length,3);
});

test('Default all selection uses only the current application catalog',()=>{
  const panel=createPanel({roots:'all',seeds:['seed-a']},{createdAt});
  assert.deepEqual(uniqueRoots(panel),cases.map(item=>item.root).sort());
  assert.equal(panel.cells.length,cases.length*3);
  for(const cell of panel.cells)assert.equal(cell.variant,cases.find(item=>item.root===cell.root).variant);
});

test('Panel creation leaves caller selections and the catalog unchanged',()=>{
  const options={roots:['R0103','R0101'],seeds:['seed-z','seed-a'],arms:['N','V'],profiles:['active','baseline'],auth:['bearer','anonymous']};
  const supplied=structuredClone(catalog);
  const beforeOptions=structuredClone(options);const beforeCatalog=structuredClone(supplied);
  createPanel(options,{catalog:supplied,createdAt});
  assert.deepEqual(options,beforeOptions);assert.deepEqual(supplied,beforeCatalog);
});

test('Repeated selections cannot inflate any evaluation dimension',()=>{
  for(const options of [
    {roots:['R0101','R0101']},{seeds:['seed-a','seed-a']},{arms:['V','V']},
    {profiles:['baseline','baseline']},{auth:['session','session']}
  ])assert.throws(()=>make(options));
});

test('Unknown, malformed or empty selections fail closed',()=>{
  for(const options of [
    {roots:[]},{roots:['R9999']},{roots:['B0101']},{roots:['']},{roots:['all']},{roots:'R0101'},
    {seeds:[]},{seeds:['']},{seeds:[' ']},{seeds:[1]},{seeds:'seed-a'},
    {arms:[]},{arms:['X']},{arms:['v']},{arms:'V'},
    {profiles:[]},{profiles:['full']},{profiles:'baseline'},
    {auth:[]},{auth:['auto']},{auth:'anonymous'},
    {user:'root'},{user:''},{user:null}
  ])assert.throws(()=>make(options),JSON.stringify(options));
});

test('The inclusive budget and repetition limits are accepted',()=>{
  const minimum=make({arms:['V'],replicates:1,wallSeconds:10,requests:10,maxCells:1});
  assert.equal(minimum.cells.length,1);
  assert.equal(minimum.cells[0].condition.wallSeconds,10);
  assert.equal(minimum.cells[0].condition.requestedHttpRequests,10);
  const maximum=make({replicates:3,wallSeconds:1200,requests:3000,maxCells:10000});
  assert.equal(maximum.cells.length,9);
  assert.ok(maximum.cells.every(cell=>cell.condition.wallSeconds===1200&&cell.condition.requestedHttpRequests===3000));
});

test('Noninteger, missing-value and out-of-range budgets are rejected',()=>{
  for(const [name,min,max] of [['replicates',1,3],['wallSeconds',10,1200],['requests',10,3000],['maxCells',1,10000]]) {
    for(const value of [min-1,max+1,-1,1.5,NaN,Infinity,null,true,'30',''])assert.throws(()=>make({[name]:value}),name+' '+String(value));
  }
});

test('The cell cap covers the complete product including profiles and authentication',()=>{
  const options={roots:['R0101','R0103'],seeds:['seed-a','seed-z'],arms:['V','F','N'],replicates:2,profiles:['baseline','active'],auth:['anonymous','session','bearer']};
  assert.throws(()=>make({...options,maxCells:143}));
  assert.equal(make({...options,maxCells:144}).cells.length,144);
});

test('CLI parses an explicit output and every supported option',()=>{
  const result=parsePanelArgs(['generate','plans/panel.json','--roots','R0001,R0271','--seeds','seed-a,seed-b','--arms','V,F','--replicates','2','--profiles','baseline,active','--auth','anonymous,session,bearer','--user','bob','--wall-seconds','120','--requests','300','--max-cells','1000']);
  assert.deepEqual(result,{command:'generate',output:'plans/panel.json',options:{roots:['R0001','R0271'],seeds:['seed-a','seed-b'],arms:['V','F'],replicates:2,profiles:['baseline','active'],auth:['anonymous','session','bearer'],user:'bob',wallSeconds:120,requests:300,maxCells:1000}});
  const all=parsePanelArgs(['generate','panel.json','--roots','all','--seeds','seed-a']);
  assert.equal(all.command,'generate');assert.equal(all.options.roots,'all');
});

test('CLI provides list and help commands with no extra arguments',()=>{
  assert.deepEqual(parsePanelArgs(['list']),{command:'list'});
  assert.deepEqual(parsePanelArgs(['help']),{command:'help'});
  assert.deepEqual(parsePanelArgs(['--help']),{command:'help'});
  for(const args of [['unknown'],['list','extra'],['help','extra'],['--help','extra']])assert.throws(()=>parsePanelArgs(args));
});

test('CLI rejects unknown flags, duplicate flags and missing values',()=>{
  const valid=['generate','panel.json','--roots','R0001','--seeds','seed-a'];
  for(const tail of [
    ['--unknown','value'],['--roots','R0271'],['--seeds','seed-b'],
    ['--arms'],['--user'],['--requests'],['--profiles','--auth','session'],
    ['--requests','10','--requests','20']
  ])assert.throws(()=>parsePanelArgs([...valid,...tail]));
  for(const args of [['generate','panel.json'],['generate','panel.json','--roots','R0001'],['generate','panel.json','--seeds','seed-a']])assert.throws(()=>parsePanelArgs(args));
});

test('CLI applies the same choice, duplicate and budget validation before returning a plan',()=>{
  const base=['generate','panel.json','--roots','R0001','--seeds','seed-a'];
  for(const [flag,value] of [
    ['--arms','V,V'],['--arms','X'],['--profiles','baseline,baseline'],['--profiles','full'],
    ['--auth','session,session'],['--auth','auto'],['--user','root'],
    ['--replicates','0'],['--replicates','4'],['--wall-seconds','9'],['--wall-seconds','1201'],
    ['--requests','9'],['--requests','3001'],['--max-cells','0'],['--max-cells','10001'],
    ['--requests','10.5'],['--requests','Infinity'],['--requests','10junk'],['--max-cells','2']
  ])assert.throws(()=>parsePanelArgs([...base,flag,value]));
  for(const [flag,value] of [['--roots','R9999'],['--roots','R0001,R0001'],['--roots','all,R0001'],['--roots',''],['--seeds','seed-a,seed-a'],['--seeds','seed-a,'],['--seeds','']]) {
    const args=['generate','panel.json','--roots',flag==='--roots'?value:'R0001','--seeds',flag==='--seeds'?value:'seed-a'];
    assert.throws(()=>parsePanelArgs(args));
  }
});

test('CLI requires a nonempty output file name rather than a flag or control characters',()=>{
  for(const output of ['', ' ', '--roots', 'panel\n.json', 'panel\u0000.json'])assert.throws(()=>parsePanelArgs(['generate',output,'--roots','R0001','--seeds','seed-a']));
  assert.throws(()=>parsePanelArgs(['generate']));
});

async function inTemporaryDirectory(body) {
  const directory=await mkdtemp(path.join(tmpdir(),'benchmark-panel-tests-'));
  try {await body(directory);}finally {
    assert.equal(path.dirname(directory),path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('benchmark-panel-tests-'));
    await rm(directory,{recursive:true,force:true});
  }
}

test('Saving a panel creates its parent directories and preserves the complete JSON plan',async()=>{
  await inTemporaryDirectory(async directory=>{
    const output=path.join(directory,'nested','plans','panel.json');
    const panel=make();const before=structuredClone(panel);
    await savePanel(output,panel);
    assert.deepEqual(JSON.parse(await readFile(output,'utf8')),panel);
    assert.deepEqual(panel,before);
  });
});

test('Saving never replaces an existing file or truncates a previous plan',async()=>{
  await inTemporaryDirectory(async directory=>{
    const output=path.join(directory,'existing.json');
    const sentinel='existing user-owned content\n';
    await writeFile(output,sentinel,'utf8');
    await assert.rejects(()=>savePanel(output,make()));
    assert.equal(await readFile(output,'utf8'),sentinel);
    const fresh=path.join(directory,'new.json');
    await savePanel(fresh,make());const original=await readFile(fresh,'utf8');
    await assert.rejects(()=>savePanel(fresh,make({seeds:['seed-b']})));
    assert.equal(await readFile(fresh,'utf8'),original);
  });
});

test('An existing directory cannot be used as the output file',async()=>{
  await inTemporaryDirectory(async directory=>{
    const output=path.join(directory,'reserved');await mkdir(output);
    await assert.rejects(()=>savePanel(output,make()));
  });
});

const cliPath=fileURLToPath(new URL('../src/runner/panel-cli.mjs',import.meta.url));
const benchmarkRoot=fileURLToPath(new URL('../',import.meta.url));
const runCli=args=>spawnSync(process.execPath,[cliPath,...args],{cwd:benchmarkRoot,encoding:'utf8',stdio:'pipe',timeout:10000,windowsHide:true});

test('Actual Node CLI generates six unrun cells and refuses to replace the saved plan',async()=>{
  await inTemporaryDirectory(async directory=>{
    const output=path.join(directory,'cli-plan.json');
    const args=['generate',output,'--roots','R0001,R0271','--seeds','cli-smoke'];
    const generated=runCli(args);
    assert.equal(generated.error,undefined);assert.equal(generated.status,0,generated.stderr);
    const original=await readFile(output,'utf8');const panel=JSON.parse(original);
    assert.equal(panel.cells.length,6);assert.equal(panel.status,'not_run');
    assert.ok(panel.cells.every(cell=>cell.status==='not_run'&&cell.run===null));
    assert.deepEqual(panel.cells.map(cell=>[cell.root,cell.arm]),[['R0001','V'],['R0001','F'],['R0001','N'],['R0271','V'],['R0271','F'],['R0271','N']]);
    const repeated=runCli(args);
    assert.equal(repeated.error,undefined);assert.equal(repeated.status,1,repeated.stderr);
    assert.equal(await readFile(output,'utf8'),original);
  });
});

test('Actual Node CLI reports invalid arguments without creating an output file',async()=>{
  await inTemporaryDirectory(async directory=>{
    const conditions=[
      ['--roots','R0001'],
      ['--seeds','cli-smoke'],
      ['--roots','R0001','--seeds','cli-smoke','--unknown','value']
    ];
    for(const [index,flags] of conditions.entries()) {
      const output=path.join(directory,'invalid-'+index+'.json');
      const result=runCli(['generate',output,...flags]);
      assert.equal(result.error,undefined);assert.equal(result.status,1,result.stderr);
      await assert.rejects(()=>readFile(output,'utf8'),{code:'ENOENT'});
    }
  });
});
