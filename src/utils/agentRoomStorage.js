const ROOM_KEY = 'debates-agent-room'

export function loadAgentRoom() {
  try {
    const raw = localStorage.getItem(ROOM_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveAgentRoom(session) {
  localStorage.setItem(ROOM_KEY, JSON.stringify(session))
}

export function clearAgentRoom() {
  localStorage.removeItem(ROOM_KEY)
}
