const addon=require('/opt/benchmark/native/fixture-asan.node');
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;if(input.length>2048)process.exit(64);});
process.stdin.on('end',()=>{
  try{
    const {variant,amount,secondary,vulnerable,canary}=JSON.parse(input);
    const output=addon.evaluate(variant,amount,secondary,vulnerable,canary||'');
    process.stdout.write(JSON.stringify({ok:true,output}));
  }catch(error){
    process.stdout.write(JSON.stringify({ok:false,error:error.name}));
  }
});
