export function getShareBaseUrl() {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${window.location.pathname}`
}

export function buildThreadShareUrl(rootId) {
  return `${getShareBaseUrl()}#/thread/${encodeURIComponent(rootId)}`
}

export function buildTweetShareUrl(postId) {
  return `${getShareBaseUrl()}#/tweet/${encodeURIComponent(postId)}`
}

export function parseShareRoute() {
  const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
  const threadMatch = hash.match(/^\/thread\/([^/?]+)/)
  if (threadMatch) return { type: 'thread', id: decodeURIComponent(threadMatch[1]) }

  const tweetMatch = hash.match(/^\/tweet\/([^/?]+)/)
  if (tweetMatch) return { type: 'tweet', id: decodeURIComponent(tweetMatch[1]) }

  return null
}

export function setShareRoute(type, id) {
  if (typeof window === 'undefined') return
  const path = type === 'thread' ? `/thread/${encodeURIComponent(id)}` : `/tweet/${encodeURIComponent(id)}`
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${path}`)
}

export function clearShareRoute() {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

export async function copyShareLink(url) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url)
    return
  }

  const input = document.createElement('textarea')
  input.value = url
  input.setAttribute('readonly', '')
  input.style.position = 'absolute'
  input.style.left = '-9999px'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
}
