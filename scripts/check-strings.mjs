// Flags user-facing strings hardcoded in app routes (Frontend.md §1.7:
// every string comes from messages/en.json). Runs in `pnpm lint`.
//
// Scope: apps/web/app/**, excluding dev tooling (app/dev/**) and tests.
// What counts as user-facing:
//   - JSX text nodes with real words (punctuation-only nodes ignored)
//   - string literals in aria-label, aria-description?, placeholder, title, alt props
// Technical strings (className, data-*, href, id, type, test ids, role) are ignored.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

const files = collect(path.join(root, 'apps/web/app')).filter(
  (file) => !file.includes(`${path.sep}dev${path.sep}`) && !file.endsWith('.test.tsx') && statSync(file).isFile(),
);

const TEXT_PROPS = new Set(['aria-label', 'placeholder', 'title', 'alt']);
const WORD = /[A-Za-zÀ-ÿ]{2,}/;

let failures = 0;

function check(sourceFile, file) {
  const rel = path.relative(root, file);
  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = node.getFullText().replace(/\s+/g, ' ').trim();
      if (text && WORD.test(text) && !/^[·•→←×—–-]+$/.test(text)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        console.error(`${rel}:${line + 1}: hardcoded JSX text: "${text.slice(0, 60)}"`);
        failures += 1;
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      node.name &&
      TEXT_PROPS.has(node.name.getText()) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      console.error(`${rel}:${line + 1}: hardcoded ${node.name.getText()}: "${node.initializer.text.slice(0, 60)}"`);
      failures += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  check(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), file);
}

if (failures > 0) {
  console.error(`\n${failures} hardcoded user-facing string(s). Move them to apps/web/messages/en.json.`);
  process.exit(1);
}
console.log(`strings OK: ${files.length} route files checked.`);
