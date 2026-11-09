import { limits, modes, readLines } from './protocol.js'
import { element, externalLink, renderMarkdown } from './markdown.js'

const $ = id => document.getElementById(id)
const workspace = document.querySelector('.workspace')
const prompt = $('prompt')
const scroll = $('scroll')
const messages = $('messages')
const storeKey = 'project-milo-v1'
const themeQuery = matchMedia('(prefers-color-scheme: light)')
const mobile = matchMedia('(max-width: 760px)')
const modeIcons = { chat: 'spark', deep: 'layers', research: 'globe' }
const iconPaths = {
  plus: 'M12 5v14M5 12h14', search: 'M20 20l-4-4M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  panel: 'M9 4v16M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z',
  settings: 'M4 7h16M4 12h16M4 17h16M8 5v4M15 10v4M10 15v4',
  more: 'M5 12h.01M12 12h.01M19 12h.01', spark: 'M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z',
  layers: 'M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
  globe: 'M3 12h18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c4 4 4 14 0 18-4-4-4-14 0-18Z',
  clip: 'm8 13 6-6a2 2 0 0 1 3 3l-7 7a4 4 0 0 1-6-6l8-8a5 5 0 0 1 7 7l-8 8',
  up: 'M12 19V5m-6 6 6-6 6 6', down: 'M12 5v14m-6-6 6 6 6-6', chevron: 'm7 10 5 5 5-5',
  stop: 'M7 7h10v10H7z', arrow: 'M6 18 18 6M9 6h9v9', close: 'm6 6 12 12M6 18 18 6',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  message: 'M20 5H4v12h4l4 3 4-3h4V5Z', file: 'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6',
  copy: 'M9 9h11v11H9V9Zm6-3V4H4v11h2', edit: 'm4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4',
  branch: 'M6 3v18M6 15c0-5 3-7 11-7m-4-4 4 4-4 4',
  refresh: 'M20 12a8 8 0 1 1-2.5-5.8L21 10M21 4v6h-6',
  trash: 'M4 7h16m-14 0 1 14h10l1-14M9 7V4h6v3m-5 3v7m4-7v7',
  download: 'M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4',
}

function icon(node, name) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  const path = document.createElementNS(ns, 'path')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', name === 'more' ? '3' : '1.7')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('d', iconPaths[name])
  svg.append(path)
  node.replaceChildren(svg)
  return node
}

function iconButton(name, label, onClick) {
  const button = icon(element('button', 'icon-button'), name)
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  button.addEventListener('click', onClick)
  return button
}

document.querySelectorAll('[data-icon]').forEach(node => icon(node, node.dataset.icon))

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storeKey)) || {}
  } catch {
    return {}
  }
}

const saved = loadState()
const chats = Array.isArray(saved.chats) ? saved.chats : []
for (const chat of chats) {
  for (const message of chat.messages) {
    if (message.status === 'streaming') {
      message.status = 'stopped'
      message.detail = 'Reply interrupted. You can try again.'
    }
  }
}
let current = chats.find(chat => chat.id === saved.current) || null
let mode = current?.mode || 'chat'
let theme = ['dark', 'light', 'system'].includes(saved.theme) ? saved.theme : 'dark'
let pending = null
let files = []
let composerVersion = 0
let loadingFiles = false
let config = null
let offline = false
let storageFailed = false
let toastTimer
let dialogAction

function toast(text) {
  $('toast').textContent = text
  $('toast').hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { $('toast').hidden = true }, 3700)
}

function persist() {
  try {
    localStorage.setItem(storeKey, JSON.stringify({ chats, current: current?.id, theme }))
    if (storageFailed) $('caption').textContent = 'Enter to send · Shift+Enter for a new line'
    storageFailed = false
  } catch {
    if (!storageFailed) toast('Milo could not save this change. Export important chats or free up browser storage.')
    storageFailed = true
    $('caption').textContent = 'Recent changes could not be saved'
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied to clipboard')
  } catch {
    toast('Clipboard access is unavailable.')
  }
}

function orderedChats() {
  return [...chats].sort((a, b) => b.updated - a.updated)
}

function renderHistory() {
  $('history').replaceChildren(...orderedChats().map(chat => {
    const button = element('button', 'history-item')
    button.setAttribute('aria-current', chat === current ? 'true' : 'false')
    button.title = chat.title
    button.append(icon(element('span'), 'message'), element('span', '', chat.title))
    button.addEventListener('click', () => openChat(chat))
    return button
  }))
  if (!chats.length) $('history').append(element('p', 'history-empty', 'Your chats will appear here.'))
  $('title').textContent = current?.title || 'New chat'
  $('chat-actions').hidden = !current
}

