const KEY = 'debates-twitter-feed'

export function loadTwitterFeed() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveTwitterFeed(session) {
  localStorage.setItem(KEY, JSON.stringify(session))
}

export function clearTwitterFeed() {
  localStorage.removeItem(KEY)
}
