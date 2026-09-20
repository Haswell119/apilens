#!/usr/bin/env python3
"""APILens Web — stdlib-only backend.

Routes:
  GET  /                      -> static/index.html
  GET  /static/<path>         -> static files
  POST /api/checkout          -> create Stripe Checkout Session (one-time Pro license)
  GET  /api/unlock?session_id -> verify payment, issue a signed license key
  GET  /api/verify?key        -> validate a license key (returns plan/email)

Licenses are HMAC-SHA256 signed (stateless — survives restarts, no DB).
Env: STRIPE_SECRET_KEY, LICENSE_SECRET, APP_URL, PRICE_ID.
"""
import base64
import hashlib
import hmac
import json
import os
import posixpath
import re
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")

SK = os.environ.get("STRIPE_SECRET_KEY", "")
LICENSE_SECRET = os.environ.get("LICENSE_SECRET", "")
APP_URL = os.environ.get("APP_URL", "http://localhost:8080").rstrip("/")
PRICE_ID = os.environ.get("PRICE_ID", "")

PLAN = "pro-lifetime"

# Dedicated SEO landing pages (keyword-targeted, each embeds its own working tool).
PAGES = {
    "/jwt-decoder": "jwt-decoder.html",
    "/json-diff": "json-diff.html",
    "/jsonpath": "jsonpath.html",
    "/json-validator": "json-validator.html",
    "/xml-formatter": "xml-formatter.html",
    "/json-to-csv": "json-to-csv.html",
}


# ---------- Stripe (stdlib urllib) ----------

def stripe_call(method, path, data=None):
    url = "https://api.stripe.com" + path
    headers = {"Authorization": "Bearer " + SK}
    body = None
    if data is not None:
        body = urllib.parse.urlencode(data).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def create_checkout_session():
    return stripe_call("POST", "/v1/checkout/sessions", {
        "mode": "payment",
        "customer_creation": "always",
        "line_items[0][price]": PRICE_ID,
        "line_items[0][quantity]": 1,
        "success_url": APP_URL + "/?session_id={CHECKOUT_SESSION_ID}",
        "cancel_url": APP_URL + "/",
        "allow_promotion_codes": "true",
    })


def retrieve_session(session_id):
    return stripe_call("GET", "/v1/checkout/sessions/" + session_id)


# ---------- License (HMAC-signed, stateless) ----------

def b64e(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def b64d(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign(payload: bytes) -> str:
    return b64e(hmac.new(LICENSE_SECRET.encode(), payload, hashlib.sha256).digest())


def issue_license(email: str) -> str:
    payload = json.dumps({"plan": PLAN, "email": email}, separators=(",", ":")).encode()
    return "APL-" + b64e(payload) + "." + sign(payload)


def verify_license(key: str):
    try:
        if not key or not key.startswith("APL-"):
            return {"valid": False, "reason": "malformed"}
        rest = key[4:]
        payload_b64, sig_b64 = rest.split(".", 1)
        payload = b64d(payload_b64)
        expected = sign(payload)
        if not hmac.compare_digest(expected, sig_b64):
            return {"valid": False, "reason": "bad_signature"}
        data = json.loads(payload.decode())
        return {"valid": True, "plan": data.get("plan"), "email": data.get("email")}
    except Exception as e:  # noqa: BLE001
        return {"valid": False, "reason": "invalid: %s" % e}


# ---------- HTTP server ----------

class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store" if ctype.startswith("application/json") else "public, max-age=300")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, obj)

    def _query(self):
        return urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/":
            return self._serve_file("index.html", "text/html; charset=utf-8")
        if path in PAGES:
            return self._serve_file(PAGES[path], "text/html; charset=utf-8")
        if path == "/api/unlock":
            return self.handle_unlock()
        if path == "/api/verify":
            return self.handle_verify()
        if path.startswith("/static/"):
            rel = path[len("/static/"):]
            if ".." in rel or rel.startswith("/"):
                return self._json(400, {"error": "bad path"})
            return self._serve_file(rel)
        if path == "/robots.txt":
            return self._serve_file("robots.txt", "text/plain")
        if path == "/sitemap.xml":
            return self._serve_file("sitemap.xml", "application/xml")
        if re.fullmatch(r"/[0-9a-f]{32}\.txt", path):
            return self._serve_file(path.lstrip("/"), "text/plain")
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/checkout":
            return self.handle_checkout()
        return self._json(404, {"error": "not found"})

    def _serve_file(self, rel, ctype=None):
        full = os.path.normpath(os.path.join(STATIC, rel))
        if not full.startswith(STATIC):
            return self._json(403, {"error": "forbidden"})
        try:
            with open(full, "rb") as f:
                data = f.read()
        except OSError:
            return self._json(404, {"error": "not found"})
        ct = ctype or MIME.get(posixpath.splitext(rel)[1], "application/octet-stream")
        if (ct.startswith("text/") or ct == "application/javascript") and "; charset" not in ct:
            ct += "; charset=utf-8"
        self._send(200, data, ct)

    def handle_checkout(self):
        if not SK or not PRICE_ID:
            return self._json(503, {"error": "payments not configured"})
        try:
            sess = create_checkout_session()
        except Exception as e:  # noqa: BLE001
            return self._json(502, {"error": "stripe error: %s" % e})
        return self._json(200, {"url": sess.get("url"), "id": sess.get("id")})

    def handle_unlock(self):
        session_id = (self._query().get("session_id") or [""])[0]
        if not session_id:
            return self._json(400, {"error": "missing session_id"})
        try:
            sess = retrieve_session(session_id)
        except Exception as e:  # noqa: BLE001
            return self._json(502, {"error": "stripe error: %s" % e})
        status = sess.get("payment_status")
        if status not in ("paid", "no_payment_required"):
            return self._json(402, {"error": "payment not complete", "status": status})
        email = (sess.get("customer_details") or {}).get("email") or ""
        key = issue_license(email)
        return self._json(200, {"license_key": key, "plan": PLAN, "email": email})

    def handle_verify(self):
        key = (self._query().get("key") or [""])[0]
        return self._json(200, verify_license(key))

    def log_message(self, format, *args):  # noqa: A002
        # quiet-ish; keep render logs readable
        pass


MIME = {
    ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".txt": "text/plain", ".md": "text/markdown",
}


def main():
    if not SK:
        print("WARNING: STRIPE_SECRET_KEY not set — /api/checkout disabled.")
    if not LICENSE_SECRET:
        print("WARNING: LICENSE_SECRET not set — license issuance/verification degraded.")
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("APILens Web serving on :%d" % port)
    server.serve_forever()


if __name__ == "__main__":
    main()
