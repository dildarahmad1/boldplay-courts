import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
const module = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync('src/lib/uiTranslations.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('exports', 'module', compiled)(module.exports, module);
const translate = module.exports.translateUiText;
const allowed = new Set([': BKG-', '© OpenStreetMap contributors · ODbL ·']);
const missing = new Set();
function check(value, filename) {
  value = value.replace(/\s+/g, ' ').trim();
  if (allowed.has(value) || !/[a-z]{2}/i.test(value) || !/[A-Z]|\s/.test(value) || /^https?:|^text-|^bg-|^border-|^[\w./:@-]+$/.test(value)) return;
  for (const language of ['ar', 'ckb', 'kmr']) if (translate(value, language) === value) missing.add(`${filename}: ${language}: ${value}`);
}
function scan(dir) {
  for (const name of fs.readdirSync(dir)) {
    const filename = path.join(dir, name);
    if (fs.statSync(filename).isDirectory()) { scan(filename); continue; }
    if (!filename.endsWith('.tsx')) continue;
    const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxText(node)) check(node.text, filename);
      if (ts.isStringLiteral(node)) {
        const parent = node.parent;
        if (ts.isJsxAttribute(parent) && ['label', 'placeholder', 'title', 'aria-label', 'description', 'alt'].includes(parent.name.text)) check(node.text, filename);
        else if (ts.isPropertyAssignment(parent) && ['label', 'title', 'description', 'placeholder', 'message'].includes(parent.name.getText(ast))) check(node.text, filename);
        else if (ts.isCallExpression(parent) && /\bt$|translate|Error/.test(parent.expression.getText(ast))) check(node.text, filename);
        else if (ts.isJsxExpression(parent)) check(node.text, filename);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
scan('src');
assert.deepEqual([...missing], [], 'Missing UI translations');
for (const language of ['ar', 'ckb', 'kmr']) {
  const progress = translate('Step 2 of 8: Court Details', language);
  assert.ok(!/Step|Court Details|of/.test(progress), 'Wizard progress must translate its step name');
  for (const value of ['Natural grass', 'Artificial turf', 'Hardwood', 'Concrete', 'Clay', 'Sand', 'Rubber', 'Other', 'Current location']) {
    assert.notEqual(translate(value, language), value, `${language}: ${value}`);
  }
}
console.log('PASS: visible static UI strings have Arabic, Sorani and Badini translations; court surfaces and dynamic wizard progress are localized');
