import Database from 'better-sqlite3'
import { dbPath } from './dataDir.js'

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    handle TEXT NOT NULL,
    color TEXT NOT NULL,
    instructions TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    pages INTEGER DEFAULT 0,
    char_count INTEGER DEFAULT 0,
    added_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_documents_agent ON documents(agent_id);
`)

try {
  db.exec(`ALTER TABLE agents ADD COLUMN avatar_url TEXT`)
} catch {
  // column already exists
}

function rowToAgent(row, documents) {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    color: row.color,
    instructions: row.instructions,
    avatarUrl: row.avatar_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    documents: documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      text: doc.text,
      pages: doc.pages,
      charCount: doc.char_count,
      addedAt: doc.added_at,
    })),
  }
}

export function listAgents() {
  const agents = db.prepare('SELECT * FROM agents ORDER BY updated_at DESC').all()
  const docs = db.prepare('SELECT * FROM documents ORDER BY added_at ASC').all()
  const byAgent = Object.groupBy(docs, (d) => d.agent_id)

  return agents.map((row) => rowToAgent(row, byAgent[row.id] || []))
}

export function upsertAgent(agent) {
  const existing = db.prepare('SELECT avatar_url FROM agents WHERE id = ?').get(agent.id)
  const avatarUrl =
    agent.avatarUrl !== undefined ? agent.avatarUrl : existing?.avatar_url || null

  const upsertAgentStmt = db.prepare(`
    INSERT INTO agents (id, name, handle, color, instructions, avatar_url, created_at, updated_at)
    VALUES (@id, @name, @handle, @color, @instructions, @avatar_url, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      handle = excluded.handle,
      color = excluded.color,
      instructions = excluded.instructions,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at
  `)

  const deleteDocs = db.prepare('DELETE FROM documents WHERE agent_id = ?')
  const insertDoc = db.prepare(`
    INSERT INTO documents (id, agent_id, name, type, text, pages, char_count, added_at)
    VALUES (@id, @agent_id, @name, @type, @text, @pages, @char_count, @added_at)
  `)

  const tx = db.transaction(() => {
    upsertAgentStmt.run({
      id: agent.id,
      name: agent.name,
      handle: agent.handle,
      color: agent.color,
      instructions: agent.instructions,
      avatar_url: avatarUrl,
      created_at: agent.createdAt,
      updated_at: agent.updatedAt,
    })

    deleteDocs.run(agent.id)

    for (const doc of agent.documents || []) {
      insertDoc.run({
        id: doc.id,
        agent_id: agent.id,
        name: doc.name,
        type: doc.type,
        text: doc.text,
        pages: doc.pages || 0,
        char_count: doc.charCount || doc.text?.length || 0,
        added_at: doc.addedAt,
      })
    }
  })

  tx()
  return { ...agent, avatarUrl }
}

export function updateAgentAvatar(agentId, avatarUrl) {
  const row = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId)
  if (!row) return null

  db.prepare('UPDATE agents SET avatar_url = ?, updated_at = ? WHERE id = ?').run(
    avatarUrl,
    new Date().toISOString(),
    agentId,
  )

  return listAgents().find((a) => a.id === agentId) || null
}

export function deleteAgent(agentId) {
  db.prepare('DELETE FROM agents WHERE id = ?').run(agentId)
}

export function importAgents(agents) {
  const tx = db.transaction(() => {
    for (const agent of agents) {
      upsertAgent(agent)
    }
  })
  tx()
  return listAgents()
}

export function getStorageStats() {
  const agents = db.prepare('SELECT COUNT(*) as count FROM agents').get().count
  const docs = db.prepare('SELECT COUNT(*) as count FROM documents').get().count
  const chars = db.prepare('SELECT COALESCE(SUM(char_count), 0) as total FROM documents').get().total
  return { agents, documents: docs, totalChars: chars }
}
