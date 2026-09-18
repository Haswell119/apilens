# APILens — JSON, JWT & API inspector

> Open-source, ad-free, **100% local** browser extension for inspecting API responses.

APILens auto-formats raw JSON/XML into a searchable, collapsible tree, decodes JWTs at a
click, and copies any request as a cURL command. No account, no server, no analytics, no
ads. Your data never leaves your machine.

**Built as the clean, open-source alternative to the JSON-formatter extensions that went
closed-source and started injecting ads.**

## Features

- **Auto-format JSON & XML** — open a raw `.json`/`.xml` endpoint and it renders as a
  syntax-highlighted, collapsible tree with search.
- **One-click JWT decode** — any JWT string in the tree (or pasted) expands into its
  header, payload claims, and signature. No more copy-pasting into jwt.io.
- **Inspect any tab** — click the icon to fetch the current URL, see status + content-type +
  size + timing, and format the response.
- **Copy as cURL** — export the current request as a ready-to-run `curl` command.
- **Response headers** — list every response header for quick debugging.
- **Zero tracking** — everything runs locally in the browser. The only network calls are
  the ones you trigger against the APIs you're inspecting.

## Install

**Chrome Web Store** — coming soon (first release under review).

**Manual (developer load):**
1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.

## Why open source?

The most-installed JSON formatter (2M+ users, 4.5★) went closed-source in 2025 and began
injecting ads. APILens is the opposite: MIT-licensed, readable, and local-first. If we
ever add a feature you don't like, fork it.

## Pricing

APILens is free for core use. **APILens Pro** ($4/mo or $29/yr) funds ongoing development
and unlocks power features: large-file mode, JSONPath/jq queries, JSON diff, and saved
snippets.

- Monthly: https://buy.stripe.com/eVqaEZ3Bm2LTdBG1TxgUM02
- Yearly: https://buy.stripe.com/6oU8wRb3OgCJapucybgUM03

## Privacy

- No analytics, no tracking, no external telemetry.
- Inspected responses are rendered in-page and never uploaded anywhere.
- Source is fully open so you can verify both claims.

## License

MIT. Built by [Meridian Digital](https://meridian.digital).

## Project status

v0.1.0 — free core shipped. Pro features (large-file mode, JSONPath, diff, snippets)
landing next.
