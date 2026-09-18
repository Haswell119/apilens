#!/usr/bin/env python3
"""Create the APILens Web Render service + set env vars (stdlib urllib)."""
import json
import os
import secrets
import urllib.request
import urllib.error

def env(key):
    for line in open('/opt/data/.env'):
        line = line.strip()
        if line.startswith(key + '='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

RENDER_KEY = env('RENDER_API_KEY')
STRIPE_SK = env('STRIPE_SECRET_KEY')
if not RENDER_KEY or not STRIPE_SK:
    raise SystemExit('missing RENDER_API_KEY / STRIPE_SECRET_KEY')

OWNER = 'tea-damgo1gu01pc73a7d7eg'
PRICE_ID = 'price_1UH4w4POfVvcTOq27WiTEOwv'

# generate + persist a LICENSE_SECRET if not already present
LICENSE_SECRET = env('LICENSE_SECRET')
if not LICENSE_SECRET:
    LICENSE_SECRET = secrets.token_hex(32)
    with open('/opt/data/.env', 'a') as f:
        f.write('\nLICENSE_SECRET=%s\n' % LICENSE_SECRET)
    print('generated LICENSE_SECRET -> /opt/data/.env')

def call(method, url, data=None):
    body = None
    headers = {'Authorization': 'Bearer ' + RENDER_KEY, 'Accept': 'application/json'}
    if data is not None:
        body = json.dumps(data).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

# 1) create service
status, svc = call('POST', 'https://api.render.com/v1/services', {
    'type': 'web_service',
    'name': 'apilens',
    'ownerId': OWNER,
    'repo': 'https://github.com/Haswell119/apilens',
    'branch': 'main',
    'rootDir': 'web',
    'autoDeploy': 'yes',
    'serviceDetails': {
        'env': 'python',
        'runtime': 'python',
        'region': 'frankfurt',
        'plan': 'free',
        'numInstances': 1,
        'healthCheckPath': '/',
        'envSpecificDetails': {
            'buildCommand': 'pip install -r requirements.txt',
            'startCommand': 'python server.py',
        },
    },
})
if status not in (200, 201):
    raise SystemExit('create failed %s: %s' % (status, svc))
sid = svc.get('id')
print('service created:', sid, 'status', status)

# 2) set env vars (endpoint PUT /v1/services/{id}/env-vars)
url = svc.get('serviceDetails', {}).get('url', '')
app_url = url or 'https://apilens.onrender.com'
status2, ev = call('PUT', 'https://api.render.com/v1/services/%s/env-vars' % sid, [
    {'key': 'STRIPE_SECRET_KEY', 'value': STRIPE_SK},
    {'key': 'LICENSE_SECRET', 'value': LICENSE_SECRET},
    {'key': 'PRICE_ID', 'value': PRICE_ID},
    {'key': 'APP_URL', 'value': app_url},
    {'key': 'PYTHON_VERSION', 'value': '3.13.5'},
])
print('env-vars set:', status2, ev if status2 not in (200, 201) else 'ok')

# 3) trigger a deploy (first deploy auto-starts on creation; but ensure)
status3, dep = call('POST', 'https://api.render.com/v1/services/%s/deploys' % sid, {})
print('deploy triggered:', status3)

print(json.dumps({'service_id': sid, 'url': app_url}, indent=2))
