/* ZAP active scan rule. A JSON string can be safe for JavaScript syntax yet
 * unsafe when embedded as text inside an HTML script element. */
function scanNode(helper, msg) {}

function scan(helper, msg, param, value) {
  if (helper.isStop() || String(msg.getRequestHeader().getMethod()) !== 'GET') return;
  if (String(param).toLowerCase() !== 'inlinejson' || !/^[a-z0-9 ._-]{1,50}$/i.test(String(value))) return;
  var normal = probe(helper, msg, param, String(value));
  if (!normal || !/<script\b[^>]*\btype=["']application\/json["'][^>]*>/i.test(normal.body)) return;
  var attack = '</script><script>document.body.dataset.benchmarkprobe=1</script>';
  var first = probe(helper, msg, param, attack);
  if (!first || !hasBreakout(first.body)) return;
  var repeated = probe(helper, msg, param, attack);
  if (!repeated || !hasBreakout(repeated.body)) return;
  helper.newAlert()
    .setName('JSON script element HTML boundary breakout')
    .setRisk(3).setConfidence(2).setCweId(79)
    .setParam(param).setAttack(attack)
    .setEvidence('A JSON script element ended at an injected closing tag and emitted a second executable script element. The response structure persisted on repeat.')
    .setMessage(first.msg).raise();
}

function hasBreakout(body) {
  var opening = /<script\b[^>]*\btype=["']application\/json["'][^>]*>/i.exec(body);
  if (!opening) return false;
  var data = body.slice(opening.index + opening[0].length);
  return /^[\s\S]{0,200}<\/script><script>document\.body\.dataset\.benchmarkprobe=1<\/script>/i.test(data);
}

function probe(helper, original, param, payload) {
  if (helper.isStop()) return null;
  var copy = original.cloneRequest();
  helper.setParam(copy, param, payload);
  copy.getRequestHeader().setHeader('Accept', 'text/html');
  helper.sendAndReceive(copy, false, false);
  if (copy.getResponseHeader().getStatusCode() !== 200) return null;
  var contentType = String(copy.getResponseHeader().getHeader('Content-Type') || '');
  if (!/^text\/html\b/i.test(contentType)) return null;
  var body = String(copy.getResponseBody());
  if (body.length > 100000) return null;
  return {msg: copy, body: body};
}
