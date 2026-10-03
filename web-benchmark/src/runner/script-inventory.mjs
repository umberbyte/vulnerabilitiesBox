export function hasEnabledBenchmarkScanScript(scripts){
  return scripts.some(script=>script.name!=='benchmark-auth-missing-headers'&&/^benchmark-[a-z-]+$/.test(script.name)&&String(script.enabled)==='true');
}
