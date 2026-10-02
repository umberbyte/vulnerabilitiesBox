"""Probe runner API compatibility inside ZAP; sends no requests to the app."""
import json
import re
import urllib.parse
import urllib.request

key = re.search(rb"api.key=([0-9a-f]+)", open("/proc/1/cmdline", "rb").read()).group(1).decode()
checks = [
    ("core", "view", "version", {}),
    ("core", "action", "setMode", {"mode": "protect"}),
    ("core", "action", "excludeFromProxy", {"regex": "^(?!https://app:8443(?:/|$)).*"}),
    ("pscan", "action", "setScanOnlyInScope", {"onlyInScope": "true"}),
    ("spider", "action", "setOptionThreadCount", {"Integer": 2}),
    ("spider", "action", "setOptionMaxDuration", {"Integer": 1}),
    ("spider", "action", "setOptionMaxDepth", {"Integer": 4}),
    ("spider", "action", "setOptionMaxChildren", {"Integer": 15}),
    ("spider", "action", "setOptionProcessForm", {"Boolean": "false"}),
    ("spider", "action", "setOptionPostForm", {"Boolean": "false"}),
    ("spider", "action", "excludeFromScan", {"regex": "^(?!https://app:8443/w/123456abcdef(?:/|\\?|$)).*"}),
    ("ascan", "action", "setOptionThreadPerHost", {"Integer": 2}),
    ("ascan", "action", "setOptionHostPerScan", {"Integer": 1}),
    ("ascan", "action", "setOptionDelayInMs", {"Integer": 50}),
    ("ascan", "action", "setOptionMaxScanDurationInMins", {"Integer": 2}),
    ("ascan", "action", "setOptionMaxRuleDurationInMins", {"Integer": 1}),
    ("network", "action", "setConnectionTimeout", {"timeout": 5}),
    ("network", "action", "setUseGlobalHttpState", {"use": "false"}),
    ("pscan", "view", "recordsToScan", {}),
    ("autoupdate", "view", "installedAddons", {}),
    ("ascan", "view", "scanners", {}),
    ("pscan", "view", "scanners", {}),
    ("spider", "view", "optionThreadCount", {}),
    ("ascan", "view", "optionThreadPerHost", {}),
    ("spider", "action", "stopAllScans", {}),
    ("ascan", "action", "stopAllScans", {}),
    ("script", "view", "listEngines", {}),
    ("script", "view", "listTypes", {}),
]
passed = []
for component, kind, name, params in checks:
    url = f"http://localhost:8090/JSON/{component}/{kind}/{name}/?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"X-ZAP-API-Key": key})
    value = json.load(urllib.request.urlopen(request, timeout=10))
    if "code" in value:
        raise RuntimeError(f"{component}/{name}: {value['code']}")
    passed.append(component + "/" + name)
print(json.dumps({"passed": len(passed), "checks": passed, "appRequestsIssued": 0}, indent=2))
