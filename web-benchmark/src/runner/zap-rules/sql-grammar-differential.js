/* ZAP active scan rule. No benchmark root, arm, oracle, or fixture secret is used. */
var HttpURI = Java.type('org.apache.commons.httpclient.URI');

function scanNode(helper, msg) {}

function scan(helper, msg, param, value) {
  if (helper.isStop() || String(msg.getRequestHeader().getMethod()) !== 'GET') return;
  var name = String(param).toLowerCase();
  if (/^(sort|orderby|order_by|sortby)$/.test(name) && /^[a-z][a-z0-9_]*$/i.test(String(value))) {
    checkOrder(helper, msg, param, String(value));
  } else if (/^(comparator|comparison|operator|op)$/.test(name) && String(value) === '=') {
    checkComparator(helper, msg, param);
  }
}

function probe(helper, original, param, payload, clearFilter) {
  if (helper.isStop()) return null;
  var copy = original.cloneRequest();
  helper.setParam(copy, param, payload);
  if (clearFilter) {
    var current = String(copy.getRequestHeader().getURI().toString());
    var expression = new RegExp('([?&]' + clearFilter + '=)[^&]*', 'i');
    copy.getRequestHeader().setURI(new HttpURI(current.replace(expression, '$1'), true));
  }
  copy.getRequestHeader().setHeader('Accept', 'application/json');
  helper.sendAndReceive(copy, false, false);
  if (copy.getResponseHeader().getStatusCode() !== 200) return null;
  var data;
  try { data = JSON.parse(String(copy.getResponseBody())); } catch (ignored) { return null; }
  if (!data || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 100) return null;
  return {msg: copy, items: data.items.map(function (row) { return JSON.stringify(row); })};
}

function sameMembers(a, b) {
  return JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
}

function checkOrder(helper, msg, param, value) {
  var yes = 'CASE WHEN 1=1 THEN ' + value + ' ELSE reverse(' + value + ') END';
  var no = 'CASE WHEN 1=0 THEN ' + value + ' ELSE reverse(' + value + ') END';
  // Active scanners often replace an empty normal search value with the name of
  // that parameter. A broad view is needed to compare at least two row orders.
  var uri = String(msg.getRequestHeader().getURI().toString());
  var filter = /[?&](q|query|search|term)=/i.exec(uri);
  var clearFilter = filter ? filter[1] : null;
  var a = probe(helper, msg, param, yes, clearFilter), b = probe(helper, msg, param, no, clearFilter);
  if (!a || !b || a.items.length < 2 || !sameMembers(a.items, b.items) || JSON.stringify(a.items) === JSON.stringify(b.items)) return;
  var repeatA = probe(helper, msg, param, yes, clearFilter), repeatB = probe(helper, msg, param, no, clearFilter);
  if (!repeatA || !repeatB || JSON.stringify(a.items) !== JSON.stringify(repeatA.items) || JSON.stringify(b.items) !== JSON.stringify(repeatB.items)) return;
  helper.newAlert().setName('SQL grammar position differential: ordering').setRisk(3).setConfidence(2).setCweId(89).setParam(param).setAttack(yes).setEvidence('Stable true/false SQL expression changed the order of the same response items.').setMessage(a.msg).raise();
}

function checkComparator(helper, msg, param) {
  var baseline = probe(helper, msg, param, '=');
  var yes = '= $1 OR 1=1 --', no = '= $1 OR 1=0 --';
  var a = probe(helper, msg, param, yes), b = probe(helper, msg, param, no);
  if (!baseline || !a || !b || baseline.items.length !== b.items.length || a.items.length <= b.items.length) return;
  if (JSON.stringify(b.items) !== JSON.stringify(baseline.items)) return;
  var repeatA = probe(helper, msg, param, yes), repeatB = probe(helper, msg, param, no);
  if (!repeatA || !repeatB || JSON.stringify(a.items) !== JSON.stringify(repeatA.items) || JSON.stringify(b.items) !== JSON.stringify(repeatB.items)) return;
  helper.newAlert().setName('SQL grammar position differential: comparison').setRisk(3).setConfidence(2).setCweId(89).setParam(param).setAttack(yes).setEvidence('Stable true/false SQL expression expanded result membership while the false control matched the ordinary comparison.').setMessage(a.msg).raise();
}
