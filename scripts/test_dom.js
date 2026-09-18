const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="out"></div></body></html>', {
  url: 'https://example.test/',
});
const { window } = dom;

// Expose browser globals that formatter.js expects.
global.window = window;
global.document = window.document;
global.navigator = { clipboard: undefined };
global.DOMParser = window.DOMParser;
// Keep node's own atob/btoa/TextDecoder — they implement the spec correctly.
// (jsdom's atob throws on valid base64; irrelevant to the real browser, test-harness only.)

require('../extension/formatter.js');
const A = window.APILens || globalThis.APILens;
let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name); }
}

// --- XML detection (works now that DOMParser exists) ---
t('detectType xml (browser env)', A.detectType('<root><x>1</x></root>') === 'xml');

// --- JSON render ---
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub: '123', role: 'admin' }) + '.sig';
const json = JSON.stringify({ user: 'alice', token: jwt, count: 3, ok: true, nothing: null, arr: [1, 2] });

const out = document.getElementById('out');
A.render(out, json, 'json');

t('rendered a wrap', !!out.querySelector('.apl-wrap'));
t('rendered toolbar', !!out.querySelector('.apl-toolbar'));
t('rendered search', !!out.querySelector('.apl-search'));
t('rendered rows', out.querySelectorAll('.apl-row').length > 0);

const text = out.textContent;
t('key "user" shown', text.includes('"user"'));
t('string value alice shown', text.includes('"alice"'));
t('number shown', text.includes('3'));
t('bool shown', text.includes('true'));
t('null shown', text.includes('null'));

const chip = out.querySelector('.apl-jwt');
t('JWT rendered as chip', !!chip);

// --- click the JWT chip to decode ---
chip.click();
const panel = out.querySelector('.apl-jwt-panel');
t('JWT panel appears on click', !!panel);
if (panel) {
  t('decoded header alg', panel.textContent.includes('"HS256"'));
  t('decoded payload sub', panel.textContent.includes('"123"'));
  t('decoded payload role admin', panel.textContent.includes('"admin"'));
}
// second click hides
chip.click();
t('JWT panel toggles off', !out.querySelector('.apl-jwt-panel'));

// --- copy buttons present ---
t('copy pretty button', !!out.querySelector('.apl-toolbar button'));
t('expand/collapse buttons', out.querySelectorAll('.apl-toolbar button').length >= 4);

// --- search filter ---
const search = out.querySelector('.apl-search');
search.value = 'alice';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
const visibleRows = [...out.querySelectorAll('.apl-row')].filter(r => r.style.display !== 'none');
t('search filters to matching rows', visibleRows.length > 0);

// --- XML render ---
const out2 = document.createElement('div');
document.body.appendChild(out2);
A.render(out2, '<root><item id="1">a</item><item id="2">b</item></root>', 'xml');
t('XML renders rows', out2.querySelectorAll('.apl-row').length > 0);
t('XML shows item keys', out2.textContent.includes('item'));
t('XML shows attribute', out2.textContent.includes('@id'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
