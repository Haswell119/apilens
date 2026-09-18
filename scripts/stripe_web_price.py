#!/usr/bin/env python3
"""Create APILens Pro (Web) Stripe product + one-time $19 price (stdlib urllib)."""
import json, os, urllib.parse, urllib.request

def env(key):
    for line in open('/opt/data/.env'):
        line = line.strip()
        if line.startswith(key + '='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

SK = env('STRIPE_SECRET_KEY')
if not SK:
    raise SystemExit('STRIPE_SECRET_KEY not found')

def call(method, path, data=None):
    url = 'https://api.stripe.com' + path
    headers = {'Authorization': 'Bearer ' + SK}
    body = None
    if data is not None:
        body = urllib.parse.urlencode(data).encode()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

prod = call('POST', '/v1/products', {
    'name': 'APILens Pro (Web)',
    'description': 'APILens Pro — lifetime license for the open-source JSON/JWT inspector (JSONPath query, JSON diff, large-file mode).',
    'metadata[brand]': 'Meridian Digital',
})
price = call('POST', '/v1/prices', {
    'product': prod['id'],
    'currency': 'usd',
    'unit_amount': 1900,
    'metadata[plan]': 'pro-lifetime',
})

print(json.dumps({'product': prod['id'], 'price': price['id'], 'amount': price['unit_amount'], 'currency': price['currency'], 'active': price['active']}, indent=2))
