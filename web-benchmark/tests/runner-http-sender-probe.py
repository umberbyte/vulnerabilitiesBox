"""Live ZAP/Graal probe with an in-container loopback fixture, never the app."""
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

api_key = re.search(rb"api.key=([0-9a-f]+)", open("/proc/1/cmdline", "rb").read()).group(1).decode()
api_base = "http://127.0.0.1:8090/JSON/"
fixture_base = "http://127.0.0.1:8092"
script_name = "benchmark-isolated-auth-probe"
script_path = "/tmp/benchmark-isolated-auth-probe.js"
fixture_cookie = "sid=fixture-probe"
fixture_bearer = "Bearer fixture-probe"
count = 0

class Echo(BaseHTTPRequestHandler):
    def do_GET(self):
        global count
        count += 1
        body = json.dumps({"cookie": self.headers.get("Cookie"), "authorization": self.headers.get("Authorization")}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

def api(component, kind, name, params=None):
    url = api_base + component + "/" + kind + "/" + name + "/?" + urllib.parse.urlencode(params or {})
    request = urllib.request.Request(url, headers={"X-ZAP-API-Key": api_key})
    value = json.load(urllib.request.urlopen(request, timeout=10))
    if "code" in value:
        raise RuntimeError(component + "/" + name + ": " + value["code"])
    return value

server = ThreadingHTTPServer(("127.0.0.1", 8092), Echo)
threading.Thread(target=server.serve_forever, daemon=True).start()
source = """var selectedWorkspace=Java.type('java.util.regex.Pattern').compile('^http://127\\\\.0\\\\.0\\\\.1:8092/selected(?:/.*|$)');
var fixtureCookie='sid=fixture-probe';
var fixtureBearer='Bearer fixture-probe';
function sendingRequest(msg,initiator,helper) {
  var headers=msg.getRequestHeader();
  if (!selectedWorkspace.matcher(String(headers.getURI().toString())).matches()) return;
  if (fixtureCookie && headers.getHeader('Cookie') === null) headers.setHeader('Cookie',fixtureCookie);
  if (fixtureBearer && headers.getHeader('Authorization') === null) headers.setHeader('Authorization',fixtureBearer);
}
function responseReceived(msg,initiator,helper) {}
"""
passed = []
loaded = False
try:
    started = time.monotonic()
    while True:
        try:
            version = api("core", "view", "version")["version"]
            break
        except Exception:
            if time.monotonic() - started > 90:
                raise RuntimeError("ZAP API did not become ready")
            time.sleep(1)
    engines = api("script", "view", "listEngines")
    types = api("script", "view", "listTypes")
    if "Graal.js" not in json.dumps(engines) or "httpsender" not in json.dumps(types):
        raise RuntimeError("Required Graal.js HttpSender support is unavailable")
    with open(script_path, "w", encoding="utf-8") as file:
        file.write(source)
    api("network", "action", "setUseGlobalHttpState", {"use": "false"})
    api("script", "action", "load", {"scriptName": script_name, "scriptType": "httpsender", "scriptEngine": "Graal.js", "fileName": script_path, "charset": "UTF-8"})
    loaded = True
    api("script", "action", "enable", {"scriptName": script_name})
    cases = [
        ("missing headers", "/selected/normal", {}, fixture_cookie, fixture_bearer),
        ("present invalid Cookie", "/selected/cookie", {"Cookie": "sid=invalid-probe"}, "sid=invalid-probe", fixture_bearer),
        ("present invalid bearer", "/selected/bearer", {"Authorization": "Bearer invalid-probe"}, fixture_cookie, "Bearer invalid-probe"),
        ("empty Cookie", "/selected/empty-cookie", {"Cookie": ""}, "", fixture_bearer),
        ("empty bearer", "/selected/empty-bearer", {"Authorization": ""}, fixture_cookie, ""),
        ("case insensitive headers", "/selected/case", {"cOoKiE": "different-cookie", "aUtHoRiZaTiOn": "different-bearer"}, "different-cookie", "different-bearer"),
        ("off-scope path", "/outside", {}, None, None),
        ("neighboring prefix", "/selected-extra", {}, None, None),
    ]
    for label, path, headers, expected_cookie, expected_bearer in cases:
        raw = "GET " + fixture_base + path + " HTTP/1.1\r\nHost: 127.0.0.1:8092\r\n" + "".join(name + ": " + value + "\r\n" for name, value in headers.items()) + "\r\n"
        messages = api("core", "action", "sendRequest", {"request": raw, "followRedirects": "false"})["sendRequest"]
        response = json.loads(messages[0]["responseBody"])
        if response != {"cookie": expected_cookie, "authorization": expected_bearer}:
            raise RuntimeError("Header preservation failed: " + label)
        passed.append(label)
    response = api("core", "action", "accessUrl", {"url": fixture_base + "/selected/access-url", "followRedirects": "false"})["accessUrl"][0]
    if json.loads(response["responseBody"]) != {"cookie": fixture_cookie, "authorization": fixture_bearer}:
        raise RuntimeError("accessUrl did not use the HttpSender policy")
    passed.append("core.accessUrl manual initiator")
    api("script", "action", "disable", {"scriptName": script_name})
    api("script", "action", "remove", {"scriptName": script_name})
    loaded = False
    response = api("core", "action", "accessUrl", {"url": fixture_base + "/selected/removed", "followRedirects": "false"})["accessUrl"][0]
    if json.loads(response["responseBody"]) != {"cookie": None, "authorization": None}:
        raise RuntimeError("Removed script still supplied headers")
    passed.append("disable/remove cleanup")
    print(json.dumps({"schema": "benchmark-isolated-auth-api-probe-0.1", "toolVersion": version, "passed": len(passed), "checks": passed, "loopbackFixtureRequests": count, "benchmarkAppRequests": 0, "secretValues": "dummy fixture values only", "scope": "isolated container --network none; in-container127.0.0.1:8092 only"}, indent=2))
finally:
    if loaded:
        try:
            api("script", "action", "disable", {"scriptName": script_name})
            api("script", "action", "remove", {"scriptName": script_name})
        except Exception:
            pass
    server.shutdown()
    if os.path.exists(script_path):
        os.remove(script_path)