function setMode(next) {
  mode = next
  if (current) current.mode = mode
  $('mode-name').textContent = modes[mode].label
  icon($('mode-icon'), modeIcons[mode])
  for (const button of $('mode-menu').children) button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
}

for (const [value, item] of Object.entries(modes)) {
  const button = element('button')
  const label = element('span', '', item.label)
  label.append(element('small', '', item.description))
  button.dataset.mode = value
  button.append(icon(element('span'), modeIcons[value]), label)
  button.addEventListener('click', () => {
    setMode(value)
    $('mode-menu').hidePopover()
    persist()
    prompt.focus()
  })
  $('mode-menu').append(button)
}

function closeSidebar() {
  workspace.classList.remove('sidebar-open')
  $('scrim').hidden = true
  $('sidebar-toggle').setAttribute('aria-expanded', String(!mobile.matches && !workspace.classList.contains('collapsed')))
}

function openChat(chat) {
  if (chat !== current || chat === null) {
    current = chat
    composerVersion++
    prompt.value = ''
    files = []
    loadingFiles = false
    setMode(chat?.mode || 'chat')
  }
  closeSidebar()
  render()
  persist()
  scrollToBottom()
  prompt.focus()
}

function createChat(title, entries = []) {
  const chat = { id: crypto.randomUUID(), title, mode, messages: entries, updated: Date.now() }
  chats.push(chat)
  return chat
}

function fileChip(file, onRemove) {
  const chip = element('span', 'file-chip')
  chip.append(icon(element('span'), 'file'), element('span', '', file.name))
  if (onRemove) chip.append(iconButton('close', `Remove ${file.name}`, onRemove))
  return chip
}

function renderComposer() {
  $('files').replaceChildren(...files.map(file => fileChip(file, () => {
    files = files.filter(item => item !== file)
    renderComposer()
    prompt.focus()
  })))
  $('files').hidden = !files.length
  $('send').hidden = pending?.chat === current
  $('stop').hidden = pending?.chat !== current
  $('send').disabled = Boolean(pending) || loadingFiles || !config || (!prompt.value.trim() && !files.length)
}

function citationLinks(message) {
  const sources = new Map()
  const markers = new Map()
  for (const { url, title, end } of message.citations || []) {
    const link = externalLink(title, url)
    if (!link) continue
    if (!sources.has(url)) sources.set(url, { link, number: sources.size + 1 })
    const lineEnd = message.text.indexOf('\n', end)
    const position = lineEnd < 0 ? message.text.length : lineEnd
    if (!markers.has(position)) markers.set(position, new Set())
    markers.get(position).add(url)
  }
  let text = message.text
  for (const [position, urls] of [...markers].sort(([a], [b]) => b - a)) {
    const links = [...urls].map(url => {
      const { number, link } = sources.get(url)
      const href = link.href.replace(/\)/g, '%29').replace(/\(/g, '%28')
      return `[Source ${number}](${href})`
    })
    text = `${text.slice(0, position)} ${links.join(' ')}${text.slice(position)}`
  }
  return { text, links: [...sources.values()].map(source => source.link) }
}

