import * as files from './batch5-files.mjs';
import * as auth from './batch5-auth.mjs';
import * as parsing from './batch5-parsing.mjs';
import * as cache from './batch5-cache.mjs';
import * as errors from './batch5-errors.mjs';
import * as browser from './batch5-browser.mjs';
import * as transport from './batch5-transport.mjs';
import * as socket from './batch5-socket.mjs';
const modules=[files,auth,parsing,cache,errors,browser,transport,socket];
export const definitions=modules.flatMap(module=>module.definitions||[]);
export const variantDefinitions=modules.flatMap(module=>module.variantDefinitions||[]);
export function register(router,context){for(const module of modules)module.register(router,context);}
export async function reset(context){for(const module of modules)await module.reset(context);}
export async function audit(context){return Object.assign({},...await Promise.all(modules.map(module=>module.audit(context))));}
