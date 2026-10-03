/* ZAP active scan rule. Tests whether a user-selected HTML attribute name
 * can become an executable event handler. It does not use private truth data. */
var HttpURI = Java.type('org.apache.commons.httpclient.URI');
function scanNode(helper, msg) {}

function scan(helper, msg, param, value) {
  if (helper.isStop() || String(msg.getRequestHeader().getMethod()) !== 'GET') return;
  if (String(param).toLowerCase() !== 'attrname' || String(value) !== 'title') return;
  if (!/(?:[?&])attrValue=/i.test(String(msg.getRequestHeader().getURI()))) return;
  var normal = probe(helper, msg, param, 'title', 'Open details');
  var event = probe(helper, msg, param, 'onclick', 'this.dataset.benchmarkprobe=1');
  if (!normal || !event || !hasAttribute(normal.body, 'title', 'Open details')) return;
  if (hasAttribute(normal.body, 'onclick', 'this.dataset.benchmarkprobe=1')) return;
  if (!hasAttribute(event.body, 'onclick', 'this.dataset.benchmarkprobe=1')) return;
  var repeated = probe(helper, msg, param, 'onclick', 'this.dataset.benchmarkprobe=1');
  if (!repeated || !hasAttribute(repeated.body, 'onclick', 'this.dataset.benchmarkprobe=1')) return;
  helper.newAlert()
    .setName('User-selected HTML event attribute')
    .setRisk(3).setConfidence(2).setCweId(79)
    .setParam(param).setAttack('onclick')
    .setEvidence('An ordinary title attribute was replaced by an onclick attribute containing a harmless JavaScript assignment. The generated event attribute persisted on repeat.')
    .setMessage(event.msg).raise();
}

function hasAttribute(body, name, value) {
  // Only a real HTML start tag qualifies; reflected form values and text do not.
  var tags = body.match(/<[a-z][a-z0-9-]*\b[^>]*>/gi) || [];
  var needle = ' ' + name + '="' + value + '"';
  return tags.some(function (tag) { return tag.indexOf(needle) >= 0; });
}

function probe(helper, original, param, attributeName, attributeValue) {
  if (helper.isStop()) return null;
  var copy = original.cloneRequest();
  helper.setParam(copy, param, attributeName);
  // helper.setParam targets the scanner's selected parameter position, so a
  // second call can accidentally replace attrName with another attrValue.
  var current = String(copy.getRequestHeader().getURI().toString());
  var expression = /([?&])attrValue=[^&]*/i;
  if (!expression.test(current)) return null;
  var encoded = encodeURIComponent(attributeValue).replace(/%20/g, '+');
  copy.getRequestHeader().setURI(new HttpURI(current.replace(expression, '$1attrValue=' + encoded), true));
  copy.getRequestHeader().setHeader('Accept', 'text/html');
  helper.sendAndReceive(copy, false, false);
  if (copy.getResponseHeader().getStatusCode() !== 200) return null;
  var contentType = String(copy.getResponseHeader().getHeader('Content-Type') || '');
  if (!/^text\/html\b/i.test(contentType)) return null;
  var body = String(copy.getResponseBody());
  if (body.length > 100000) return null;
  return {msg: copy, body: body};
}
