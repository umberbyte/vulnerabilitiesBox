import {createHash} from 'node:crypto';

export const CONFIGURATION_NORMALIZATION='workspace-paths-0.1';
const PLACEHOLDER='/w/<workspace>';
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function canonical(value) {
  if(Array.isArray(value))return value.map(item=>item===undefined?null:canonical(item));
  if(isObject(value)) {
    const prototype=Object.getPrototypeOf(value);
    if(prototype!==Object.prototype&&prototype!==null)throw new Error('Configuration snapshot must contain JSON objects.');
    return Object.fromEntries(Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>[key,canonical(value[key])]));
  }
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
  throw new Error('Configuration snapshot must contain JSON values.');
}
function normalizePath(path,workspace) {
  if(typeof path!=='string'||/[\\\u0000-\u0020\u007f]/.test(path)||
     !(path===workspace||path.startsWith(workspace+'/')||path.startsWith(workspace+'?'))) {
    throw new Error('Excluded operation is outside the selected workspace.');
  }
  // Validate traversal before replacing only the literal leading workspace.
  // The query and the rest of the path remain part of the compared setting.
  const pathname=new URL(path,'https://benchmark.invalid').pathname;
  if(pathname!==workspace&&!pathname.startsWith(workspace+'/'))throw new Error('Excluded operation is outside the selected workspace.');
  return PLACEHOLDER+path.slice(workspace.length);
}
export function configurationFingerprint(snapshot,workspace) {
  if(typeof workspace!=='string'||!/^\/w\/[a-f0-9]{12}$/.test(workspace))throw new Error('Configuration normalization requires a public workspace path.');
  if(!isObject(snapshot))throw new Error('Configuration snapshot must be a JSON object.');
  const normalized=canonical(snapshot);
  if(Object.hasOwn(normalized,'authPolicy')) {
    if(!isObject(normalized.authPolicy))throw new Error('Authentication policy must be a JSON object.');
    if(Object.hasOwn(normalized.authPolicy,'excludedOperations')) {
      const paths=normalized.authPolicy.excludedOperations;
      if(!Array.isArray(paths))throw new Error('Excluded operations must be a JSON array.');
      normalized.authPolicy.excludedOperations=paths.map(path=>normalizePath(path,workspace)).sort();
    }
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
