async function parseJsonResponse(res, fallbackError) {
  const contentType = res.headers.get('content-type') || ''
  const raw = await res.text()

  if (!contentType.includes('application/json')) {
    if (raw.trim().startsWith('<!DOCTYPE') || raw.trim().startsWith('<html')) {
      throw new Error('AI backend is offline. Run: npm run dev')
    }
    throw new Error(fallbackError)
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(fallbackError)
  }
}

export async function checkApiHealth() {
  try {
    const res = await fetch('/api/health')
    return res.ok
  } catch {
    return false
  }
}

export async function fetchUsage() {
  const res = await fetch('/api/usage')
  const data = await parseJsonResponse(res, 'Failed to load usage')
  if (!res.ok) throw new Error(data.error || 'Failed to load usage')
  return data
}

export async function fetchAgentReply({ mode = 'panel', story, topic, posts, agents, debater, replyToPost }) {
  let res
  try {
    res = await fetch('/api/agent-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, story, topic, posts, agents, debater, replyToPost }),
    })
  } catch {
    throw new Error('Cannot reach the AI backend. Run: npm run dev')
  }

  const data = await parseJsonResponse(res, 'Failed to get reply')
  if (!res.ok) throw new Error(data.error || 'Failed to get reply')
  return data.text
}

export async function fetchExtractDocument(file) {
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result || '').split(',')[1]
      if (!base64) reject(new Error('Could not read file'))
      else resolve(base64)
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })

  let res
  try {
    res = await fetch('/api/extract-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, data }),
    })
  } catch {
    throw new Error('Cannot reach the AI backend. Run: npm run dev')
  }

  const body = await parseJsonResponse(res, 'Failed to read file')
  if (!res.ok) throw new Error(body.error || 'Failed to read file')
  return body
}

/** @deprecated use fetchExtractDocument */
export const fetchExtractPdf = fetchExtractDocument

export async function fetchFeed() {
  let res
  try {
    res = await fetch('/api/feed')
  } catch {
    throw new Error('Cannot reach the AI backend. Run: npm run dev')
  }

  const data = await parseJsonResponse(res, 'Failed to load feed')
  if (!res.ok) throw new Error(data.error || 'Failed to load feed')
  return data
}

export async function saveFeedPost(post) {
  const res = await fetch('/api/feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(post),
  })
  const data = await parseJsonResponse(res, 'Failed to save post')
  if (!res.ok) throw new Error(data.error || 'Failed to save post')
  return data.post
}

export async function resetFeed() {
  const res = await fetch('/api/feed', { method: 'DELETE' })
  const data = await parseJsonResponse(res, 'Failed to reset feed')
  if (!res.ok) throw new Error(data.error || 'Failed to reset feed')
  return data
}

/** @deprecated use fetchFeed */
export async function fetchNewsTweets() {
  return fetchFeed()
}

export async function fetchStartRoom(topic, agents) {
  let res
  try {
    res = await fetch('/api/start-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, agents }),
    })
  } catch {
    throw new Error('Cannot reach the AI backend. Run: npm run dev')
  }

  const data = await parseJsonResponse(res, 'Failed to start room')
  if (!res.ok) throw new Error(data.error || 'Failed to start room')
  return data
}

export async function fetchCreateDebate(topic) {
  let res
  try {
    res = await fetch('/api/create-debate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    })
  } catch {
    throw new Error('Cannot reach the AI backend. Run: npm run dev')
  }

  const data = await parseJsonResponse(res, 'Failed to create debate')
  if (!res.ok) throw new Error(data.error || 'Failed to create debate')
  return data
}

export async function fetchGenerateOpening(agent, story) {
  let res
  try {
    res = await fetch('/api/generate-opening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, story }),
    })
  } catch {
    throw new Error('Cannot reach the AI backend. Run: npm run dev')
  }

  const data = await parseJsonResponse(res, 'Failed to generate opening')
  if (!res.ok) throw new Error(data.error || 'Failed to generate opening')
  return data
}
