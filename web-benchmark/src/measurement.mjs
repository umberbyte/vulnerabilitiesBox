// Private measurement state. Count arrivals before parsing and keep unfinished
// handlers tracked even when their client has disconnected.
export class RequestMeter {
  current=null;
  openRequests=0;
  pendingHandlers=0;
  get active(){return !!this.current?.active;}
  get busy(){return this.openRequests>0||this.pendingHandlers>0;}
  middleware(){return (req,res,next)=>{
    if(req.path==='/health')return next();
    this.openRequests++;
    const sample=this.active?this.current:null;
    if(sample){sample.count++;sample.activeRequests++;sample.peakActive=Math.max(sample.peakActive,sample.activeRequests);sample.byMethod[req.method]=(sample.byMethod[req.method]||0)+1;}
    let closed=false;
    const finish=()=>{if(closed)return;closed=true;this.openRequests--;if(sample)sample.activeRequests--;};
    res.once('finish',finish);res.once('close',finish);next();
  };}
  // Express does not await next(). Each registered handler is tracked separately.
  track(target){
    const wrap=handler=>{
      if(Array.isArray(handler))return handler.map(wrap);
      if(typeof handler!=='function')return handler;
      const invoke=(args)=>{
        this.pendingHandlers++;
        let result;
        try{result=handler(...args);}catch(error){this.pendingHandlers--;throw error;}
        if(result&&typeof result.then==='function')return Promise.resolve(result).finally(()=>{this.pendingHandlers--;});
        this.pendingHandlers--;return result;
      };
      return handler.length===4?function(error,req,res,next){return invoke([error,req,res,next]);}:function(req,res,next){return invoke([req,res,next]);};
    };
    for(const method of ['use','get','post']){
      const original=target[method];target[method]=function(...args){return original.apply(this,args.map(wrap));};
    }
    return target;
  }
  start(id,workspace){
    if(this.active)throw new Error('measurement already active');
    if(this.busy)throw new Error('public requests are still running');
    this.current={id,workspace,active:true,count:0,activeRequests:0,peakActive:0,byMethod:{},startedAt:new Date().toISOString()};
    return this.snapshot();
  }
  stop(){
    if(!this.active)throw new Error('no active measurement');
    this.current.active=false;this.current.finishedAt=new Date().toISOString();
    return this.snapshot();
  }
  snapshot(){return {...(this.current||{active:false,count:0,activeRequests:0,peakActive:0,byMethod:{}}),byMethod:{...this.current?.byMethod},openRequests:this.openRequests,pendingHandlers:this.pendingHandlers};}
}
