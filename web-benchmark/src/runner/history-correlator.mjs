// Correlate public HTTP messages by request order. No case identity or oracle is read.
function request(message) {
  const lines=String(message.requestHeader||'').split(/\r?\n/);
  const [method,url]=lines[0].split(' ');
  if(method!=='GET'||!/^https?:\/\//.test(url||''))return null;
  const headers=new Map();
  for(const line of lines.slice(1)){
    const colon=line.indexOf(':');
    if(colon>0)headers.set(line.slice(0,colon).toLowerCase(),line.slice(colon+1).trim());
  }
  const status=Number(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(String(message.responseHeader||''))?.[1]);
  return Number.isInteger(status)?{id:String(message.id),url,headers,status,body:String(message.responseBody||'')}:null;
}

export function correlateErrorCache(messages,{headerName='X-News-Preview'}={}) {
  const header=headerName.toLowerCase();
  const ordered=[...messages].sort((a,b)=>Number(a.id)-Number(b.id));
  const state=new Map(),findings=[];
  for(const raw of ordered) {
    const entry=request(raw);
    if(!entry)continue;
    const item=state.get(entry.url)||{normal:null,trigger:null};
    const supplied=entry.headers.get(header);
    if(supplied) {
      if(item.normal&&entry.status>=500&&entry.status<=599&&supplied.length>=4&&entry.body.includes(supplied))item.trigger=entry;
    } else if(entry.status===200) {
      item.normal=entry;
      item.trigger=null;
    } else if(item.normal&&item.trigger&&entry.status===item.trigger.status&&entry.body===item.trigger.body) {
      findings.push({kind:'shared-error-cache',url:entry.url,headerName,baselineMessageId:item.normal.id,triggerMessageId:item.trigger.id,followupMessageId:entry.id,status:entry.status});
      item.trigger=null;
    }
    state.set(entry.url,item);
  }
  return findings;
}
