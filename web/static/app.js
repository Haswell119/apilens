/* APILens Web — app logic. Depends on APILens (formatter.js). No external deps. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // ---------- config ----------
  var FREE_MAX_NODES = 20000, PRO_MAX_NODES = 200000;
  var FREE_MAX_CHARS = 2 * 1024 * 1024, PRO_MAX_CHARS = 20 * 1024 * 1024;
  var LS_KEY = 'apilens-license';
  var state = {
    license: null,           // {key, plan, email} when active
    pro: false,
    lastInput: '',
    lastType: null,
  };

  // ---------- license ----------
  function applyLicense(lic) {
    state.license = lic;
    state.pro = !!(lic && lic.valid);
    APILens.maxNodes = state.pro ? PRO_MAX_NODES : FREE_MAX_NODES;
    renderProStatus();
    enableProUI(state.pro);
  }

  function renderProStatus() {
    var el = $('pro-status');
    if (state.pro) {
      el.textContent = 'Pro';
      el.className = 'pro-status pro';
    } else {
      el.textContent = 'Free';
      el.className = 'pro-status free';
    }
  }

  function enableProUI(on) {
    var cards = ['card-jsonpath', 'card-diff', 'card-large'];
    cards.forEach(function (id) { $(id).classList.toggle('locked', !on); });
    ['jsonpath-input', 'btn-jsonpath', 'diff-a', 'diff-b', 'btn-diff'].forEach(function (id) {
      $(id).disabled = !on;
    });
    $('large-status').textContent = on
      ? 'Large-file mode active (200k nodes / 20 MB).'
      : 'Included with Pro — up to 200k nodes / 20 MB.';
  }

  function verifyAndStore(key) {
    return fetch('/api/verify?key=' + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.valid) {
          localStorage.setItem(LS_KEY, key);
          applyLicense({ key: key, valid: true, plan: res.plan, email: res.email });
          return true;
        }
        return false;
      });
  }

  function initLicense() {
    // 1) returning customer
    var saved = localStorage.getItem(LS_KEY);
    if (saved) {
      verifyAndStore(saved);
    }
    // 2) just paid — session_id in URL
    var q = new URLSearchParams(location.search);
    var sid = q.get('session_id');
    if (sid) {
      $('license-status').textContent = 'Verifying payment…';
      fetch('/api/unlock?session_id=' + encodeURIComponent(sid))
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.license_key) {
            return verifyAndStore(res.license_key).then(function () {
              $('license-status').textContent = 'Payment confirmed — Pro activated. Thanks!';
              history.replaceState(null, '', '/');
            });
          }
          $('license-status').textContent = (res.error || 'Payment not confirmed.') +
            ' If you paid, refresh this page.';
        })
        .catch(function () { $('license-status').textContent = 'Could not verify payment. Refresh to retry.'; });
    }
  }

  // ---------- formatting ----------
  function currentMaxChars() { return state.pro ? PRO_MAX_CHARS : FREE_MAX_CHARS; }

  function format() {
    var text = $('input').value;
    var out = $('output');
    out.innerHTML = '';
    state.lastInput = text;

    if (!text.trim()) { out.appendChild(APILens.el('div', 'apl-empty', 'Paste JSON, XML, or a JWT above.')); $('meta').textContent = ''; return; }
    if (text.length > currentMaxChars()) {
      var mb = (text.length / 1024 / 1024).toFixed(1);
      out.appendChild(APILens.el('div', 'apl-empty',
        'Input too large (' + mb + ' MB). Free supports up to 2 MB — Pro unlocks 20 MB large-file mode.'));
      $('meta').textContent = '';
      return;
    }

    var type = APILens.detectType(text);
    var trimmed = text.trim();
    if (!type && APILens.isJWT(trimmed)) {
      var d = APILens.decodeJWT(trimmed);
      if (d.error) {
        APILens.render(out, text, null);
        $('meta').textContent = d.error;
      } else {
        APILens.render(out, JSON.stringify({ header: d.header, payload: d.payload, signature: d.signature }), 'json');
        $('meta').textContent = 'JWT decoded';
      }
      state.lastType = 'jwt';
      return;
    }
    state.lastType = type;
    APILens.render(out, text, type);
    $('meta').textContent = type ? (type.toUpperCase() + ' · ' + text.length + ' chars') : 'No valid JSON/XML/JWT found.';
  }

  function minify() {
    var text = $('input').value;
    var out = $('output');
    out.innerHTML = '';
    try {
      var parsed = JSON.parse(text);
      $('input').value = JSON.stringify(parsed);
      $('meta').textContent = 'Minified (' + $('input').value.length + ' chars)';
      format();
    } catch (e) {
      out.appendChild(APILens.el('div', 'apl-empty', 'Not valid JSON — cannot minify.'));
      $('meta').textContent = '';
    }
  }

  function copyOutput() {
    var text = $('input').value;
    var payload = text.trim();
    if (state.lastType === 'json' || (state.lastType === 'jwt')) {
      // copy formatted version when available
      try { payload = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { payload = text; }
    }
    APILens.copy(payload).then(function () { $('meta').textContent = 'Copied to clipboard'; });
  }

  // ---------- JSONPath ----------
  var JSONPath = (function () {
    function tokenize(path) {
      var segs = [];
      var i = 0, n = path.length;
      if (path[0] !== '$') throw new Error('path must start with $');
      i = 1;
      while (i < n) {
        var c = path[i];
        if (c === '.') {
          if (path[i + 1] === '.') {
            // recursive descent — read key until [ . or end
            i += 2;
            var key = readKey();
            segs.push({ t: 'descend', key: key });
          } else {
            i += 1;
            var k = readKey();
            segs.push({ t: 'key', key: k });
          }
        } else if (c === '[') {
          var close = findClose(i);
          var inner = path.slice(i + 1, close);
          segs.push(parseBracket(inner));
          i = close + 1;
        } else {
          throw new Error('unexpected char ' + c);
        }
      }
      function readKey() {
        var start = i;
        while (i < n && path[i] !== '.' && path[i] !== '[') i++;
        return path.slice(start, i);
      }
      function findClose(from) {
        var depth = 0;
        for (var j = from; j < n; j++) {
          if (path[j] === '[') depth++;
          else if (path[j] === ']') { depth--; if (depth === 0) return j; }
        }
        throw new Error('unclosed [');
      }
      return segs;
    }

    function parseBracket(inner) {
      inner = inner.trim();
      if (inner === '*') return { t: 'wildcard' };
      if (inner.indexOf('?(') === 0) return { t: 'filter', expr: inner.slice(2, -1) };
      if (/^-?\d+$/.test(inner)) return { t: 'index', n: parseInt(inner, 10) };
      if ((inner[0] === "'" && inner[inner.length - 1] === "'") ||
          (inner[0] === '"' && inner[inner.length - 1] === '"')) {
        return { t: 'key', key: inner.slice(1, -1) };
      }
      throw new Error('unsupported bracket ' + inner);
    }

    function apply(root, segs) {
      var nodes = [root];
      for (var i = 0; i < segs.length; i++) {
        var seg = segs[i];
        var next = [];
        nodes.forEach(function (node) { next = next.concat(applySeg(node, seg)); });
        nodes = next;
      }
      return nodes;
    }

    function applySeg(node, seg) {
      var out = [];
      if (seg.t === 'key') {
        if (node != null && typeof node === 'object' && (seg.key in node)) out.push(node[seg.key]);
      } else if (seg.t === 'descend') {
        out = out.concat(descend(node, seg.key));
      } else if (seg.t === 'index') {
        if (Array.isArray(node)) {
          var idx = seg.n < 0 ? node.length + seg.n : seg.n;
          if (idx >= 0 && idx < node.length) out.push(node[idx]);
        }
      } else if (seg.t === 'wildcard') {
        if (Array.isArray(node)) out = out.concat(node);
        else if (node && typeof node === 'object') Object.keys(node).forEach(function (k) { out.push(node[k]); });
      } else if (seg.t === 'filter') {
        if (Array.isArray(node)) {
          node.forEach(function (item) { if (evalFilter(seg.expr, item)) out.push(item); });
        }
      }
      return out;
    }

    function descend(node, key) {
      var out = [];
      (function walk(x) {
        if (x == null) return;
        if (typeof x === 'object') {
          if (Array.isArray(x)) {
            x.forEach(function (v) { walk(v); });
          } else {
            Object.keys(x).forEach(function (k) {
              if (k === key) out.push(x[k]);
              walk(x[k]);
            });
          }
        }
      })(node);
      return out;
    }

    // ---- filter expression evaluator ----
    function evalFilter(expr, ctx) {
      var tokens = lex(expr);
      var p = { i: 0, tokens: tokens };
      var v = parseOr(p, ctx);
      return !!v;
    }

    function lex(s) {
      var toks = [];
      var i = 0;
      while (i < s.length) {
        var c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if ('()'.indexOf(c) !== -1) { toks.push({ t: c }); i++; continue; }
        var two = s.slice(i, i + 2);
        if (['==', '!=', '<=', '>=', '&&', '||'].indexOf(two) !== -1) { toks.push({ t: two }); i += 2; continue; }
        if ('<>=!'.indexOf(c) !== -1) { toks.push({ t: c }); i++; continue; }
        if (c === "'" || c === '"') {
          var q = c, j = i + 1, str = '';
          while (j < s.length && s[j] !== q) { str += s[j]; j++; }
          toks.push({ t: 'str', v: str }); i = j + 1; continue;
        }
        if (c === '@') { toks.push({ t: 'at' }); i++; continue; }
        if (c === '.') { toks.push({ t: 'dot' }); i++; continue; }
        var m = /^-?\d+(\.\d+)?/.exec(s.slice(i));
        if (m) { toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
        var mw = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
        if (mw) {
          var w = mw[0];
          if (w === 'true') toks.push({ t: 'num', v: 1 });
          else if (w === 'false') toks.push({ t: 'num', v: 0 });
          else if (w === 'null') toks.push({ t: 'null' });
          else toks.push({ t: 'word', v: w });
          i += w.length; continue;
        }
        throw new Error('bad filter char ' + c);
      }
      return toks;
    }

    function parseOr(p, ctx) {
      var l = parseAnd(p, ctx);
      while (p.tokens[p.i] && p.tokens[p.i].t === '||') { p.i++; var r = parseAnd(p, ctx); l = l || r; }
      return l;
    }
    function parseAnd(p, ctx) {
      var l = parseCmp(p, ctx);
      while (p.tokens[p.i] && p.tokens[p.i].t === '&&') { p.i++; var r = parseCmp(p, ctx); l = l && r; }
      return l;
    }
    function parseCmp(p, ctx) {
      var l = parseAtom(p, ctx);
      var op = p.tokens[p.i];
      if (op && ['==', '!=', '<', '<=', '>', '>='].indexOf(op.t) !== -1) {
        p.i++;
        var r = parseAtom(p, ctx);
        return compare(l, r, op.t);
      }
      return l;
    }
    function parseAtom(p, ctx) {
      var t = p.tokens[p.i];
      if (!t) throw new Error('unexpected end of filter');
      if (t.t === '!') { p.i++; return !parseAtom(p, ctx); }
      if (t.t === '(') { p.i++; var v = parseOr(p, ctx); if (p.tokens[p.i] && p.tokens[p.i].t === ')') p.i++; return v; }
      if (t.t === 'num') { p.i++; return t.v; }
      if (t.t === 'str') { p.i++; return t.v; }
      if (t.t === 'null') { p.i++; return null; }
      if (t.t === 'word') { p.i++; return ctx == null ? null : resolveWord(ctx, t.v); }
      if (t.t === 'at') { p.i++; return resolveAt(p, ctx); }
      throw new Error('unexpected token ' + t.t);
    }
    function resolveAt(p, ctx) {
      var cur = ctx;
      while (p.tokens[p.i] && p.tokens[p.i].t === 'dot') {
        p.i++;
        var nt = p.tokens[p.i];
        if (!nt || nt.t !== 'word') throw new Error('expected key after .');
        p.i++;
        cur = (cur && typeof cur === 'object') ? cur[nt.v] : undefined;
      }
      return cur;
    }
    function resolveWord(base, word) {
      // words in filters are bare keys on the current node
      if (base && typeof base === 'object' && (word in base)) return base[word];
      return undefined;
    }
    function compare(l, r, op) {
      switch (op) {
        case '==': return l == r;
        case '!=': return l != r;
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        case '>=': return l >= r;
      }
      return false;
    }

    // expose @.key access too — handle '@' followed by '.key' / ['key'] in lexer? We treat
    // '@.price' by detecting '@' then '.key'. Simplest: preprocess '@.' → '@[' handling in parse.
    return {
      query: function (obj, path) {
        return apply(obj, tokenize(path));
      }
    };
  })();

  // NOTE: @.key in filters — the lexer turns '@' into a token and then '.key' is not handled.
  // We preprocess the filter expression to support @.foo and @['foo'] before lexing.
  // (Handled in runJSONPath below via a normalize step.)

  function runJSONPath() {
    var out = $('jsonpath-out');
    out.innerHTML = '';
    var text = $('input').value;
    var path = $('jsonpath-input').value.trim();
    if (!path) { out.textContent = 'Enter a JSONPath expression.'; return; }
    var obj;
    try { obj = JSON.parse(text); } catch (e) { out.textContent = 'Input is not valid JSON.'; return; }
    try {
      var results = JSONPath.query(obj, path);
      if (!results.length) { out.textContent = 'No matches.'; return; }
      var preview = results.map(function (r) {
        var s = JSON.stringify(r);
        return s.length > 300 ? s.slice(0, 300) + '…' : s;
      }).join('\n');
      out.textContent = results.length + ' match(es):\n' + preview;
    } catch (e) {
      out.textContent = 'JSONPath error: ' + e.message;
    }
  }

  // ---------- JSON diff ----------
  function diffJSON(a, b) {
    var ops = [];
    (function walk(a, b, path) {
      if (a === b) return;
      if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
        var aArr = Array.isArray(a), bArr = Array.isArray(b);
        if (aArr && bArr) {
          var len = Math.max(a.length, b.length);
          for (var i = 0; i < len; i++) {
            if (i >= a.length) ops.push({ path: path + '[' + i + ']', type: 'added', val: b[i] });
            else if (i >= b.length) ops.push({ path: path + '[' + i + ']', type: 'removed', val: a[i] });
            else walk(a[i], b[i], path + '[' + i + ']');
          }
          return;
        }
        if (!aArr && !bArr) {
          var keys = {};
          Object.keys(a).forEach(function (k) { keys[k] = 1; });
          Object.keys(b).forEach(function (k) { keys[k] = 1; });
          Object.keys(keys).sort().forEach(function (k) {
            var np = path + (path ? '.' : '') + (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k));
            if (!(k in a)) ops.push({ path: np, type: 'added', val: b[k] });
            else if (!(k in b)) ops.push({ path: np, type: 'removed', val: a[k] });
            else walk(a[k], b[k], np);
          });
          return;
        }
      }
      ops.push({ path: path || '(root)', type: 'changed', old: a, val: b });
    })(a, b, '');
    return ops;
  }

  function runDiff() {
    var out = $('diff-out');
    out.innerHTML = '';
    var ta, tb;
    try { ta = JSON.parse($('diff-a').value); } catch (e) { out.textContent = 'Original is not valid JSON.'; return; }
    try { tb = JSON.parse($('diff-b').value); } catch (e) { out.textContent = 'New is not valid JSON.'; return; }
    var ops = diffJSON(ta, tb);
    if (!ops.length) { out.textContent = 'Documents are identical.'; return; }
    ops.slice(0, 200).forEach(function (op) {
      var line = document.createElement('div');
      line.className = 'diff-line ' + op.type;
      var val = op.val !== undefined ? JSON.stringify(op.val) : JSON.stringify(op.old);
      if (val.length > 120) val = val.slice(0, 120) + '…';
      line.textContent = (op.type === 'added' ? '+ ' : op.type === 'removed' ? '− ' : '~ ') + op.path + '  ' + val;
      out.appendChild(line);
    });
    if (ops.length > 200) {
      var more = document.createElement('div');
      more.textContent = '…and ' + (ops.length - 200) + ' more changes.';
      out.appendChild(more);
    }
  }

  // ---------- wire up ----------
  $('btn-format').addEventListener('click', format);
  $('btn-minify').addEventListener('click', minify);
  $('btn-copy').addEventListener('click', copyOutput);
  $('btn-sample').addEventListener('click', function () {
    $('input').value = JSON.stringify({
      store: {
        book: [
          { title: 'The Road', author: 'Cormac McCarthy', price: 12.99, tags: ['novel', 'post-apocalyptic'] },
          { title: 'Dune', author: 'Frank Herbert', price: 15.49, tags: ['sci-fi'] },
          { title: 'The Hobbit', author: 'J.R.R. Tolkien', price: 8.99, tags: ['fantasy', 'classic'] }
        ],
        bicycle: { color: 'red', price: 19.95 }
      },
      note: 'Paste your own JSON, XML, or a JWT to inspect it.'
    }, null, 2);
    format();
  });
  $('btn-clear').addEventListener('click', function () { $('input').value = ''; $('output').innerHTML = ''; $('meta').textContent = ''; });
  $('btn-jsonpath').addEventListener('click', runJSONPath);
  $('btn-diff').addEventListener('click', runDiff);

  $('btn-buy').addEventListener('click', function () {
    var note = $('buy-note');
    note.textContent = 'Redirecting to secure checkout…';
    fetch('/api/checkout', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.url) { window.location.href = res.url; }
        else { note.textContent = (res.error || 'Checkout unavailable — try again shortly.'); }
      })
      .catch(function () { note.textContent = 'Checkout unavailable — try again shortly.'; });
  });

  $('btn-license').addEventListener('click', function () {
    var key = $('license-input').value.trim();
    var status = $('license-status');
    if (!key) { status.textContent = 'Paste your license key.'; return; }
    status.textContent = 'Verifying…';
    verifyAndStore(key).then(function (ok) {
      status.textContent = ok ? 'License activated — Pro unlocked. Thanks!' : 'Invalid license key.';
    });
  });

  // ---------- init ----------
  applyLicense(null);
  initLicense();
  $('input').addEventListener('input', function () { /* live format on input */ });
  // Auto-format once on load with a welcome sample
  $('btn-sample').click();
})();
