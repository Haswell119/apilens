/* APILens content script — auto-format raw JSON/XML responses in place. */
(function () {
  'use strict';
  if (window.top !== window.self) return; // skip iframes

  function candidate() {
    // Whole-body case: a plain-text response whose entire body is JSON/XML.
    if (document.body) {
      var bt = document.body.textContent || '';
      bt = bt.trim();
      if (bt.length > 0 && bt.length < 5000000) {
        var t = APILens.detectType(bt);
        if (t) return { text: bt, type: t };
      }
    }
    // Single <pre> on a text/plain page (e.g. a .json file served as text/plain).
    if ((document.contentType || '').indexOf('text/plain') === 0) {
      var pres = document.querySelectorAll('pre');
      if (pres.length === 1) {
        var txt = pres[0].textContent || '';
        var tt = APILens.detectType(txt);
        if (tt) return { text: txt, type: tt };
      }
    }
    return null;
  }

  function run() {
    var c = candidate();
    if (!c) return;
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.background = '#0b1220';
    document.body.style.padding = '24px';
    APILens.render(document.body, c.text, c.type);
    if (document.title) document.title = 'APILens · ' + document.title;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
