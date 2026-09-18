/* APILens popup logic. Guards chrome.* APIs so the page also runs standalone (for testing). */
(function () {
  'use strict';

  var PRO_URL = null; // Pro not yet available — do not link a payment for a product that doesn't exist
  var hasChrome = typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query;
  var currentUrl = '';
  var lastResponse = null;

  /* ---------- tab switching ---------- */
  var tabInspect = document.getElementById('tab-inspect');
  var tabPaste = document.getElementById('tab-paste');
  var viewInspect = document.getElementById('view-inspect');
  var viewPaste = document.getElementById('view-paste');

  function show(which) {
    viewInspect.hidden = which !== 'inspect';
    viewPaste.hidden = which !== 'paste';
    tabInspect.classList.toggle('active', which === 'inspect');
    tabPaste.classList.toggle('active', which === 'paste');
  }
  tabInspect.addEventListener('click', function () { show('inspect'); });
  tabPaste.addEventListener('click', function () { show('paste'); });

  document.getElementById('pro-link').onclick = function () {
    alert('APILens Pro is not available yet — core features remain free.');
  };

  /* ---------- paste tab ---------- */
  var pasteInput = document.getElementById('paste-input');
  var pasteOut = document.getElementById('paste-out');

  document.getElementById('btn-format').addEventListener('click', function () {
    var text = pasteInput.value;
    pasteOut.innerHTML = '';
    var type = APILens.detectType(text);
    var trimmed = text.trim();
    if (!type && APILens.isJWT(trimmed)) {
      var d = APILens.decodeJWT(trimmed);
      if (d.error) {
        APILens.render(pasteOut, text, null);
      } else {
        APILens.render(pasteOut, JSON.stringify({ header: d.header, payload: d.payload, signature: d.signature }), 'json');
      }
    } else {
      APILens.render(pasteOut, text, type);
    }
  });

  /* ---------- inspect tab ---------- */
  var inspectUrl = document.getElementById('inspect-url');
  var inspectMeta = document.getElementById('inspect-meta');
  var inspectOut = document.getElementById('inspect-out');
  var btnFetch = document.getElementById('btn-fetch');
  var btnCurl = document.getElementById('btn-curl');
  var btnHeaders = document.getElementById('btn-headers');

  function getUrl(cb) {
    if (hasChrome) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var t = tabs && tabs[0];
        currentUrl = (t && t.url) ? t.url : '';
        cb(currentUrl);
      });
    } else {
      currentUrl = location.href;
      cb(currentUrl);
    }
  }

  function fetchAndRender() {
    inspectOut.innerHTML = '';
    inspectMeta.textContent = 'Fetching…';
    getUrl(function (url) {
      if (!url || /^(chrome|about|edge|view-source|devtools|file):/i.test(url)) {
        inspectMeta.textContent = 'This URL cannot be fetched from the popup (' + (url || 'none') + ').';
        return;
      }
      inspectUrl.textContent = url;
      var t0 = performance.now();
      fetch(url, { credentials: 'include' }).then(function (res) {
        lastResponse = res;
        var ms = Math.round(performance.now() - t0);
        var ct = res.headers.get('content-type') || '';
        return res.text().then(function (text) {
          var status = res.status + ' ' + res.statusText;
          inspectMeta.textContent = status + ' · ' + (ct.split(';')[0] || 'no content-type') +
            ' · ' + text.length + ' B · ' + ms + ' ms';
          var type = APILens.detectType(text);
          if (type) APILens.render(inspectOut, text, type);
          else inspectOut.appendChild(APILens.el('div', 'apl-empty',
            'Response is not JSON/XML (' + (ct.split(';')[0] || 'unknown') + ').'));
        });
      }).catch(function (e) {
        inspectMeta.textContent = 'Fetch failed: ' + e.message +
          ' (the site likely blocks cross-origin requests — open the URL directly to auto-format).';
      });
    });
  }

  btnFetch.addEventListener('click', fetchAndRender);
  btnCurl.addEventListener('click', function () {
    if (!currentUrl) return;
    APILens.copy(APILens.buildCurl(currentUrl, { method: 'GET' })).then(function () {
      inspectMeta.textContent = 'cURL copied to clipboard.';
    });
  });
  btnHeaders.addEventListener('click', function () {
    if (!lastResponse) { inspectMeta.textContent = 'Fetch a URL first.'; return; }
    var existing = inspectOut.querySelector('.apl-headers');
    if (existing) { existing.remove(); return; }
    var out = [];
    lastResponse.headers.forEach(function (v, k) { out.push(k + ': ' + v); });
    var h = APILens.el('div', 'apl-headers');
    h.textContent = out.join('\n');
    inspectOut.prepend(h);
  });

  // Auto-fetch on open (with a tick for the tab query to resolve).
  setTimeout(fetchAndRender, 60);
})();