function renderMessage(message, index) {
  const article = element('article', `message ${message.role}`)
  const bubble = element('div', 'bubble')
  const controls = element('div', 'message-controls')
  const chat = current
  if (message.role === 'user') {
    article.setAttribute('aria-label', 'Your message')
    if (message.files?.length) {
      const attachments = element('div', 'message-files')
      attachments.append(...message.files.map(file => fileChip(file)))
      article.append(attachments)
    }
    bubble.textContent = message.text
    if (message.text) article.append(bubble)
    if (message.text) controls.append(iconButton('copy', 'Copy message', () => copy(message.text)))
    controls.append(iconButton('branch', 'Edit in a new branch', () => {
      if (pending) return toast('Stop or finish the current reply before branching.')
      const branch = createChat(`Branch · ${chat.title}`.slice(0, 100), structuredClone(chat.messages.slice(0, index)))
      openChat(branch)
      prompt.value = message.text
      files = [...(message.files || [])]
      renderComposer()
      prompt.focus()
    }))
  } else {
    article.setAttribute('aria-label', 'Milo’s reply')
    const header = element('div', 'message-header')
    const image = element('img')
    image.src = '/milo.svg'
    image.alt = ''
    image.width = image.height = 28
    header.append(image, element('span', '', 'Milo'), element('small', '', `${modes[message.mode]?.label || 'Chat'}${message.demo ? ' · Demo' : ''}`))
    article.append(header, bubble)
    if (message.status === 'streaming') article.classList.add('streaming')
    const { text, links } = citationLinks(message)
    if (message.status === 'streaming') bubble.textContent = message.text
    else bubble.append(renderMarkdown(text, copy))
    if (message.detail) article.append(element('p', `message-status ${message.status === 'error' ? 'error' : ''}`, message.detail))
    if (links.length) {
      const sources = element('details', 'sources')
      const list = element('ul')
      for (const link of links) {
        const item = element('li')
        item.append(link)
        list.append(item)
      }
      sources.append(element('summary', '', `${links.length} ${links.length === 1 ? 'source' : 'sources'}`), list)
      article.append(sources)
    }
    if (message.status !== 'streaming') {
      if (message.text) controls.append(iconButton('copy', 'Copy reply', () => copy(message.text)))
      if (index === chat.messages.length - 1) controls.append(iconButton('refresh', message.status === 'done' ? 'Regenerate in a new branch' : 'Retry reply', () => {
        if (pending) return toast('Stop or finish the current reply before retrying.')
        if (offline) return toast('Milo’s server is offline. Restart it and reload the page.')
        if (message.status === 'done') {
          const branch = createChat(`Branch · ${chat.title}`.slice(0, 100), structuredClone(chat.messages.slice(0, index)))
          openChat(branch)
        } else {
          chat.messages.pop()
        }
        requestReply(current, message.mode || mode)
      }))
    }
  }
  if (controls.childNodes.length) article.append(controls)
  return article
}

function renderMessages() {
  const entries = current?.messages || []
  $('welcome').hidden = entries.length > 0
  messages.hidden = entries.length === 0
  messages.replaceChildren(...entries.map(renderMessage))
}

function render() {
  renderHistory()
  renderMessages()
  renderComposer()
}

function nearBottom() {
  return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 75
}

function scrollToBottom() {
  scroll.scrollTop = scroll.scrollHeight
  $('jump').hidden = true
}

function contextFor(entries) {
  const size = item => item.text.length + 100 + (item.files || []).reduce((sum, file) => sum + file.text.length + file.name.length + 60, 0)
  const lastUser = entries.at(-1)
  const context = [lastUser]
  let budget = size(lastUser)
  for (let index = entries.length - 3; index >= 0; index -= 2) {
    const user = entries[index]
    const assistant = entries[index + 1]
    if (assistant.status !== 'done' || assistant.demo) continue
    const pairSize = size(user) + size(assistant)
    if (context.length + 2 > limits.messages || budget + pairSize > limits.history) break
    context.unshift(user, assistant)
    budget += pairSize
  }
  return context.map(({ role, text, files }) => ({ role, text, files }))
}

function refreshStream(job) {
  if (current !== job.chat) return
  const follow = nearBottom()
  const article = messages.lastElementChild
  article.querySelector('.bubble').textContent = job.reply.text
  if (job.reply.detail) {
    let status = article.querySelector('.message-status')
    if (!status) {
      status = element('p', 'message-status')
      article.append(status)
    }
    status.textContent = job.reply.detail
  } else {
    article.querySelector('.message-status')?.remove()
  }
  if (follow) scrollToBottom()
  else $('jump').hidden = nearBottom()
}

async function requestReply(chat, responseMode) {
  const context = contextFor(chat.messages)
  const reply = { role: 'assistant', text: '', mode: responseMode, demo: config?.demo, status: 'streaming' }
  const job = { chat, reply, controller: new AbortController() }
  pending = job
  chat.messages.push(reply)
  chat.updated = Date.now()
  render()
  scrollToBottom()
  persist()
  let lastCheckpoint = Date.now()
  $('announcement').textContent = 'Milo is preparing a reply.'

  try {
    const response = await fetch('/api/chat', {
      method: 'POST', signal: job.controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: responseMode, messages: context }),
    })
    if (!response.ok) throw new Error((await response.json()).error || 'Milo could not start the reply.')
    for await (const line of readLines(response.body)) {
      if (!line) continue
      const event = JSON.parse(line)
      if (event.type === 'delta') {
        reply.text += event.text
        reply.detail = ''
        if (Date.now() - lastCheckpoint >= 2000) {
          lastCheckpoint = Date.now()
          persist()
        }
      } else if (event.type === 'status') {
        reply.detail = event.text
      } else if (event.type === 'done') {
        reply.status = 'done'
        reply.detail = ''
        reply.text = event.text ?? reply.text
        reply.citations = event.citations
        break
      } else if (event.type === 'error') {
        throw new Error(event.message)
      }
      refreshStream(job)
    }
    if (reply.status !== 'done') throw new Error('The connection closed before the reply finished.')
  } catch (error) {
    reply.status = job.controller.signal.aborted ? 'stopped' : 'error'
    reply.detail = reply.status === 'stopped' ? 'Reply stopped.' : error.message
  } finally {
    pending = null
    const follow = current === chat && nearBottom()
    if (current === chat) renderMessages()
    renderComposer()
    persist()
    if (follow) scrollToBottom()
    $('announcement').textContent = reply.status === 'done' ? 'Milo’s reply is ready.' : reply.detail
  }
}

