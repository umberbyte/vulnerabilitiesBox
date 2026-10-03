/* ZAP active scan rule. Probes a public uid field without fixture secrets. */
function scanNode(helper, msg) {}

function scan(helper, msg, param, value) {
  if (helper.isStop() || String(msg.getRequestHeader().getMethod()) !== 'POST') return;
  if (String(param).toLowerCase() !== 'uid' || !/^[a-z0-9._-]{1,24}$/i.test(String(value))) return;
  var normal = String(value);
  var yes = normal + ')(uid=*';
  var no = normal + ')(uid=zzzzbenchmarknomatch';
  var baseline = probe(helper, msg, param, normal);
  var positive = probe(helper, msg, param, yes);
  var negative = probe(helper, msg, param, no);
  if (!baseline || !positive || !negative || baseline.rows.length < 1) return;
  if (!sameRows(baseline.rows, negative.rows) || positive.rows.length <= negative.rows.length) return;
  var repeatedPositive = probe(helper, msg, param, yes);
  var repeatedNegative = probe(helper, msg, param, no);
  if (!repeatedPositive || !repeatedNegative) return;
  if (!sameRows(positive.rows, repeatedPositive.rows) || !sameRows(negative.rows, repeatedNegative.rows)) return;
  helper.newAlert()
    .setName('LDAP filter grammar differential')
    .setRisk(3).setConfidence(2).setCweId(90)
    .setParam(param).setAttack(yes)
    .setEvidence('A wildcard filter branch expanded the returned row set; a no-match branch preserved the ordinary result. Both differences repeated.')
    .setMessage(positive.msg).raise();
}

function sameRows(a, b) {
  return JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
}

function probe(helper, original, param, payload) {
  if (helper.isStop()) return null;
  var copy = original.cloneRequest();
  helper.setParam(copy, param, payload);
  copy.getRequestHeader().setHeader('Accept', 'application/json');
  helper.sendAndReceive(copy, false, false);
  if (copy.getResponseHeader().getStatusCode() !== 200) return null;
  var parsed;
  try { parsed = JSON.parse(String(copy.getResponseBody())); } catch (ignored) { return null; }
  if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length > 20) return null;
  return {msg: copy, rows: parsed.rows.map(function (row) { return JSON.stringify(row); })};
}
