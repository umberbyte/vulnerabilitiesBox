export async function captureRemainingMessages(firstPage,fetchPage,{pageSize=500,maxMessages=5000}={}) {
  if(!Number.isSafeInteger(pageSize)||pageSize<1||!Number.isSafeInteger(maxMessages)||maxMessages<pageSize||maxMessages%pageSize!==0)throw new Error('Invalid history capture bounds.');
  const items=page=>{
    if(!Array.isArray(page?.messages)||page.messages.length>pageSize)throw new Error('Invalid ZAP history page.');
    return page.messages;
  };
  const first=items(firstPage),remaining=[];
  let complete=first.length<pageSize,error=null;
  for(let start=pageSize;!complete&&start<maxMessages;start+=pageSize){
    try{
      const page=items(await fetchPage(start,pageSize));
      remaining.push(...page);
      complete=page.length<pageSize;
    }catch(cause){error=String(cause?.message||cause);break;}
  }
  if(!complete&&!error){
    try{
      const probe=await fetchPage(maxMessages,1);
      if(!Array.isArray(probe?.messages)||probe.messages.length>1)throw new Error('Invalid ZAP history boundary probe.');
      complete=probe.messages.length===0;
    }catch(cause){error=String(cause?.message||cause);}
  }
  return {remaining,savedCount:first.length+remaining.length,complete,error,maxMessages};
}
