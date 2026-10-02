import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createVariantPanel} from './variant-panel.mjs';

export async function main(args=process.argv.slice(2)){
 if(![1,3].includes(args.length)||!args[0]||args[0].startsWith('-')||args.length===3&&args[1]!=='--variants')throw Error('Usage: node src/runner/generate-variant-panel.mjs OUTPUT.json [--variants B0002,B0004,...]');
 const output=path.resolve(args[0]),panel=createVariantPanel(args.length===3?{variantIds:args[2].split(',')}:{});
 await mkdir(path.dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(panel,null,2)+'\n',{flag:'wx',mode:0o600});
 return {output,cells:panel.cellCount,variants:panel.catalogSnapshot.additionalVariantCount};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{process.stdout.write(JSON.stringify(await main())+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
