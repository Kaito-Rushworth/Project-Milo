export const modes = {
  chat: { label: 'Chat', description: 'Everyday questions and ideas' },
  deep: { label: 'Deep think', description: 'Complex problems and decisions' },
  research: { label: 'Research', description: 'Search the web and cite sources' },
}

export const limits = {
  prompt: 12000,
  attachment: 24000,
  files: 3,
  history: 180000,
  messages: 51,
  response: 80000,
}

export async function* readLines(stream) {
  let buffer = ''
  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      yield buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
    }
    if (buffer.length > 1_000_000) throw new Error('The stream returned an oversized event.')
  }
  if (buffer) yield buffer.replace(/\r$/, '')
}
