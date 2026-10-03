/* ZAP active scan rule. Mutates a public JSON filter value into Mongo operators. */
function scanNode(helper, msg) {}

function scan(helper, msg, param, value) {
  if (helper.isStop() || String(msg.getRequestHeader().getMethod()) !== 'POST') return;
  if (String(param).toLowerCase() !== 'filter' || !/^[a-z0-9._-]{1,24}$/i.test(String(value))) return;
  var original;
  try { original = JSON.parse(String(msg.getRequestBody())); } catch (ignored) { return; }
  if (!original || typeof original.filter !== 'string' || original.filter !== String(value)) return;
  var baseline = probe(helper, msg, original, String(value));
  var positive = probe(helper, msg, original, {'$ne': String(value)});
  var negative = probe(helper, msg, original, {'$eq': String(value)});
  if (!baseline || !positive || !negative || baseline.rows.length < 1) return;
  if (!sameRows(baseline.rows, negative.rows) || sameRows(baseline.rows, positive.rows) || positive.rows.length < 1) return;
  var repeatedPositive = probe(helper, msg, original, {'$ne': String(value)});
  var repeatedNegative = probe(helper, msg, original, {'$eq': String(value)});
  if (!repeatedPositive || !repeatedNegative) return;
  if (!sameRows(positive.rows, repeatedPositive.rows) || !sameRows(negative.rows, repeatedNegative.rows)) return;
  helper.newAlert()
    .setName('Mongo operator object differential')
    .setRisk(3).setConfidence(2).setCweId(943)
    .setParam(param).setAttack(JSON.stringify({'$ne': String(value)}))
    .setEvidence('A Mongo operator object changed result membership while an equality operator preserved the ordinary result. Both differences repeated.')
    .setMessage(positive.msg).raise();
}

function sameRows(a, b) {
  return JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
}

function probe(helper, originalMessage, originalBody, filter) {
  if (helper.isStop()) return null;
  var copy = originalMessage.cloneRequest();
  var body = JSON.parse(JSON.stringify(originalBody));
  body.filter = filter;
  copy.setRequestBody(JSON.stringify(body));
  copy.getRequestHeader().setContentLength(copy.getRequestBody().length());
  copy.getRequestHeader().setHeader('Accept', 'application/json');
  helper.sendAndReceive(copy, false, false);
  if (copy.getResponseHeader().getStatusCode() !== 200) return null;
  var parsed;
  try { parsed = JSON.parse(String(copy.getResponseBody())); } catch (ignored) { return null; }
  if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length > 20) return null;
  return {msg: copy, rows: parsed.rows.map(function (row) { return JSON.stringify(row); })};
}
