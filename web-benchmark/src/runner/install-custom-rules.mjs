import {readFile,writeFile,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const rules=[
  {name:'benchmark-sql-grammar-differential',id:'50000',source:new URL('./zap-rules/sql-grammar-differential.js',import.meta.url),description:'Differential checks for SQL grammar positions'},
  {name:'benchmark-path-separator-differential',id:'50000',source:new URL('./zap-rules/path-separator-differential.js',import.meta.url),description:'Compare public path normalization across slash conventions'},
  {name:'benchmark-error-cache-differential',id:'50000',source:new URL('./zap-rules/error-cache-differential.js',import.meta.url),description:'Check whether a header-triggered error persists without that header'},
  {name:'benchmark-ldap-filter-differential',id:'50000',source:new URL('./zap-rules/ldap-filter-differential.js',import.meta.url),description:'Compare ordinary, wildcard, and no-match LDAP filter branch results'},
  {name:'benchmark-mongo-operator-differential',id:'50000',source:new URL('./zap-rules/mongo-operator-differential.js',import.meta.url),description:'Compare string equality with Mongo operator objects in public JSON filters'}
];

export async function install({zap=process.env.ZAP_URL||'http://zap:8090',key=process.env.ZAP_API_KEY,inputDirectory='/scan-input',onlyCustom=false}={}) {
  if(zap!=='http://zap:8090'||!key)throw new Error('The isolated ZAP endpoint and API key are required.');
  async function api(component,kind,name,params={}) {
    const url=new URL(`/JSON/${component}/${kind}/${name}/`,zap);
    for(const [field,value] of Object.entries(params))url.searchParams.set(field,String(value));
    const response=await fetch(url,{headers:{'X-ZAP-API-Key':key},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`ZAP API ${name}: HTTP ${response.status}`);
    const data=await response.json();if(data.code)throw new Error(`ZAP API ${name}: ${data.code}`);
    return data;
  }
  for(let attempt=0;;attempt++) {
    try{
      await api('core','view','version');
      const addons=(await api('autoupdate','view','installedAddons')).installedAddons;
      const ids=new Set((addons||[]).filter(addon=>addon.installationStatus==='INSTALLED').map(addon=>addon.id));
      const scanners=(await api('ascan','view','scanners')).scanners;
      if(!['commonlib','scripts','graaljs'].every(id=>ids.has(id))||!scanners?.some(scanner=>scanner.id==='50000'))throw new Error('ZAP add-ons are still loading.');
      break;
    }
    catch(error){if(attempt>=60)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
  }
  const before=(await api('script','view','listScripts')).listScripts;
  const scanners=(await api('ascan','view','scanners')).scanners;
  if(!Array.isArray(before)||!Array.isArray(scanners))throw new Error('ZAP script/scanner inventory unavailable.');
  const installed=[];
  for(const rule of rules) {
    if(before.some(script=>script.name===rule.name))throw new Error(`Custom script already exists: ${rule.name}`);
    const source=await readFile(rule.source);
    const destination=`${inputDirectory}/${rule.name}.js`;
    await writeFile(destination,source,{flag:'w',mode:0o644});
    await chmod(destination,0o644);
    await api('script','action','load',{scriptName:rule.name,scriptType:'active',scriptEngine:'Graal.js',fileName:destination,scriptDescription:rule.description,charset:'UTF-8'});
    await api('script','action','enable',{scriptName:rule.name});
    installed.push({name:rule.name,id:rule.id,sha256:createHash('sha256').update(source).digest('hex')});
  }
  if(onlyCustom) {
    const disabled=await api('ascan','action','disableAllScanners');
    const enabled=await api('ascan','action','enableScanners',{ids:'50000'});
    if(disabled.Result!=='OK'||enabled.Result!=='OK')throw new Error('Custom-only scan policy was not acknowledged.');
  }
  const after=(await api('script','view','listScripts')).listScripts;
  const active=(await api('ascan','view','scanners')).scanners;
  for(const rule of installed) {
    if(!after.some(script=>script.name===rule.name&&String(script.enabled)==='true'&&String(script.error)!=='true'))throw new Error(`Custom script was not enabled cleanly: ${rule.name}`);
    if(!active.some(scanner=>scanner.id===rule.id&&String(scanner.enabled)==='true'))throw new Error(`Custom scanner is absent or disabled: ${rule.id}`);
  }
  if(onlyCustom&&active.some(scanner=>scanner.id!=='50000'&&String(scanner.enabled)==='true'))throw new Error('A non-custom active scanner remains enabled.');
  await writeFile(`${inputDirectory}/custom-rules-manifest.json`,JSON.stringify({schema:'benchmark-custom-zap-rules-0.1',rules:installed},null,2)+'\n',{flag:'w',mode:0o644});
  return installed;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  try{
    if(process.argv.slice(2).some(arg=>arg!=='--only-custom'))throw new Error('Usage: install-custom-rules.mjs [--only-custom]');
    console.log(JSON.stringify({installed:await install({onlyCustom:process.argv.includes('--only-custom')})},null,2));
  }
  catch(error){console.error(error.message);process.exitCode=1;}
}
