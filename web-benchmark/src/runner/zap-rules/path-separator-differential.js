/* ZAP active scan rule. Uses only a public file path supplied to the scanner. */
function scanNode(helper, msg) {}

function scan(helper, msg, param, value) {
  if (helper.isStop() || String(msg.getRequestHeader().getMethod()) !== 'GET') return;
  if (!/^(name|path|file|filename)$/i.test(String(param))) return;
  var match = /^([A-Za-z0-9_-]+)\/([A-Za-z0-9._/-]+)$/.exec(String(value));
  if (!match || match[2].split('/').some(function (part) { return part === '..' || part === '.' || part === ''; })) return;
  var directory = match[1], tail = match[2];
  var mixed = directory + '\\..\\' + directory + '/' + tail;
  var slash = directory + '/../' + directory + '/' + tail;
  var normalResponse = probe(helper, msg, param, String(value));
  var mixedResponse = probe(helper, msg, param, mixed);
  var slashResponse = probe(helper, msg, param, slash);
  if (!normalResponse || !mixedResponse || !slashResponse) return;
  if (normalResponse.status !== 200 || mixedResponse.status !== 200 || mixedResponse.body !== normalResponse.body) return;
  if (slashResponse.status === 200 && slashResponse.body === normalResponse.body) return;
  var repeated = probe(helper, msg, param, mixed);
  if (!repeated || repeated.status !== 200 || repeated.body !== normalResponse.body) return;
  helper.newAlert()
    .setName('Path separator normalization mismatch')
    .setRisk(2).setConfidence(2).setCweId(22)
    .setParam(param).setAttack(mixed)
    .setEvidence('Backslash parent traversal resolved to the normal public file while the slash parent control did not.')
    .setMessage(mixedResponse.msg).raise();
}

function probe(helper, original, param, payload) {
  if (helper.isStop()) return null;
  var copy = original.cloneRequest();
  helper.setParam(copy, param, payload);
  helper.sendAndReceive(copy, false, false);
  return {
    msg: copy,
    status: copy.getResponseHeader().getStatusCode(),
    body: String(copy.getResponseBody())
  };
}
