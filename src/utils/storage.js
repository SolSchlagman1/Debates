const STORAGE_KEY = 'debates-chat'

export function loadDebate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const data = JSON.parse(raw)
    if (!Array.isArray(data.posts) || data.posts.length === 0) return null

    return {
      topic: typeof data.topic === 'string' ? data.topic : null,
      agents: Array.isArray(data.agents) ? data.agents : null,
      posts: data.posts,
      lastMentioned: Array.isArray(data.lastMentioned) ? data.lastMentioned : [],
      draft: typeof data.draft === 'string' ? data.draft : '',
    }
  } catch {
    return null
  }
}

export function saveDebate({ topic, agents, posts, lastMentioned, draft }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ topic, agents, posts, lastMentioned, draft }),
    )
  } catch {
    // Ignore if storage is full or unavailable
  }
}

export function clearDebate() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore
  }
}
