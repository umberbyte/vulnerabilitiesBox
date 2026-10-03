import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createVariantPanel} from './variant-panel.mjs';

export async function main(args=process.argv.slice(2)){
 const usage='Usage: node src/runner/generate-variant-panel.mjs OUTPUT.json [--variants B0002,B0004,...] [--profile baseline|active] [--seed TEXT] [--wall-seconds 10..1200] [--requests 10..3000]';
 if(!args[0]||args[0].startsWith('-')||args.length%2!==1)throw Error(usage);
 const options={};
 for(let i=1;i<args.length;i+=2){
  const flag=args[i],value=args[i+1];
  if(!value||!['--variants','--profile','--seed','--wall-seconds','--requests'].includes(flag))throw Error(usage);
  const key={'--variants':'variantIds','--profile':'profile','--seed':'seed','--wall-seconds':'wallSeconds','--requests':'requests'}[flag];
  if(Object.hasOwn(options,key))throw Error('Duplicate variant panel option');
  options[key]=flag==='--variants'?value.split(','):['--wall-seconds','--requests'].includes(flag)?/^\d+$/.test(value)?Number(value):NaN:value;
 }
 const output=path.resolve(args[0]),panel=createVariantPanel(options);
 await mkdir(path.dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(panel,null,2)+'\n',{flag:'wx',mode:0o600});
 return {output,cells:panel.cellCount,variants:panel.catalogSnapshot.additionalVariantCount};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{process.stdout.write(JSON.stringify(await main())+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
