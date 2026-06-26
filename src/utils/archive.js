const ARCHIVE_KEY = 'debates-archive'

export function loadArchive() {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeArchive(items) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(items))
}

export function saveToArchive({ topic, agents, posts }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    topic,
    agents,
    posts,
    savedAt: new Date().toISOString(),
    postCount: posts.length,
  }
  const archive = loadArchive()
  writeArchive([entry, ...archive])
  return entry
}

export function deleteFromArchive(id) {
  writeArchive(loadArchive().filter((item) => item.id !== id))
}

export function getArchivedChat(id) {
  return loadArchive().find((item) => item.id === id) ?? null
}

export function formatSavedDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
