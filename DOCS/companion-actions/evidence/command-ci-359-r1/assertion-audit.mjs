import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(process.cwd() + '/package.json');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const file = '__tests__/companionActions/taskEdit.test.tsx';
const base = execFileSync('git', ['show', '5c00c5d35fbfcaf1e8aab76b3fd0b0026651ebab:unify-front-end/' + file], { encoding: 'utf8' });
const current = readFileSync(file, 'utf8');

function matchers(source) {
  const found = new Map();
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  traverse(ast, {
    CallExpression(path) {
      if (path.node.callee.type !== 'Identifier' || path.node.callee.name !== 'expect') return;
      let full = path;
      while (full.parentPath?.isMemberExpression() && full.parentPath.node.object === full.node) {
        full = full.parentPath;
      }
      if (full.parentPath?.isCallExpression() && full.parentPath.node.callee === full.node) {
        full = full.parentPath;
      }
      const code = generate(full.node, { comments: false }).code;
      found.set(code, (found.get(code) ?? 0) + 1);
    },
  });
  return found;
}

const old = matchers(base);
const now = matchers(current);
const removed = [...old].filter(([code, count]) => (now.get(code) ?? 0) < count);
const added = [...now]
  .filter(([code, count]) => count > (old.get(code) ?? 0))
  .map(([code, count]) => ({ call: code, before: old.get(code) ?? 0,
    after: count, added: count - (old.get(code) ?? 0) }));
const result = {
  file,
  base: '5c00c5d35fbfcaf1e8aab76b3fd0b0026651ebab',
  baseMatcherCalls: [...old.values()].reduce((a, b) => a + b, 0),
  currentMatcherCalls: [...now.values()].reduce((a, b) => a + b, 0),
  removed,
  added,
  limit: 'Syntax preservation only. Review must assess the changed interaction order and semantics.',
};
writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
if (removed.length) throw new Error('An existing matcher call was removed or changed.');
console.log(JSON.stringify(result));
