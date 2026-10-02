const switchMember=async(t,name)=>{t.check((await t.post('/logout',{})).status()===200,'Member logout succeeds');await t.login(name);};
const state=async(t,path)=>(await t.get(path)).json();
const restore=async(t,root,path,empty)=>{
  await t.ctl('/reset',{root,mode:t.mode,seed:'acceptance-v1'});
  t.check((await t.get(path)).status()===401,'Resource reset invalidates the former member session');
  await t.login();t.check(empty(await state(t,path)),'Resource reset restores its actual persistence fixture');
};

export const checks={
  R0428:async t=>{
    t.check((await t.get('/catalog-page?pageSize=2')).status()===401,'Anonymous callers cannot query member catalog');
    await t.login();
    const normal=await state(t,'/catalog-page?pageSize=2');
    t.check(normal.records.length===2&&normal.records[0].title==='Catalog item 1','Normal page contains two actual PostgreSQL records');
    const boundary=await state(t,'/catalog-page?pageSize=5');
    t.check(boundary.records.length===5&&boundary.records[4].id===5,'Published maximum page size remains usable');
    const over=await t.get('/catalog-page?pageSize=6'),body=await over.json();
    t.check((over.status()===200&&body.records?.length===6)===t.v,'Minimum page overage returns six real DB rows only in V');
    if(!t.v)t.check(over.status()===400&&!Object.hasOwn(body,'records'),'Fixed route refuses the oversized page before delivering records');
    t.check((await t.get('/catalog-page?pageSize=13')).status()===422,'Finite experiment guard is enforced separately in every arm');
    for(const value of ['0','1.5','-1','NaN','2 OR 1=1'])t.check((await t.get('/catalog-page?pageSize='+encodeURIComponent(value))).status()===400,'Malformed page size is rejected as data: '+value);
    t.check((await state(t,'/catalog-page?pageSize=1')).records.length===1,'Ordinary pagination remains usable after rejected inputs');
    t.record.resourceEvidence={resource:'PostgreSQL returned rows',businessAllowance:5,minimumOverage:6,status:over.status(),returnedRows:body.records?.length??0,experimentMaximum:12};
    await restore(t,'R0428','/catalog-page',value=>value.records.length===2&&value.records[0].id===1);
  },
  R0437:async t=>{
    t.check((await t.post('/notifications',{recipient:'alice@example.test',message:'First message'})).status()===401,'Anonymous callers cannot deliver notifications');
    await t.login();
    t.check((await state(t,'/notifications')).messages.length===0,'Actual member outbox starts empty');
    for(let number=1;number<=3;number++){
      const sent=await t.post('/notifications',{recipient:'alice@example.test',message:'Service message '+number});
      t.check(sent.status()===200&&(await sent.json()).count===number,'Legitimate delivery '+number+' is actually stored');
    }
    const over=await t.post('/notifications',{recipient:'alice@example.test',message:'Fourth service message'});
    const current=await state(t,'/notifications');
    t.check(over.status()===(t.v?200:429),'Fourth notification exceeds the same member allowance only in V');
    t.check(current.messages.length===(t.v?4:3)&&current.messages.some(item=>item.message==='Fourth service message')===t.v,'Redis outbox has the forbidden stored fourth message only in V');
    t.check(current.messages.every(item=>item.recipient==='alice@example.test'&&/^[a-f0-9]{48}$/.test(item.id)),'Stored fixture messages have actual delivery identity and recipient');
    t.check((await t.post('/notifications',{recipient:'bob@example.test',message:'Another destination'})).status()===400,'Recipient validation remains intact in every arm');
    t.check((await t.post('/notifications',{recipient:'alice@example.test',message:'x'.repeat(257)})).status()===400,'Oversized mail body is refused by the common finite guard');
    t.check((await state(t,'/notifications')).messages.length===current.messages.length,'Rejected messages do not create outbox effects');
    await switchMember(t,'bob');t.check((await state(t,'/notifications')).messages.length===0,'Another subject has an independent empty outbox');
    t.check((await t.post('/notifications',{recipient:'bob@example.test',message:'Bob normal message'})).status()===200,'Another subject retains a legitimate notification allowance');
    await switchMember(t,'alice');t.check((await state(t,'/notifications')).messages.length===current.messages.length,'Other subject delivery does not alter Alice outbox');
    t.record.resourceEvidence={resource:'Redis fixture outbox',businessAllowance:3,minimumOverage:4,status:over.status(),storedMessages:current.messages.length,externalDelivery:false};
    await restore(t,'R0437','/notifications',value=>value.messages.length===0);
  },
  R0438:async t=>{
    t.check((await t.post('/report-jobs',{period:'monthly'})).status()===401,'Anonymous callers cannot enqueue report work');
    await t.login();const admitted=[];
    for(let number=1;number<=3;number++){
      const response=await t.post('/report-jobs',{period:'monthly'}),job=await response.json();
      t.check(response.status()===200&&job.pending===number&&/^[a-f0-9]{48}$/.test(job.id),'Legitimate pending report '+number+' enters the real queue');admitted.push(job.id);
    }
    const over=await t.post('/report-jobs',{period:'weekly'}),queued=await state(t,'/report-jobs');
    t.check(over.status()===(t.v?200:429),'Fourth pending job is admitted only in V');
    t.check(queued.jobs.length===(t.v?4:3)&&queued.jobs.every(job=>job.state==='pending'),'Actual Redis queue depth exceeds allowance only in V');
    t.check(queued.jobs.some(job=>job.period==='weekly')===t.v,'Forbidden fourth work item is actually present only in V');
    t.check((await t.post('/report-jobs/'+admitted[0]+'/cancel',{})).status()===200,'Subject can cancel its own actual pending work');
    t.check((await state(t,'/report-jobs')).jobs.length===queued.jobs.length-1,'Cancellation removes one real queue entry');
    t.check((await t.post('/report-jobs',{period:'weekly'})).status()===200,'Released capacity permits legitimate replacement work');
    t.check((await t.post('/report-jobs',{period:'unrecognized'})).status()===400,'Invalid job type is refused without admission');
    await switchMember(t,'bob');t.check((await state(t,'/report-jobs')).jobs.length===0,'Queue allowance is independent for another subject');
    t.check((await t.post('/report-jobs/'+admitted[1]+'/cancel',{})).status()===404,'Other subject cannot remove Alice pending work');
    t.check((await t.post('/report-jobs',{period:'monthly'})).status()===200,'Another subject may enqueue ordinary work');
    await switchMember(t,'alice');t.check((await state(t,'/report-jobs')).jobs.length===queued.jobs.length,'Other subject operations do not alter Alice queue');
    t.record.resourceEvidence={resource:'Redis pending queue',businessAllowance:3,minimumOverage:4,status:over.status(),pendingJobs:queued.jobs.length,workerCpuMeasured:false};
    await restore(t,'R0438','/report-jobs',value=>value.jobs.length===0);
  },
  R0439:async t=>{
    t.check((await t.post('/sync-reports',{source:'primary'})).status()===401,'Anonymous callers cannot invoke a report dependency');
    await t.login();const normal=await t.post('/sync-reports',{source:'primary'}),normalBody=await normal.json();
    const first=await state(t,'/sync-reports');
    t.check(normal.status()===200&&normalBody.synchronized&&first.calls.length===1&&first.calls[0].outcome==='ok','Normal source completes after one actual local dependency invocation');
    const repeated=await t.post('/sync-reports',{source:'archive'}),result=await repeated.json();
    const history=await state(t,'/sync-reports'),calls=history.calls.filter(call=>call.operation===result.operation);
    t.check(repeated.status()===(t.v?200:503),'Three transient dependency failures cause a fourth invocation only in V');
    t.check(calls.length===(t.v?4:3),'Persisted local dependency call count exceeds retry allowance only in V');
    t.check(calls.every((call,index)=>call.source==='archive'&&call.attempt===index+1),'Actual invocation records preserve operation identity and trial order');
    t.check(calls.slice(0,3).every(call=>call.outcome==='unavailable')&&(calls.some(call=>call.outcome==='ok')===t.v),'Dependency fixture really fails its first three calls and succeeds on fourth');
    const intervals=calls.slice(1).map((call,index)=>call.monotonicMs-calls[index].monotonicMs);
    if(!t.v)t.check(intervals.length===2&&intervals[0]>=5&&intervals[1]>=15,'Fixed retry loop applies actual bounded backoff before subsequent calls');
    t.check((await t.post('/sync-reports',{source:'unknown'})).status()===400,'Unregistered source does not invoke the fixture');
    t.check((await state(t,'/sync-reports')).calls.length===history.calls.length,'Invalid source has no stored dependency effect');
    t.check((await t.post('/sync-reports',{source:'primary'})).status()===200,'Ordinary dependency remains usable after transient source failure');
    await switchMember(t,'bob');t.check((await state(t,'/sync-reports')).calls.length===0,'Another subject observes no Alice dependency history');
    t.check((await t.post('/sync-reports',{source:'primary'})).status()===200,'Another subject can perform a legitimate one-call synchronization');
    await switchMember(t,'alice');t.check((await state(t,'/sync-reports')).calls.length===history.calls.length+1,'Other subject dependency events do not alter Alice history');
    t.record.resourceEvidence={resource:'Recorded local dependency invocations',businessAttemptAllowance:3,status:repeated.status(),operation:result.operation,calls,intervalsMs:intervals,externalNetworkMeasured:false};
    await restore(t,'R0439','/sync-reports',value=>value.calls.length===0);
  },
  R0440:async t=>{
    t.check((await t.post('/service-log',{message:'Ordinary record',copies:1})).status()===401,'Anonymous callers cannot append member logs');
    await t.login();t.check((await state(t,'/service-log')).bytes===0,'Actual member log file begins empty');
    const normal=await t.post('/service-log',{message:'Service connection checked',copies:1}),before=await state(t,'/service-log');
    t.check(normal.status()===200&&before.entries.length===1&&before.entries[0].message==='Service connection checked'&&before.bytes>0,'Ordinary record is appended to the actual UTF-8 file');
    const input='L'.repeat(128),copies=8,entryBytes=Buffer.byteLength(JSON.stringify({message:input})+'\n')*copies;
    const over=await t.post('/service-log',{message:input,copies}),after=await state(t,'/service-log');
    t.check(over.status()===(t.v?200:413),'Small repeated input exceeds file capacity only in V');
    t.check((after.bytes>1024)===t.v&&after.bytes===(t.v?before.bytes+entryBytes:before.bytes),'Actual appended file bytes demonstrate forbidden volume only in V');
    t.check(after.entries.filter(entry=>entry.message===input).length===(t.v?copies:0),'Actual repeated log lines are present only after admitted append');
    const legal=await t.post('/service-log',{message:'ok',copies:8}),legalState=await state(t,'/service-log');
    t.check(legal.status()===200&&legalState.entries.filter(entry=>entry.message==='ok').length===8,'Repetitive but small legal input still appends within the published allowance');
    t.check((await t.post('/service-log',{message:'x',copies:17})).status()===400,'Common guard refuses out-of-experiment repeat counts');
    t.check((await t.post('/service-log',{message:'x'.repeat(257),copies:1})).status()===400,'Common guard refuses oversized input before append');
    t.check((await state(t,'/service-log')).bytes===legalState.bytes,'Rejected inputs have no actual filesystem effects');
    await switchMember(t,'bob');t.check((await state(t,'/service-log')).bytes===0,'Another subject has a separate actual log file');
    t.check((await t.post('/service-log',{message:'Bob normal record',copies:1})).status()===200,'Other subject can record a legitimate service observation');
    await switchMember(t,'alice');t.check((await state(t,'/service-log')).bytes===legalState.bytes,'Other subject append does not change Alice file');
    t.record.resourceEvidence={resource:'Actual UTF-8 log-file bytes',businessPeriodAllowance:1024,status:over.status(),inputBytes:Buffer.byteLength(input),copies,proposedAppendedBytes:entryBytes,beforeBytes:before.bytes,afterBytes:after.bytes,experimentMaximumBytes:8192};
    await restore(t,'R0440','/service-log',value=>value.bytes===0&&value.entries.length===0);
  }
};
