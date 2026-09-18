/* APILens — shared formatter library.
 * Loaded by the content script (page) and the popup. No dependencies. MV3-safe.
 * All rendering uses textContent (no innerHTML) to stay XSS-safe on arbitrary API data.
 */
(function (global) {
  'use strict';
  var APILens = (global.APILens = global.APILens || {});

  var MAX_NODES = 20000;

  /* ---------- detection ---------- */

  APILens.detectType = function (text) {
    var t = String(text == null ? '' : text).trim();
    if (!t) return null;
    var c = t.charAt(0);
    if (c === '{' || c === '[') {
      try { JSON.parse(t); return 'json'; } catch (e) { /* not json */ }
    }
    if (c === '<' && /^<(\?xml|[A-Za-z])/.test(t)) {
      try {
        var doc = new DOMParser().parseFromString(t, 'text/xml');
        if (!doc.getElementsByTagName('parsererror').length && doc.documentElement) return 'xml';
      } catch (e) { /* not xml */ }
    }
    return null;
  };

  APILens.isJWT = function (s) {
    return typeof s === 'string' &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(s) &&
      s.split('.').length >= 2;
  };

  APILens.b64url = function (s) {
    var b = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var bin = atob(b);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  };

  APILens.decodeJWT = function (token) {
    var parts = String(token).split('.');
    try {
      return {
        header: JSON.parse(APILens.b64url(parts[0])),
        payload: JSON.parse(APILens.b64url(parts[1])),
        signature: parts[2] || ''
      };
    } catch (e) {
      return { error: 'Invalid JWT (' + e.message + ')' };
    }
  };

  APILens.prettyJSON = function (text) {
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch (e) { return String(text); }
  };

  APILens.buildCurl = function (url, opts) {
    opts = opts || {};
    var method = String(opts.method || 'GET').toUpperCase();
    var out = ['curl -sS', '-X', method];
    if (opts.headers) {
      Object.keys(opts.headers).forEach(function (k) {
        out.push('-H ' + JSON.stringify(k + ': ' + opts.headers[k]));
      });
    }
    if (opts.body) out.push('--data-raw ' + JSON.stringify(opts.body));
    out.push(JSON.stringify(String(url)));
    return out.join(' ');
  };

  APILens.copy = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
      resolve();
    });
  };

  /* ---------- styles ---------- */

  APILens.injectStyles = function (doc) {
    if (doc.getElementById('apl-styles')) return;
    var s = doc.createElement('style');
    s.id = 'apl-styles';
    s.textContent = [
      '.apl-wrap{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.5;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;}',
      '.apl-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px;}',
      '.apl-search{flex:1;min-width:140px;padding:6px 10px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:12.5px;}',
      '.apl-toolbar button{padding:6px 10px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#cbd5e1;font-size:12px;cursor:pointer;}',
      '.apl-toolbar button:hover{background:#334155;color:#fff;}',
      '.apl-tree{padding-left:2px;}',
      '.apl-row{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 0;}',
      '.apl-toggle{display:inline-block;width:14px;cursor:pointer;color:#64748b;user-select:none;}',
      '.apl-key{color:#a78bfa;}',
      '.apl-index{color:#64748b;}',
      '.apl-summary{color:#64748b;}',
      '.apl-str{color:#4ade80;}',
      '.apl-num{color:#60a5fa;}',
      '.apl-bool{color:#fbbf24;}',
      '.apl-null{color:#94a3b8;font-style:italic;}',
      '.apl-children{margin-left:16px;border-left:1px solid #1e293b;padding-left:8px;}',
      '.apl-jwt{color:#38bdf8;cursor:pointer;border-bottom:1px dashed #38bdf8;}',
      '.apl-jwt-panel{margin:6px 0 6px 16px;padding:8px;border:1px solid #1e293b;border-radius:6px;background:#0b1220;}',
      '.apl-empty{color:#64748b;padding:20px;text-align:center;}',
      '.apl-truncated{color:#fbbf24;padding:8px;margin-top:8px;border:1px dashed #fbbf24;border-radius:6px;}'
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(s);
  };

  /* ---------- helpers ---------- */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  APILens.el = el;

  function valueSpan(value) {
    if (value === null) return el('span', 'apl-null', 'null');
    var t = typeof value;
    if (t === 'string') {
      if (APILens.isJWT(value)) return jwtChip(value);
      return el('span', 'apl-str', JSON.stringify(value));
    }
    if (t === 'number') return el('span', 'apl-num', String(value));
    if (t === 'boolean') return el('span', 'apl-bool', String(value));
    return el('span', 'apl-str', String(value));
  }

  function jwtChip(token) {
    var chip = el('span', 'apl-jwt', 'JWT · decode');
    chip.title = token;
    var panel = null;
    chip.addEventListener('click', function () {
      if (panel) { panel.remove(); panel = null; chip.textContent = 'JWT · decode'; return; }
      var d = APILens.decodeJWT(token);
      panel = el('div', 'apl-jwt-panel');
      if (d.error) {
        panel.appendChild(el('div', 'apl-empty', d.error));
      } else {
        var counter = { n: 0, truncated: 0 };
        renderNode(panel, 'header', d.header, 0, counter);
        renderNode(panel, 'payload', d.payload, 0, counter);
        var sig = el('div', 'apl-row');
        sig.appendChild(el('span', 'apl-key', 'signature: '));
        sig.appendChild(el('span', 'apl-str', JSON.stringify(d.signature)));
        panel.appendChild(sig);
      }
      chip.parentNode.insertBefore(panel, chip.nextSibling);
      chip.textContent = 'JWT · hide';
    });
    return chip;
  }

  function renderNode(parent, key, value, depth, counter) {
    if (counter.n >= MAX_NODES) { counter.truncated++; return; }
    counter.n++;
    var isArray = Array.isArray(value);
    var isObj = value !== null && typeof value === 'object' && !isArray;
    var isContainer = isArray || isObj;

    var row = el('div', 'apl-row');
    if (key !== null && key !== undefined) {
      if (isArray) {
        row.appendChild(el('span', 'apl-index', key + ': '));
      } else {
        var k = el('span', 'apl-key');
        k.textContent = JSON.stringify(key) + ': ';
        row.appendChild(k);
      }
    }

    if (!isContainer) {
      row.appendChild(valueSpan(value));
      parent.appendChild(row);
      return;
    }

    var toggle = el('span', 'apl-toggle', depth === 0 ? '▾' : '▸');
    row.appendChild(toggle);
    var summary = isArray
      ? el('span', 'apl-summary', 'Array(' + value.length + ')')
      : el('span', 'apl-summary', '{…} ' + Object.keys(value).length + ' keys');
    row.appendChild(summary);
    parent.appendChild(row);

    var children = el('div', 'apl-children');
    children.hidden = depth !== 0;
    parent.appendChild(children);

    toggle.addEventListener('click', function () {
      children.hidden = !children.hidden;
      toggle.textContent = children.hidden ? '▸' : '▾';
    });

    if (isArray) {
      for (var i = 0; i < value.length; i++) renderNode(children, i, value[i], depth + 1, counter);
    } else {
      var keys = Object.keys(value);
      for (var j = 0; j < keys.length; j++) renderNode(children, keys[j], value[keys[j]], depth + 1, counter);
    }
  }

  function xmlToObj(node) {
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue.trim();
    var attrs = {};
    for (var a = 0; a < node.attributes.length; a++) attrs['@' + node.attributes[a].name] = node.attributes[a].value;
    var children = [];
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 1) children.push(c);
      else if (c.nodeType === 3 && c.nodeValue.trim()) children.push(c);
    }
    if (children.length === 0) {
      if (Object.keys(attrs).length === 0) return node.textContent;
      var o = { '#text': node.textContent.trim() };
      for (var k in attrs) o[k] = attrs[k];
      return o;
    }
    var obj = {};
    for (var k2 in attrs) obj[k2] = attrs[k2];
    children.forEach(function (child) {
      if (child.nodeType === 3) {
        var t = child.nodeValue.trim();
        if (t) obj['#text'] = (obj['#text'] ? obj['#text'] + ' ' : '') + t;
      } else {
        var tag = child.nodeName;
        var val = xmlToObj(child);
        if (obj[tag] === undefined) obj[tag] = val;
        else if (Array.isArray(obj[tag])) obj[tag].push(val);
        else obj[tag] = [obj[tag], val];
      }
    });
    return obj;
  }

  /* ---------- render ---------- */

  APILens.render = function (container, text, type) {
    var doc = container.ownerDocument || document;
    APILens.injectStyles(doc);
    var wrap = el('div', 'apl-wrap');
    container.appendChild(wrap);

    var counter = { n: 0, truncated: 0 };
    var tree = el('div', 'apl-tree');

    if (type === 'json') {
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
      if (parsed === null) tree.appendChild(el('div', 'apl-empty', 'Invalid JSON.'));
      else renderNode(tree, null, parsed, 0, counter);
    } else if (type === 'xml') {
      try {
        var xdoc = new DOMParser().parseFromString(text, 'text/xml');
        if (xdoc.getElementsByTagName('parsererror').length) {
          tree.appendChild(el('div', 'apl-empty', 'Invalid XML.'));
        } else {
          renderNode(tree, xdoc.documentElement.nodeName, xmlToObj(xdoc.documentElement), 0, counter);
        }
      } catch (e) { tree.appendChild(el('div', 'apl-empty', 'Invalid XML.')); }
    } else {
      tree.appendChild(el('div', 'apl-empty', 'No valid JSON or XML found.'));
    }

    var toolbar = el('div', 'apl-toolbar');
    var search = el('input', 'apl-search');
    search.type = 'search';
    search.placeholder = 'Search keys/values…';
    var copyPretty = el('button', null, 'Copy pretty');
    var copyRaw = el('button', null, 'Copy raw');
    var expand = el('button', null, 'Expand all');
    var collapse = el('button', null, 'Collapse all');
    toolbar.appendChild(search);
    toolbar.appendChild(copyPretty);
    toolbar.appendChild(copyRaw);
    toolbar.appendChild(expand);
    toolbar.appendChild(collapse);
    wrap.appendChild(toolbar);
    wrap.appendChild(tree);

    if (counter.truncated > 0) {
      wrap.appendChild(el('div', 'apl-truncated',
        'Truncated at ' + MAX_NODES + ' nodes — ' + counter.truncated + ' more hidden. Pro unlocks large-file mode.'));
    }

    function setAll(root, hidden) {
      root.querySelectorAll('.apl-children').forEach(function (c) { c.hidden = hidden; });
      root.querySelectorAll('.apl-toggle').forEach(function (t) { t.textContent = hidden ? '▸' : '▾'; });
    }

    copyPretty.addEventListener('click', function () {
      APILens.copy(APILens.prettyJSON(text)).then(function () { copyPretty.textContent = 'Copied ✓'; });
    });
    copyRaw.addEventListener('click', function () {
      APILens.copy(String(text)).then(function () { copyRaw.textContent = 'Copied ✓'; });
    });
    expand.addEventListener('click', function () { setAll(tree, false); });
    collapse.addEventListener('click', function () { setAll(tree, true); });

    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      var rows = tree.querySelectorAll('.apl-row');
      if (!q) {
        rows.forEach(function (r) { r.style.display = ''; });
        setAll(tree, false);
        return;
      }
      var matches = new WeakSet();
      rows.forEach(function (r) { if (r.textContent.toLowerCase().indexOf(q) !== -1) matches.add(r); });
      tree.querySelectorAll('.apl-children').forEach(function (c) {
        var has = false;
        c.querySelectorAll('.apl-row').forEach(function (r) { if (matches.has(r)) has = true; });
        c.hidden = !has;
      });
      rows.forEach(function (r) {
        var show = matches.has(r) || hasMatchDescendant(r);
        r.style.display = show ? '' : 'none';
      });
      function hasMatchDescendant(r) {
        var c = r.nextElementSibling;
        if (c && c.classList && c.classList.contains('apl-children')) {
          var any = false;
          c.querySelectorAll('.apl-row').forEach(function (x) { if (matches.has(x)) any = true; });
          return any;
        }
        return false;
      }
    });

    return wrap;
  };
})(typeof window !== 'undefined' ? window : globalThis);
