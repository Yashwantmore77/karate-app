// Every action a person can press in the web app, read from the JSX itself:
// buttons, icon buttons, toggles, tabs and menu actions, with the label the
// screen shows (its text, or its aria-label). Parts only known at run time
// show as {…}. The tooltip coverage
// test uses it so no action goes without an explanation; run directly, it
// prints the list:
//
//   node packages/web/scripts/action-labels.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from '@babel/parser'

const ACTION_TAGS = new Set(['Button', 'IconButton', 'ToggleButton', 'Fab', 'Tab', 'ListItemButton'])
// Text inside these is not the action's name (icons, counts in badges).
const SKIP_CHILD_TAGS = new Set(['Badge', 'CircularProgress'])
// Marks the part of a label only known at run time (a name, a count).
export const PLACEHOLDER = '{…}'

const nameOf = (node) => (node?.type === 'JSXIdentifier' ? node.name : node?.type === 'JSXMemberExpression' ? node.property.name : null)

/** The text an expression can produce: one entry per branch, {…} for parts only known at run time. */
function textsOf(expr) {
  if (!expr) return []
  switch (expr.type) {
    case 'StringLiteral': return [expr.value]
    case 'TemplateLiteral': return [expr.quasis.map((q, i) => q.value.cooked + (i < expr.expressions.length ? PLACEHOLDER : '')).join('')]
    case 'ConditionalExpression': return [...textsOf(expr.consequent), ...textsOf(expr.alternate)]
    case 'LogicalExpression': return expr.operator === '&&' ? textsOf(expr.right) : [...textsOf(expr.left), ...textsOf(expr.right)]
    case 'JSXElement': case 'JSXFragment': return [childrenText(expr.children)]
    default: return [PLACEHOLDER]
  }
}

/** The visible label of an element's children, with run-time parts as {…}. */
function childrenText(children = []) {
  let variants = ['']
  for (const child of children) {
    let parts
    if (child.type === 'JSXText') parts = [child.value]
    else if (child.type === 'JSXExpressionContainer') parts = child.expression.type === 'JSXEmptyExpression' ? [''] : textsOf(child.expression)
    else if (child.type === 'JSXElement') parts = SKIP_CHILD_TAGS.has(nameOf(child.openingElement.name)) || !child.children.length ? [''] : [childrenText(child.children)]
    else if (child.type === 'JSXFragment') parts = [childrenText(child.children)]
    else parts = ['']
    variants = variants.flatMap((v) => parts.map((p) => v + p))
    if (variants.length > 16) variants = variants.slice(0, 16)
  }
  return variants.map(clean).filter(Boolean).join('\u0000')
}

const clean = (s) => s.replace(/\s+/g, ' ').trim()

/** Walks a parsed file and reports every action element with its label(s). */
function collect(ast, file, out) {
  const parents = []
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return
    if (node.type === 'JSXElement') {
      const tag = nameOf(node.openingElement.name)
      const attrs = Object.fromEntries(node.openingElement.attributes.filter((a) => a.type === 'JSXAttribute').map((a) => [a.name.name, a.value]))
      const attrText = (name) => {
        const v = attrs[name]
        if (!v) return null
        if (v.type === 'StringLiteral') return [v.value]
        if (v.type === 'JSXExpressionContainer') return textsOf(v.expression)
        return null
      }
      const inTooltip = parents.some((p) => p.tag === 'Tooltip')
      const inMenu = parents.some((p) => p.tag === 'Menu')
      if (ACTION_TAGS.has(tag) || (tag === 'MenuItem' && inMenu)) {
        // The name the screen gives it, as the tooltip layer reads it: the
        // aria-label first, then the label (tabs), then the text inside (list
        // rows: their primary text).
        const listText = node.children.filter((c) => c.type === 'JSXElement' && nameOf(c.openingElement.name) === 'ListItemText')
          .flatMap((c) => {
            const primary = c.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'primary')
            return primary?.value?.type === 'StringLiteral' ? [primary.value.value] : primary?.value?.type === 'JSXExpressionContainer' ? textsOf(primary.value.expression) : []
          })
        const named = attrText('aria-label') || (tag === 'Tab' ? attrText('label') : null)
        const labels = (named || (listText.length ? listText : childrenText(node.children).split('\u0000'))).map(clean).filter(Boolean)
        out.push({
          file, line: node.loc.start.line, tag, labels: [...new Set(labels)], inTooltip,
          // An explanation written where the action is drawn, or a tooltip of its own.
          tipped: 'data-tip' in attrs, titled: 'title' in attrs,
        })
      }
      parents.push({ tag })
      node.openingElement.attributes.forEach(visit)
      node.children.forEach(visit)
      parents.pop()
      return
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue
      const value = node[key]
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value.type === 'string') visit(value)
    }
  }
  visit(ast.program)
  return out
}

/** Every action in every screen under `root` (tests and this folder excluded). */
export function collectActionLabels(root) {
  const files = []
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.jsx$/.test(f) && !/\.test\./.test(f)) files.push(p)
    }
  }
  walk(root)
  const out = []
  for (const file of files) {
    const ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] })
    collect(ast, path.relative(root, file), out)
  }
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
  const all = collectActionLabels(root)
  const unique = new Map()
  for (const a of all) for (const l of a.labels.length ? a.labels : ['(no label)']) {
    if (!unique.has(l)) unique.set(l, [])
    unique.get(l).push(`${a.file}:${a.line}${a.inTooltip ? ' [tooltip]' : ''}${a.tipped ? ' [data-tip]' : ''}`)
  }
  console.log(`${all.length} actions, ${unique.size} distinct labels`)
  for (const [l, where] of [...unique].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`${l}\t${where.slice(0, 3).join(', ')}${where.length > 3 ? ` (+${where.length - 3})` : ''}`)
}
