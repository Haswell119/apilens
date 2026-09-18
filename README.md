# APILens — JSON, JWT & API inspector

> Open-source, ad-free, **local-first** tools for inspecting API responses.

APILens auto-formats raw JSON/XML into a searchable, collapsible tree, decodes JWTs at a
click, and copies any request as a cURL command. No account, no analytics, no ads.

**Built as the clean, open-source alternative to the JSON-formatter extensions that went
closed-source and started injecting ads.**

## Try it now (no install)

**[apilens-llau.onrender.com](https://apilens-llau.onrender.com)** — the web app, free.

Paste JSON, XML, or a JWT and it formats instantly in your browser. Nothing is uploaded;
everything runs client-side.

## Features

### Free (web + extension)

- **Format & minify JSON/XML** — auto-detects and renders a syntax-highlighted,
  collapsible tree with search.
- **One-click JWT decode** — any JWT expands into header, payload claims, and signature.
- **Copy as cURL** — export the current request as a ready-to-run `curl` command.
- **Zero tracking** — everything runs locally. No analytics, no telemetry.

### Pro (web, $19 one-time lifetime)

- **JSONPath query** — extract exactly what you need (`$.store.book[?(@.price < 10)].title`).
- **JSON diff** — compare two documents and see every added / removed / changed path.
- **Large-file mode** — raise the cap from 20k nodes / 2 MB to 200k nodes / 20 MB.
- **Lifetime license** — one purchase, delivered instantly, no subscription.

## Install (extension, manual developer load)

1. Clone this repo, or download `dist/apilens-v0.1.0.zip` and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.

A Chrome Web Store listing is not yet published; the web app (above) needs no install.

## Why open source?

The most-installed JSON formatter (2M+ users, 4.5★) went closed-source in 2025 and began
injecting ads. APILens is the opposite: MIT-licensed, readable, and local-first. If we
add a feature you don't like, fork it.

## Privacy

- No analytics, no tracking, no external telemetry.
- Inspected responses are rendered in-page and never uploaded anywhere.
- Source is fully open so you can verify both claims.

## Repo layout

- `web/` — the web app (static frontend + stdlib-only Python backend with Stripe license
  delivery).
- `extension/` — the MV3 Chrome extension.
- `scripts/` — tests and deploy tooling.

## License

MIT. Built by **Meridian Digital**.

## Project status

v0.2.0 — web app live and monetized (free + $19 lifetime Pro). Extension shipped open-source.
