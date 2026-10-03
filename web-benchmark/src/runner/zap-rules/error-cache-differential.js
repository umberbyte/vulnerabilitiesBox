/* ZAP active scan rule for a publicly documented preview header. */
function scan(helper, msg, param, value) {}

function scanNode(helper, msg) {
  if (helper.isStop() || String(msg.getRequestHeader().getMethod()) !== 'GET') return;
  var path = String(msg.getRequestHeader().getURI().getPath());
  if (!/\/news$/.test(path)) return;
  var baseline = probe(helper, msg, null);
  if (!baseline) return;
  // OpenAPI import can exercise the documented header before active scan starts.
  // In that case use the scanner's original, headerless 200 as the control and
  // confirm that a later headerless error remains stable. This is a candidate
  // until the HTTP history establishes which intervening request changed state.
  if (baseline.status >= 500 && baseline.status <= 599) {
    var originalStatus = msg.getResponseHeader().getStatusCode();
    if (originalStatus !== 200 || msg.getRequestHeader().getHeader('X-News-Preview')) return;
    var priorError = probe(helper, msg, null);
    if (!priorError || priorError.status !== baseline.status || priorError.body !== baseline.body) return;
    helper.newAlert()
      .setName('Persistent error after previously successful response')
      .setRisk(1).setConfidence(1)
      .setParam('X-News-Preview')
      .setEvidence('The scanner retained a headerless 200 response; two later headerless requests returned the same 5xx body. Review intervening requests for a cache-poisoning trigger.')
      .setMessage(priorError.msg).raise();
    return;
  }
  if (baseline.status !== 200) return;
  var marker = 'zap-cache-check-' + String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000));
  var mutated = probe(helper, msg, marker);
  if (!mutated || mutated.status < 500 || mutated.status > 599 || mutated.body.indexOf(marker) < 0) return;
  var following = probe(helper, msg, null);
  var repeated = probe(helper, msg, null);
  if (!following || !repeated || following.status !== mutated.status || repeated.status !== mutated.status) return;
  if (following.body !== mutated.body || repeated.body !== mutated.body) return;
  helper.newAlert()
    .setName('Error response persisted in shared cache')
    .setRisk(2).setConfidence(3)
    .setParam('X-News-Preview').setAttack(marker)
    .setEvidence('A header-triggered 5xx response with a unique marker persisted in two requests without that header.')
    .setMessage(following.msg).raise();
}

function probe(helper, original, marker) {
  if (helper.isStop()) return null;
  var copy = original.cloneRequest();
  copy.getRequestHeader().setHeader('X-News-Preview', marker);
  helper.sendAndReceive(copy, false, false);
  return {
    msg: copy,
    status: copy.getResponseHeader().getStatusCode(),
    body: String(copy.getResponseBody())
  };
}