function submit() {
  if (pending || loadingFiles || !config || (!prompt.value.trim() && !files.length)) return
  const text = prompt.value.trim()
  if (!current) current = createChat((text || files[0].name).replace(/\s+/g, ' ').slice(0, 68))
  current.messages.push({ role: 'user', text, files })
  composerVersion++
  prompt.value = ''
  files = []
  requestReply(current, mode)
}

async function addFiles(list) {
  if (loadingFiles) return toast('Milo is reading the current attachments.')
  loadingFiles = true
  renderComposer()
  const version = composerVersion
  try {
    for (const file of list) {
      if (version !== composerVersion) return
      if (files.length >= limits.files) return toast(`Attach up to ${limits.files} files per message.`)
      if (file.size > limits.attachment * 4) {
        toast(`${file.name} exceeds the text attachment limit.`)
        continue
      }
      let text
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      } catch {
        toast(`${file.name} could not be read as UTF-8 text.`)
        continue
      }
      if (version !== composerVersion) return
      if (!text.trim() || text.includes('\0') || text.length > limits.attachment || file.name.length > 180) {
        toast(`${file.name} must be a UTF-8 text file up to ${limits.attachment.toLocaleString()} characters.`)
        continue
      }
      files.push({ name: file.name, text })
    }
  } finally {
    if (version === composerVersion) {
      loadingFiles = false
      renderComposer()
      prompt.focus()
    }
  }
}

function renderSearch() {
  const query = $('query').value.trim().toLowerCase()
  const results = orderedChats().flatMap(chat => {
    const match = query && chat.messages.find(item => item.text.toLowerCase().includes(query))
    if (!chat.title.toLowerCase().includes(query) && !match) return []
    const button = element('button', 'result', chat.title)
    const position = match ? Math.max(0, match.text.toLowerCase().indexOf(query) - 35) : 0
    button.append(element('small', '', match ? match.text.slice(position, position + 120) : new Date(chat.updated).toLocaleString()))
    button.addEventListener('click', () => {
      $('search-dialog').close()
      openChat(chat)
    })
    return [button]
  })
  $('results').replaceChildren(...(results.length ? results : [element('p', 'muted', query ? 'No matching conversations.' : 'Your conversations will appear here.')]))
}

function openSearch() {
  $('query').value = ''
  renderSearch()
  $('search-dialog').showModal()
  $('query').focus()
}

function applyTheme() {
  document.documentElement.dataset.theme = theme === 'system' ? (themeQuery.matches ? 'light' : 'dark') : theme
  $('theme').value = theme
}

function renderConnection() {
  const label = offline ? 'Offline' : config?.demo ? 'Demo mode' : config ? 'OpenAI enabled' : 'Connecting'
  $('connection').dataset.state = offline ? 'offline' : config && !config.demo ? 'ready' : 'demo'
  $('connection').querySelector('span').textContent = label
  const detail = offline ? 'Start the local server and reload this page.' : config?.demo
    ? 'Sample replies only. Add OPENAI_API_KEY to .env and restart the server to use AI.'
    : config ? `Model: ${config.model}` : 'Checking the local server…'
  $('connection-info').replaceChildren(element('strong', '', label), element('p', 'muted', detail))
  renderComposer()
}

