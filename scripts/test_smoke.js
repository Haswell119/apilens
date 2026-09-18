const fs = require('fs');
require('../extension/formatter.js');
const A = globalThis.APILens;
let pass = 0, fail = 0;
function t(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, '\n  got:', a, '\n  want:', e); }
}
t('detectType json', A.detectType('{"a":1}'), 'json');
t('detectType array', A.detectType('[1,2,3]'), 'json');
t('detectType xml', A.detectType('<root><x>1</x></root>'), 'xml');
t('detectType junk', A.detectType('hello world'), null);
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const header = b64u({ alg: 'HS256', typ: 'JWT' });
const payload = b64u({ sub: '123', name: 'Meridian', admin: true });
const jwt = header + '.' + payload + '.sigabc';
t('isJWT', A.isJWT(jwt), true);
t('isJWT no', A.isJWT('hello'), false);
t('decodeJWT header', A.decodeJWT(jwt).header, { alg: 'HS256', typ: 'JWT' });
t('decodeJWT payload', A.decodeJWT(jwt).payload, { sub: '123', name: 'Meridian', admin: true });
t('decodeJWT sig', A.decodeJWT(jwt).signature, 'sigabc');
t('buildCurl', A.buildCurl('https://api.example.com/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' }),
  'curl -sS -X POST -H "Content-Type: application/json" --data-raw "{\\"a\\":1}" "https://api.example.com/x"');
t('prettyJSON', A.prettyJSON('{"a":1,"b":[1,2]}'), '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
