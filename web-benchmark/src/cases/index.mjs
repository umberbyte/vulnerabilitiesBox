import * as backend from './backend.mjs';
import * as workflows from './workflows.mjs';
import * as configuration from './configuration.mjs';
import * as quotas from './resource-quotas.mjs';
import * as dataHandling from './data-handling.mjs';
import * as contentBoundaries from './content-boundaries.mjs';
import * as batchAuth from './batch-auth.mjs';
import * as batchAuthorization from './batch-authorization.mjs';
import * as batchBoundaries from './batch-boundaries.mjs';
import * as batch2Browser from './batch2-browser.mjs';
import * as batch2Workflows from './batch2-workflows.mjs';
import * as batch2Storage from './batch2-storage.mjs';
import * as batch3Lifecycle from './batch3-lifecycle.mjs';
import * as batch3Protocols from './batch3-protocols.mjs';
import * as batch3Engines from './batch3-engines.mjs';
import * as batch4Variants from './batch4-variants.mjs';
import * as batch5Cases from './batch5-cases.mjs';
import * as batch6Archives from './batch6-archives.mjs';
import * as batch6Uploads from './batch6-uploads.mjs';
import * as batch6Cli from './batch6-cli.mjs';
import * as batch6Multipart from './batch6-multipart.mjs';
import * as batch6EncryptedZip from './batch6-encrypted-zip.mjs';
import * as batch6Docx from './batch6-docx.mjs';
import * as batch6H2 from './batch6-h2.mjs';
import * as batch6Grpc from './batch6-grpc.mjs';
import * as batch6Pdf from './batch6-pdf.mjs';
import * as batch6H2Header from './batch6-h2-header.mjs';
import * as batch6Xml from './batch6-xml.mjs';
import * as batch6Mongo from './batch6-mongo.mjs';
import * as batch6Ldap from './batch6-ldap.mjs';
const modules=[backend,workflows,configuration,quotas,dataHandling,contentBoundaries,batchAuth,batchAuthorization,batchBoundaries,batch2Browser,batch2Workflows,batch2Storage,batch3Lifecycle,batch3Protocols,batch3Engines,batch4Variants,batch5Cases,batch6Archives,batch6Uploads,batch6Cli,batch6Multipart,batch6EncryptedZip,batch6Docx,batch6H2,batch6Grpc,batch6Pdf,batch6H2Header,batch6Xml,batch6Mongo,batch6Ldap];
export const definitions=modules.flatMap(module=>module.definitions||[]);
export const variantDefinitions=modules.flatMap(module=>module.variantDefinitions||[]);
export function register(router,context){for(const module of modules)module.register(router,context);}
export async function reset(context){for(const module of modules)await module.reset(context);}
export const databaseProof=configuration.databaseProof;
export const registerCollector=dataHandling.registerCollector;
export function registerAux(router,context){for(const module of modules)module.registerAux?.(router,context);}
export const caseControl=batch3Lifecycle.caseControl;
export const registerProtocolServers=batch3Protocols.registerProtocolServers;
export async function audit(context){return {...await dataHandling.audit(context),...await batchBoundaries.audit(context),batchAuth:await batchAuth.audit(context),...await batch2Browser.audit(context),...await batch2Workflows.audit(context),...await batch2Storage.audit(context),...await batch3Lifecycle.audit(context),...await batch3Protocols.audit(context),...await batch3Engines.audit(context),...await batch4Variants.audit(context),...await batch5Cases.audit(context),...await batch6Archives.audit(context),...await batch6Uploads.audit(context),...await batch6Cli.audit(context),...await batch6Multipart.audit(context),...await batch6EncryptedZip.audit(context),...await batch6Docx.audit(context),...await batch6H2.audit(context),...await batch6Grpc.audit(context),...await batch6Pdf.audit(context),...await batch6H2Header.audit(context),...await batch6Xml.audit(context),...await batch6Mongo.audit(context),...await batch6Ldap.audit(context)};}
