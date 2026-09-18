#!/usr/bin/env python3
"""Local end-to-end test for APILens Web backend (stdlib only)."""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

WEB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web')  # apilens/web/

# load secrets from /opt/data/.env
ENV = {}
for line in open('/opt/data/.env'):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        ENV[k] = v.strip().strip('"').strip("'")

SK = ENV.get('STRIPE_SECRET_KEY', '')
PRICE = 'price_1UH4w4POfVvcTOq27WiTEOwv'
SECRET = 'test-secret-123'

# --- import server module functions ---
sys.path.insert(0, WEB)
import server as srv
srv.SK = SK
srv.PRICE_ID = PRICE
srv.LICENSE_SECRET = SECRET
srv.APP_URL = 'http://localhost:8099'

print('1) license roundtrip')
key = srv.issue_license('dev@example.com')
print('   key:', key[:24] + '…')
res = srv.verify_license(key)
assert res['valid'] is True, res
assert res['plan'] == 'pro-lifetime', res
assert res['email'] == 'dev@example.com', res
res_bad = srv.verify_license(key[:-1] + ('A' if key[-1] != 'A' else 'B'))
assert res_bad['valid'] is False, res_bad
res_garbage = srv.verify_license('not-a-key')
assert res_garbage['valid'] is False, res_garbage
print('   OK (roundtrip, tamper, garbage all handled)')

print('2) checkout session creation (live Stripe, no charge)')
if SK:
    sess = srv.create_checkout_session()
    assert sess.get('url') and sess.get('id'), sess
    print('   session id:', sess['id'][:16] + '…', 'url present:', bool(sess.get('url')))
else:
    print('   SKIPPED (no key)')

print('3) HTTP server end-to-end')
proc = subprocess.Popen(
    [sys.executable, 'server.py'],
    cwd=WEB,
    env=dict(os.environ, STRIPE_SECRET_KEY=SK, LICENSE_SECRET=SECRET,
             APP_URL='http://localhost:8099', PRICE_ID=PRICE, PORT='8099'),
    stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(1.5)

def get(path):
    try:
        with urllib.request.urlopen('http://localhost:8099' + path, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def post(path):
    req = urllib.request.Request('http://localhost:8099' + path, data=b'', method='POST')
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

s1, body1 = get('/')
assert s1 == 200 and 'APILens' in body1, (s1, body1[:100])
print('   GET / ->', s1, '(index served)')

s2, _ = get('/static/app.js')
assert s2 == 200, s2
print('   GET /static/app.js ->', s2)

s3, body3 = get('/api/verify?key=' + key.replace('.', '.'))
assert s3 == 200, s3
assert json.loads(body3)['valid'] is True, body3
print('   GET /api/verify (valid) ->', s3, 'valid=True')

if SK:
    s4, body4 = post('/api/checkout')
    assert s4 == 200, (s4, body4)
    assert json.loads(body4).get('url'), body4
    print('   POST /api/checkout ->', s4, '(checkout URL returned)')

s5, body5 = get('/api/unlock?session_id=cs_test_nonexistent')
assert s5 in (402, 502), (s5, body5)
print('   GET /api/unlock (bad session) ->', s5, '(correctly refused)')

proc.terminate()
proc.wait(timeout=5)
print('ALL TESTS PASSED')
