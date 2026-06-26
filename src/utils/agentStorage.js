const DB_NAME = 'debates-agents'
const STORE = 'library'
const KEY = 'agents'
const LEGACY_KEY = 'debates-agent-library'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      event.target.result.createObjectStore(STORE)
    }
  })
}

function idbGet(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(value, KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function loadAgentsFromDb() {
  const db = await openDb()
  return idbGet(db)
}

export async function saveAgentsToDb(agents) {
  const db = await openDb()
  await idbPut(db, agents)
}

export async function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return false

    const existing = await loadAgentsFromDb()
    if (!existing?.length && parsed.length > 0) {
      await saveAgentsToDb(parsed)
    }
    localStorage.removeItem(LEGACY_KEY)
    return true
  } catch {
    return false
  }
}
