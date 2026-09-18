#!/usr/bin/env python3
"""Create APILens Pro Stripe product, prices, and payment links (stdlib only)."""
import json, urllib.parse, urllib.request

def env(key):
    for line in open('/opt/data/.env'):
        line = line.strip()
        if line.startswith(key + '='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

SK = env('STRIPE_SECRET_KEY')
if not SK:
    raise SystemExit('STRIPE_SECRET_KEY not found in /opt/data/.env')

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
    'name': 'APILens Pro',
    'description': 'APILens Pro — power features for the open-source API response inspector (large files, JSONPath/jq query, diff, saved snippets).',
})
price_m = call('POST', '/v1/prices', {
    'product': prod['id'], 'currency': 'usd', 'unit_amount': 400,
    'recurring[interval]': 'month',
})
price_y = call('POST', '/v1/prices', {
    'product': prod['id'], 'currency': 'usd', 'unit_amount': 2900,
    'recurring[interval]': 'year',
})
link_m = call('POST', '/v1/payment_links', {
    'line_items[0][price]': price_m['id'], 'line_items[0][quantity]': 1,
})
link_y = call('POST', '/v1/payment_links', {
    'line_items[0][price]': price_y['id'], 'line_items[0][quantity]': 1,
})

print(json.dumps({
    'product': prod['id'],
    'price_monthly': price_m['id'],
    'price_yearly': price_y['id'],
    'link_monthly': link_m['url'],
    'link_yearly': link_y['url'],
}, indent=2))
