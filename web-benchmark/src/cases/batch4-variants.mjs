// Additional variants keep their original root identity. A separate catalog
// avoids counting sibling variants as new, independent root causes.
import * as sql from './batch4-sql.mjs';
import * as browser from './batch4-browser.mjs';
import * as files from './batch4-files.mjs';
import * as ssrf from './batch4-ssrf.mjs';
import * as authProfile from './batch4-auth-profile.mjs';
import * as authState from './batch4-auth-state.mjs';
import * as authObject from './batch4-auth-object.mjs';
import * as csrf from './batch4-csrf.mjs';
import * as cache from './batch4-cache.mjs';
const modules=[sql,browser,files,ssrf,authProfile,authState,authObject,csrf,cache];
export const variantDefinitions=modules.flatMap(module=>module.variantDefinitions);
export async function reset(context){for(const module of modules)await module.reset(context);}
export function register(router,context){for(const module of modules)module.register(router,context);}
export async function audit(context){return Object.assign({},...await Promise.all(modules.map(module=>module.audit(context))));}
