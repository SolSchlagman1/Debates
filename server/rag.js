const CHUNK_SIZE = 900
const CHUNK_OVERLAP = 120
const TOP_K = 3

export function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return []

  const chunks = []
  let start = 0
  while (start < cleaned.length) {
    chunks.push(cleaned.slice(start, start + size))
    start += size - overlap
  }
  return chunks
}

export function getAgentChunks(agent) {
  const docs = Array.isArray(agent?.documents) ? agent.documents : []
  const all = []

  for (const doc of docs) {
    if (!doc.text?.trim()) continue
    const parts = chunkText(doc.text)
    parts.forEach((text, index) => {
      all.push({
        id: `${doc.id || doc.name}-${index}`,
        text,
        source: doc.name || 'document',
      })
    })
  }

  return all
}

function tokenize(text) {
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are',
    'was', 'were', 'be', 'been', 'that', 'this', 'with', 'as', 'it', 'not', 'by', 'from',
    'you', 'your', 'they', 'their', 'we', 'our', 'i', 'my', 'he', 'she', 'his', 'her',
  ])

  return (String(text).toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => w.length > 2 && !stop.has(w))
}

function scoreChunk(chunk, queryTokens, boosts = []) {
  const tokens = tokenize(chunk.text)
  const freq = Object.create(null)
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1

  let score = 0
  for (const q of queryTokens) {
    if (freq[q]) score += freq[q] * 2
  }

  for (const boost of boosts) {
    if (chunk.text.toLowerCase().includes(boost)) score += 4
    if (chunk.source.toLowerCase().includes(boost)) score += 2
  }

  return score
}

export function buildRetrievalQuery({ topic, priorPost, replyToPost }) {
  return [topic, priorPost?.text, replyToPost?.text].filter(Boolean).join('\n')
}

export function retrieveChunks(agent, queryText, topK = TOP_K) {
  const chunks = getAgentChunks(agent)
  if (chunks.length === 0) return []

  const queryTokens = [...new Set(tokenize(queryText))]
  const boosts = queryTokens.slice(0, 8)

  const scored = chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, queryTokens, boosts) }))
    .sort((a, b) => b.score - a.score)

  const picked = scored.filter((c) => c.score > 0).slice(0, topK)
  if (picked.length > 0) return picked.map(({ id, text, source }) => ({ id, text, source }))

  // No keyword hit — spread across the book (start, middle, end)
  if (chunks.length <= topK) return chunks.map(({ id, text, source }) => ({ id, text, source }))
  const indices = [0, Math.floor(chunks.length / 2), chunks.length - 1].slice(0, topK)
  return indices.map((i) => chunks[i])
}

export function buildRetrievedKnowledge(agent, queryText) {
  const relevant = retrieveChunks(agent, queryText)
  if (relevant.length === 0) return ''

  const block = relevant.map((c) => `[${c.source}]\n${c.text}`).join('\n\n')

  return `Ideas from your reading that may apply here (inform your view — do NOT quote titles or say "as I wrote"):
${block}`
}
