// Closing a response does not imply its asynchronous side effects have stopped.
// Keep the three independent lifecycle counters and reject older snapshots
// that cannot establish whether outstanding handlers still exist.
export function pendingState(snapshot) {
  const state={};
  for(const name of ['activeRequests','openRequests','pendingHandlers']) {
    const value=snapshot[name];
    state[name]=Number.isSafeInteger(value)&&value>=0?value:null;
  }
  return {...state,settled:Object.values(state).every(value=>value===0)};
}
