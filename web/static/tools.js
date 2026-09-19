/* APILens — shared JSONPath + JSON diff engines (extracted from app.js so the
 * dedicated tool pages (/jsonpath, /json-diff) can use the exact same logic).
 * Exposes window.APILensTools = { jsonpath(obj, path) -> [matches], diff(a, b) -> [ops] }.
 * No dependencies. Kept verbatim from app.js so behavior matches the main app.
 */
(function (global) {
  'use strict';

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

    return {
      query: function (obj, path) { return apply(obj, tokenize(path)); }
    };
  })();

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

  global.APILensTools = {
    jsonpath: function (obj, path) { return JSONPath.query(obj, path); },
    diff: diffJSON
  };
})(typeof window !== 'undefined' ? window : globalThis);
