import { getParticipant, normalizeAgents } from '../constants/debate'

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

function formatDate() {
  return new Date().toISOString().slice(0, 10)
}

export function formatDebateText({ topic, agents, posts, exportedAt = new Date().toISOString() }) {
  const normalizedAgents = normalizeAgents(agents)
  const lines = [
    topic,
    `Debaters: ${normalizedAgents.map((a) => a.name).join(' vs ')}`,
    `Exported: ${new Date(exportedAt).toLocaleString()}`,
    '',
    '---',
    '',
  ]

  for (const post of posts) {
    const { name } = getParticipant(post.author, normalizedAgents)
    lines.push(`${name}:`)
    lines.push(post.text)
    lines.push('')
  }

  return lines.join('\n').trim() + '\n'
}

export function formatDebateJson({ topic, agents, posts, lastMentioned, draft }) {
  return JSON.stringify(
    {
      topic,
      agents,
      exportedAt: new Date().toISOString(),
      posts,
      lastMentioned,
      draft,
    },
    null,
    2,
  )
}

function download(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportDebateAsText({ topic, agents, posts }) {
  const filename = `debate-${slugify(topic)}-${formatDate()}.txt`
  download(filename, formatDebateText({ topic, agents, posts }), 'text/plain;charset=utf-8')
}

export function exportDebateAsJson({ topic, agents, posts, lastMentioned, draft }) {
  const filename = `debate-${slugify(topic)}-${formatDate()}.json`
  download(
    filename,
    formatDebateJson({ topic, agents, posts, lastMentioned, draft }),
    'application/json;charset=utf-8',
  )
}
