import {readFile} from 'node:fs/promises';
const key=await readFile('/tmp/benchmark-control.key','utf8');
const [command='manifest',root='R0001',mode='V',seed='pilot-2026',variant]=process.argv.slice(2);
if(command==='key'){process.stdout.write(key);process.exit(0);}
const allowed={health:'/health',catalog:'/catalog','variant-catalog':'/variant-catalog',manifest:'/manifest',oracle:'/oracle',reset:'/reset','mail-alice':'/mail/alice',measurement:'/measurement','measurement-start':'/measurement/start','measurement-stop':'/measurement/stop','database-proof':'/database-proof'};
if(!allowed[command])throw new Error('Commands: health, catalog, variant-catalog, manifest, oracle, reset ROOT V|F|N [seed] [variant], mail-alice, measurement, measurement-start, measurement-stop, database-proof OBSERVED_CONNECTION_URL');
const isPost=['reset','measurement-start','measurement-stop','database-proof'].includes(command);
const response=await fetch('http://127.0.0.1:8099'+allowed[command],{method:isPost?'POST':'GET',headers:{'x-benchmark-key':key,'content-type':'application/json'},...(isPost?{body:JSON.stringify(command==='reset'?{root,mode,seed,...(variant?{variant}:{})}:command==='database-proof'?{connectionString:root}:{})}:{})});
const value=await response.json();if(!response.ok||command==='health'&&!value.ok)process.exitCode=1;process.stdout.write(JSON.stringify(value,null,2)+'\n');
