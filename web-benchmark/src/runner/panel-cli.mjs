import {pathToFileURL} from 'node:url';
import {cases} from '../catalog.mjs';
import {createPanel,parsePanelArgs,savePanel} from './panel.mjs';

const help=`Offline operator plan commands:
  list
  generate OUTPUT.json --roots ROOT[,ROOT]|all --seeds SEED[,SEED] [options]
Options:
  --arms V,F,N                   default: V,F,N
  --replicates 1..3              default: 1
  --profiles baseline,active,active-low  default: baseline
  --auth anonymous,session,bearer default: anonymous
  --user alice|bob|carol|approver|admin  default: alice
  --wall-seconds 10..1200        default: 30
  --requests 10..3000            default: 100
  --max-cells 1..10000           default: 10000
Roots and seeds are required. CSV options reject duplicates.
Only a private plan is written; no app requests or scans are performed.
Existing output files are never overwritten.`;

export async function main(argv=process.argv.slice(2)) {
  const command=parsePanelArgs(argv);
  if(command.command==='help'){console.log(help);return;}
  if(command.command==='list') {
    console.log(JSON.stringify({implementedRootCount:cases.length,cases:[...cases].sort((a,b)=>a.root<b.root?-1:a.root>b.root?1:0).map(({root,variant,title})=>({root,variant,title}))},null,2));return;
  }
  const panel=createPanel(command.options);
  await savePanel(command.output,panel);
  console.log(JSON.stringify({output:command.output,planId:panel.planId,cells:panel.cellCount,status:panel.status,execution:panel.execution},null,2));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  try{await main();}catch(error){console.error(error.code==='EEXIST'?'Output already exists; choose a new output filename.':error.message);process.exitCode=1;}
}
