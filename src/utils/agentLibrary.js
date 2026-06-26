import { loadAgentsFromDb, migrateFromLocalStorage, saveAgentsToDb } from './agentStorage.js'
import {
  deleteAgentOnServer,
  fetchAgents,
  importAgentsToServer,
  saveAgentToServer,
} from '../api/agents.js'

const MAX_DOCS_PER_AGENT = 5

const COLORS = ['#1d9bf0', '#7856ff', '#e0245e', '#00ba7c', '#ff7a00', '#f91880', '#ffd400', '#8b98a5']

export const SAMPLE_AGENTS = [
  {
    id: 'sample-optimist',
    name: 'Sunny',
    handle: '@Sunny',
    color: '#ffd400',
    instructions:
      'You are relentlessly optimistic. You see opportunity in every problem, use upbeat language, and encourage others. You believe technology and human ingenuity solve most things.',
  },
  {
    id: 'sample-skeptic',
    name: 'Gray',
    handle: '@Gray',
    color: '#8b98a5',
    instructions:
      'You are a careful skeptic. You ask hard questions, point out risks and unintended consequences, and demand evidence. You are not cynical — you want things to work, but you stress-test ideas.',
  },
  {
    id: 'sample-pragmatist',
    name: 'Morgan',
    handle: '@Morgan',
    color: '#00ba7c',
    instructions:
      'You are a practical operator. You focus on what actually works, costs, timelines, and trade-offs. You translate big ideas into concrete next steps and call out hand-waving.',
  },
]

function normalizeHandle(handle, name) {
  const raw = String(handle || name || 'Agent')
    .replace(/^@/, '')
    .replace(/\s+/g, '')
  return raw ? `@${raw}` : '@Agent'
}

export function createAgentId() {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function createDocumentId() {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function detectStoredDocType(name) {
  const lower = String(name || '').toLowerCase()
  if (lower.endsWith('.epub')) return 'epub'
  if (lower.endsWith('.txt')) return 'txt'
  if (lower.endsWith('.mobi') || lower.endsWith('.azw') || lower.endsWith('.azw3') || lower.endsWith('.prc')) return 'mobi'
  return 'pdf'
}

function normalizeDocuments(documents) {
  if (!Array.isArray(documents)) return []
  return documents.slice(0, MAX_DOCS_PER_AGENT).map((doc) => ({
    id: doc.id || createDocumentId(),
    name: String(doc.name || 'document.pdf').trim(),
    text: String(doc.text || '').trim(),
    type: doc.type || detectStoredDocType(doc.name),
    pages: doc.pages || 0,
    charCount: doc.charCount || String(doc.text || '').length,
    addedAt: doc.addedAt || new Date().toISOString(),
  }))
}

export function normalizeAgent(agent, index = 0) {
  const name = String(agent.name || `Agent ${index + 1}`).trim()
  const now = new Date().toISOString()
  return {
    id: agent.id || createAgentId(),
    name,
    handle: normalizeHandle(agent.handle, name),
    color: agent.color || COLORS[index % COLORS.length],
    instructions: String(agent.instructions || agent.systemPrompt || agent.prompt || '').trim(),
    avatarUrl: agent.avatarUrl || null,
    documents: normalizeDocuments(agent.documents),
    createdAt: agent.createdAt || now,
    updatedAt: now,
  }
}

async function loadLocalAgents() {
  await migrateFromLocalStorage()
  const raw = await loadAgentsFromDb()
  if (!Array.isArray(raw)) return []
  return raw.map((a, i) => normalizeAgent(a, i))
}

async function migrateBrowserToServer() {
  const local = await loadLocalAgents()
  if (local.length === 0) return

  let server = []
  try {
    server = await fetchAgents()
  } catch {
    return
  }

  const serverIds = new Set(server.map((a) => a.id))
  const toMigrate = local.filter((a) => !serverIds.has(a.id))
  if (toMigrate.length > 0) {
    await importAgentsToServer(toMigrate)
  }
}

export async function syncLocalAgentsToServer() {
  const local = await loadLocalAgents()
  if (!local.length) {
    return { synced: 0, message: 'No agents found in browser storage.' }
  }
  await importAgentsToServer(local)
  return { synced: local.length, message: `Moved ${local.length} agent(s) to the database.` }
}

export async function loadAgentLibrary() {
  try {
    await migrateBrowserToServer()
    const agents = await fetchAgents()
    return agents.map((a, i) => normalizeAgent(a, i))
  } catch {
    return loadLocalAgents()
  }
}

export async function upsertAgent(agent) {
  const existing = (await loadAgentLibrary()).find((a) => a.id === agent.id)
  const normalized = normalizeAgent(
    { ...existing, ...agent, createdAt: existing?.createdAt || agent.createdAt },
    0,
  )
  return saveAgentToServer(normalized)
}

export async function renameAgent(agentId, newName) {
  const library = await loadAgentLibrary()
  const existing = library.find((a) => a.id === agentId)
  if (!existing) return null
  const trimmed = newName.trim()
  if (!trimmed) return null
  return upsertAgent({
    ...existing,
    name: trimmed,
    handle: normalizeHandle(trimmed, trimmed),
  })
}

export async function deleteAgent(agentId) {
  await deleteAgentOnServer(agentId)
  return loadAgentLibrary()
}

export async function importAgentsFromJson(jsonText) {
  const parsed = JSON.parse(jsonText)
  const incoming = Array.isArray(parsed) ? parsed : parsed.agents ? parsed.agents : [parsed]
  const library = await loadAgentLibrary()
  const added = incoming.map((a, i) =>
    normalizeAgent({ ...a, id: createAgentId() }, library.length + i),
  )
  await importAgentsToServer(added)
  return loadAgentLibrary()
}

export function exportAgentsJson(agents) {
  return JSON.stringify(
    agents.map(({ name, handle, color, instructions, documents }) => ({
      name,
      handle,
      color,
      instructions,
      documents: (documents || []).map(({ name: docName, text, pages, type }) => ({
        name: docName,
        text,
        pages,
        type,
      })),
    })),
    null,
    2,
  )
}

export async function seedSampleAgentsIfEmpty() {
  const library = await loadAgentLibrary()
  if (library.length > 0) return library
  for (const a of SAMPLE_AGENTS) {
    await upsertAgent({ ...a, id: createAgentId() })
  }
  return loadAgentLibrary()
}

export function formatDocSize(doc) {
  const chars = doc.charCount || doc.text?.length || 0
  if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)}M chars`
  if (chars >= 1000) return `${Math.round(chars / 1000)}k chars`
  return `${chars} chars`
}
