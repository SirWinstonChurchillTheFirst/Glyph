// Checks that every text passed to t() has an English entry: `npm run check-i18n`. Without CHECK=1 it lists the texts.
const ts = require('typescript')
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..', 'src')
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [])
const keys = new Map()
for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8')
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const add = (text) => { const key = text.trim(); if (key) keys.set(key, path.basename(file)) }
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText() === 't' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) add(node.arguments[0].text)
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText() === 't') {
      const tpl = node.template
      add(ts.isNoSubstitutionTemplateLiteral(tpl) ? tpl.text : [tpl.head.text, ...tpl.templateSpans.map((s) => s.literal.text)].join('{}'))
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
}
if (process.env.CHECK === '1') {
  const en = fs.readFileSync(path.join(root, 'shared/i18n-en.ts'), 'utf8')
  const dict = new Function(en.replace(/^[\s\S]*?export const EN[^=]*=/, 'return ').replace(/\n\s*$/, ''))()
  const missing = [...keys.keys()].filter((k) => !(k in dict))
  const unused = Object.keys(dict).filter((k) => !keys.has(k))
  console.log(`${keys.size} texts, ${missing.length} without English, ${unused.length} unused entries`)
  for (const k of missing) console.log('MISSING', JSON.stringify(k))
  for (const k of unused) console.log('UNUSED ', JSON.stringify(k))
} else console.log([...keys.keys()].map((k) => JSON.stringify(k)).join('\n'))