function exportChat(chat) {
  const sections = [`# ${chat.title}`, ...chat.messages.map(message => {
    const heading = message.role === 'user' ? 'You' : `Milo · ${modes[message.mode]?.label || 'Chat'}${message.demo ? ' · Demo' : ''}`
    const attachments = (message.files || []).map(file => {
      const fence = '`'.repeat(Math.max(3, 1 + Math.max(0, ...(file.text.match(/`+/g) || []).map(run => run.length))))
      return `Attachment: ${file.name}\n\n${fence}text\n${file.text}\n${fence}`
    })
    const { text, links } = citationLinks(message)
    const sources = links.map(link => `- ${link.textContent} (${link.href})`)
    return [`## ${heading}`, text, ...attachments, message.detail, sources.join('\n')].filter(Boolean).join('\n\n')
  })]
  const link = element('a')
  link.href = URL.createObjectURL(new Blob([sections.join('\n\n')], { type: 'text/markdown;charset=utf-8' }))
  link.download = `${chat.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 65) || 'milo-chat'}.md`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  toast('Chat exported')
}

function showAction(action) {
  const chat = current
  if (!chat) return
  if (action === 'export') return exportChat(chat)
  if (action === 'delete' && pending?.chat === chat) return toast('Stop or finish this reply before deleting the chat.')
  dialogAction = { action, chat }
  const rename = action === 'rename'
  $('action-title').textContent = rename ? 'Rename conversation' : 'Delete conversation?'
  $('rename-value').hidden = !rename
  $('rename-value').required = rename
  $('rename-value').value = chat.title
  $('action-description').hidden = rename
  $('action-description').textContent = `“${chat.title}” will be removed from this browser.`
  $('action-submit').textContent = rename ? 'Save name' : 'Delete chat'
  $('action-dialog').showModal()
  if (rename) $('rename-value').select()
  else $('action-dialog').querySelector('.secondary').focus()
}

$('new-chat').addEventListener('click', () => openChat(null))
$('search-chat').addEventListener('click', openSearch)
$('query').addEventListener('input', renderSearch)
$('sidebar-toggle').addEventListener('click', () => {
  if (mobile.matches) {
    if (workspace.classList.contains('sidebar-open')) closeSidebar()
    else {
      workspace.classList.remove('collapsed')
      workspace.classList.add('sidebar-open')
      $('scrim').hidden = false
      $('sidebar-toggle').setAttribute('aria-expanded', 'true')
      $('new-chat').focus()
    }
  } else {
    workspace.classList.toggle('collapsed')
    closeSidebar()
  }
})
$('scrim').addEventListener('click', () => { closeSidebar(); $('sidebar-toggle').focus() })
mobile.addEventListener('change', closeSidebar)
for (const id of ['settings', 'connection']) $(id).addEventListener('click', () => $('settings-dialog').showModal())
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close())
$('theme').addEventListener('change', () => { theme = $('theme').value; applyTheme(); persist() })
themeQuery.addEventListener('change', applyTheme)
$('composer').addEventListener('submit', event => { event.preventDefault(); submit() })
prompt.addEventListener('input', renderComposer)
prompt.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    submit()
  }
})
$('stop').addEventListener('click', () => { pending?.controller.abort(); prompt.focus() })
$('attach').addEventListener('click', () => $('file-input').click())
$('file-input').addEventListener('change', event => {
  const list = [...event.target.files]
  event.target.value = ''
  addFiles(list)
})
$('composer').addEventListener('dragover', event => {
  if (event.dataTransfer.types.includes('Files')) event.preventDefault()
})
$('composer').addEventListener('drop', event => {
  if (!event.dataTransfer.files.length) return
  event.preventDefault()
  addFiles([...event.dataTransfer.files])
})
for (const button of document.querySelectorAll('[data-prompt]')) button.addEventListener('click', () => {
  setMode(button.dataset.mode)
  prompt.value = button.dataset.prompt
  renderComposer()
  prompt.focus()
})
for (const button of $('actions-menu').children) button.addEventListener('click', () => {
  $('actions-menu').hidePopover()
  showAction(button.dataset.action)
})
$('action-form').addEventListener('submit', event => {
  event.preventDefault()
  const { action, chat } = dialogAction
  if (action === 'rename') {
    const name = $('rename-value').value.trim()
    if (!name) return $('rename-value').focus()
    chat.title = name
    renderHistory()
    persist()
  } else {
    chats.splice(chats.indexOf(chat), 1)
    openChat(null)
  }
  $('action-dialog').close()
  if (action === 'delete') prompt.focus()
})
$('jump').addEventListener('click', scrollToBottom)
scroll.addEventListener('scroll', () => { $('jump').hidden = nearBottom() || messages.hidden }, { passive: true })
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return
  if (event.key === 'Escape' && workspace.classList.contains('sidebar-open')) {
    closeSidebar()
    $('sidebar-toggle').focus()
  }
  if (!event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
  if (event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch() }
  if (event.key.toLowerCase() === 'n') { event.preventDefault(); openChat(null) }
})

applyTheme()
closeSidebar()
setMode(mode)
render()
renderConnection()
scrollToBottom()
try {
  const response = await fetch('/api/config')
  if (!response.ok) throw new Error('Connection failed')
  config = await response.json()
} catch {
  offline = true
}
renderConnection()
