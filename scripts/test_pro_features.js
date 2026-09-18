// Test the APILens Web Pro features (JSONPath engine + JSON diff) in isolation.
// Extracts the pure functions from app.js and runs assertions. Node, stdlib only.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'static', 'app.js'), 'utf8');

function extract(fromIdx) {
  // find the first '{' after fromIdx, match braces
  let i = src.indexOf('{', fromIdx);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(i, j + 1);
}

const jpStart = src.indexOf('var JSONPath = (function () {');
const jpBody = extract(src.indexOf('{', jpStart));
const jpCode = 'var JSONPath = (function () ' + jpBody + ')();';

const diffStart = src.indexOf('function diffJSON(a, b) {');
const diffBody = extract(diffStart);
const diffCode = 'function diffJSON(a, b) ' + diffBody + ';';

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(jpCode + '\n' + diffCode + '\nglobalThis.JSONPath = JSONPath; globalThis.diffJSON = diffJSON;', sandbox);

const JP = sandbox.JSONPath;
const diff = sandbox.diffJSON;

const doc = {
  store: {
    book: [
      { title: 'The Road', author: 'Cormac McCarthy', price: 12.99, tags: ['novel'] },
      { title: 'Dune', author: 'Frank Herbert', price: 15.49, tags: ['sci-fi'] },
      { title: 'The Hobbit', author: 'J.R.R. Tolkien', price: 8.99, tags: ['fantasy'] }
    ],
    bicycle: { color: 'red', price: 19.95 }
  }
};

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, '\n    got:', a, '\n    want:', e); }
}

// JSONPath
eq('$.store.bicycle.color', JP.query(doc, '$.store.bicycle.color'), ['red']);
eq('$.store.book[0].title', JP.query(doc, '$.store.book[0].title'), ['The Road']);
eq('$.store.book[*].author', JP.query(doc, '$.store.book[*].author'),
  ['Cormac McCarthy', 'Frank Herbert', 'J.R.R. Tolkien']);
eq('$..author', JP.query(doc, '$..author'),
  ['Cormac McCarthy', 'Frank Herbert', 'J.R.R. Tolkien']);
eq('filter price<10', JP.query(doc, '$.store.book[?(@.price < 10)].title'), ['The Hobbit']);
eq('filter price>=15', JP.query(doc, '$.store.book[?(@.price >= 15)].title'), ['Dune']);
eq('filter && tags', JP.query(doc, '$.store.book[?(@.price < 10 && @.author == "J.R.R. Tolkien")].title'), ['The Hobbit']);
eq('filter || ', JP.query(doc, '$.store.book[?(@.price > 15 || @.price < 9)].title'), ['Dune', 'The Hobbit']);
eq('negative index', JP.query(doc, '$.store.book[-1].title'), ['The Hobbit']);
eq('recursive descend price', JP.query(doc, '$..price'), [12.99, 15.49, 8.99, 19.95]);
eq('no match', JP.query(doc, '$.store.book[?(@.price > 100)].title'), []);

// JSON diff
const a = { name: 'x', age: 1, items: [1, 2, 3, 9], nested: { keep: true, drop: 1 } };
const b = { name: 'y', age: 1, items: [1, 2, 3], nested: { keep: true, added: 2 } };
const ops = diff(a, b);
const paths = ops.map(o => o.type + ':' + o.path).sort();
eq('diff paths', paths, [
  'added:nested.added', 'changed:name', 'removed:items[3]', 'removed:nested.drop'
].sort());
eq('diff identical', diff({a:1},{a:1}), []);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
