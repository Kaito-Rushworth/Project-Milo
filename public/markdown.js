export function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function externalLink(label, href) {
  try {
    const url = new URL(href)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const node = element('a', '', label || url.hostname)
    node.href = url.href
    node.target = '_blank'
    node.rel = 'noopener noreferrer'
    return node
  } catch {
    return null
  }
}

function inline(node, text) {
  const syntax = /`([^`\n]+)`|\[([^\]\n]+)\]\(((?:[^\s()]|\([^\s()]*\))+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g
  let offset = 0
  for (const token of text.matchAll(syntax)) {
    node.append(text.slice(offset, token.index))
    const [raw, code, label, url, strong, emphasis] = token
    if (code) node.append(element('code', '', code))
    else if (label) node.append(externalLink(label, url) || raw)
    else node.append(element(strong ? 'strong' : 'em', '', strong || emphasis))
    offset = token.index + raw.length
  }
  node.append(text.slice(offset))
  return node
}

const fence = /^\s*(`{3,}|~{3,})\s*([\w+.#-]*)\s*$/
const heading = /^\s*(#{1,6})\s+(.+)$/
const listItem = /^\s*([-+*]|\d+[.)])\s+(.+)$/
const tableDivider = /^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/
const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(value => value.trim())

export function renderMarkdown(text, copy) {
  const fragment = document.createDocumentFragment()
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  for (let index = 0; index < lines.length;) {
    const line = lines[index++]
    if (!line.trim()) continue
    const opening = line.match(fence)
    const title = line.match(heading)
    const firstItem = line.match(listItem)
    if (opening) {
      const code = []
      const closing = new RegExp(`^\\s*${opening[1][0]}{${opening[1].length},}\\s*$`)
      while (index < lines.length && !closing.test(lines[index])) code.push(lines[index++])
      if (index < lines.length) index++
      const block = element('div', 'code-block')
      const bar = element('div', 'code-head', opening[2] || 'Code')
      const button = element('button', '', 'Copy code')
      const content = code.join('\n')
      button.addEventListener('click', () => copy(content))
      bar.append(button)
      const pre = element('pre')
      pre.append(element('code', '', content))
      block.append(bar, pre)
      fragment.append(block)
    } else if (title) {
      fragment.append(inline(element(`h${Math.min(title[1].length + 1, 6)}`), title[2]))
    } else if (line.includes('|') && tableDivider.test(lines[index] || '')) {
      const wrap = element('div', 'table-wrap')
      const table = element('table')
      const labels = cells(line)
      const alignment = cells(lines[index]).map(rule => {
        if (!rule.endsWith(':')) return 'left'
        return rule.startsWith(':') ? 'center' : 'right'
      })
      const header = table.createTHead().insertRow()
      for (const [column, label] of labels.entries()) {
        const cell = inline(element('th'), label)
        cell.dataset.align = alignment[column] || 'left'
        cell.scope = 'col'
        header.append(cell)
      }
      index++
      const body = table.createTBody()
      while (lines[index]?.includes('|') && lines[index].trim()) {
        const values = cells(lines[index++])
        const row = body.insertRow()
        for (let column = 0; column < labels.length; column++) {
          const cell = inline(row.insertCell(), values[column] || '')
          cell.dataset.align = alignment[column] || 'left'
        }
      }
      wrap.append(table)
      fragment.append(wrap)
    } else if (firstItem) {
      const ordered = /^\d/.test(firstItem[1])
      const list = element(ordered ? 'ol' : 'ul')
      if (ordered) list.start = parseInt(firstItem[1], 10)
      list.append(inline(element('li'), firstItem[2]))
      let next
      while ((next = lines[index]?.match(listItem)) && /^\d/.test(next[1]) === ordered) {
        list.append(inline(element('li'), next[2]))
        index++
      }
      fragment.append(list)
    } else if (/^\s*>/.test(line)) {
      const quote = [line.replace(/^\s*>\s?/, '')]
      while (/^\s*>/.test(lines[index] || '')) quote.push(lines[index++].replace(/^\s*>\s?/, ''))
      fragment.append(inline(element('blockquote'), quote.join(' ')))
    } else {
      const paragraph = [line]
      while (lines[index]?.trim() && !fence.test(lines[index]) && !heading.test(lines[index]) &&
             !listItem.test(lines[index]) && !/^\s*>/.test(lines[index]) &&
             !tableDivider.test(lines[index + 1] || '')) paragraph.push(lines[index++])
      const block = element('p')
      const hardBreak = /(?: {2,}|\\)$/
      let buffer = ''
      for (const [position, row] of paragraph.entries()) {
        if (position < paragraph.length - 1 && hardBreak.test(row)) {
          inline(block, buffer + row.replace(hardBreak, ''))
          block.append(element('br'))
          buffer = ''
        } else {
          buffer += row + ' '
        }
      }
      inline(block, buffer.trimEnd())
      fragment.append(block)
    }
  }
  return fragment
}
