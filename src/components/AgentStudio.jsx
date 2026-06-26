import { useEffect, useRef, useState } from 'react'
import AgentEditor from './AgentEditor'
import {
  deleteAgent,
  exportAgentsJson,
  formatDocSize,
  importAgentsFromJson,
  loadAgentLibrary,
  renameAgent,
  seedSampleAgentsIfEmpty,
  syncLocalAgentsToServer,
  upsertAgent,
} from '../utils/agentLibrary'

export default function AgentStudio({ onStartRoom }) {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [focusName, setFocusName] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveOk, setSaveOk] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    async function init() {
      await syncLocalAgentsToServer().catch(() => {})
      const list = await seedSampleAgentsIfEmpty()
      setAgents(list)
      setLoading(false)
    }
    init()
  }, [])

  async function handleSyncFromBrowser() {
    setSyncing(true)
    setSaveError(null)
    try {
      const result = await syncLocalAgentsToServer()
      await refresh()
      setSaveOk(result.message)
      setTimeout(() => setSaveOk(null), 4000)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  async function refresh() {
    setAgents(await loadAgentLibrary())
  }

  async function handleSave(agent) {
    try {
      await upsertAgent(agent)
      await refresh()
      setEditing(null)
      setCreating(false)
      setFocusName(false)
      setSaveError(null)
      setSaveOk(`Saved ${agent.name}`)
      setTimeout(() => setSaveOk(null), 3000)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  async function handleDelete(agentId) {
    if (!confirm('Delete this agent?')) return
    try {
      await deleteAgent(agentId)
      await refresh()
      setSaveError(null)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  function startRename(agent) {
    setRenamingId(agent.id)
    setRenameValue(agent.name)
  }

  async function submitRename(agentId) {
    try {
      const updated = await renameAgent(agentId, renameValue)
      if (updated) await refresh()
      setRenamingId(null)
      setRenameValue('')
      setSaveError(null)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      importAgentsFromJson(String(reader.result))
        .then(() => refresh())
        .catch(() => alert('Could not import that file.'))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleExport() {
    const blob = new Blob([exportAgentsJson(agents)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'my-agents.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="agent-studio">
      <div className="portal-header">
        <div className="portal-header-text">
          <h2 className="portal-title">My agents</h2>
          <p className="portal-sub">Saved in a database on this computer — agents &amp; books persist across browser sessions.</p>
        </div>
        <div className="agent-studio-actions">
          <button type="button" className="debate-action-btn" onClick={handleSyncFromBrowser} disabled={syncing}>
            {syncing ? 'Moving…' : 'Move to database'}
          </button>
          <button type="button" className="debate-action-btn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <button type="button" className="debate-action-btn" onClick={handleExport} disabled={agents.length === 0}>
            Export all
          </button>
          <button type="button" className="prompt-action" onClick={() => setCreating(true)}>
            + New agent
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={handleImportFile} />

      {saveError && <p className="debate-error">{saveError}</p>}
      {saveOk && <p className="debate-info">{saveOk}</p>}

      {loading ? (
        <div className="debate-start-panel">
          <p>Loading agents…</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="debate-start-panel">
          <p>No agents yet.</p>
          <button type="button" className="prompt-action" onClick={() => setCreating(true)}>
            Create your first agent
          </button>
        </div>
      ) : (
        <ul className="agent-library-list">
          {agents.map((agent) => (
            <li key={agent.id} className="agent-library-card" style={{ borderColor: agent.color }}>
              <div className="agent-library-top">
                <div className="agent-card-avatar" style={{ backgroundColor: agent.color }}>
                  {agent.name[0]}
                </div>
                <div className="agent-library-info">
                  {renamingId === agent.id ? (
                    <form
                      className="agent-rename-form"
                      onSubmit={(e) => {
                        e.preventDefault()
                        submitRename(agent.id)
                      }}
                    >
                      <input
                        className="dialog-input agent-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="debate-action-btn">
                        Save
                      </button>
                      <button type="button" className="debate-action-btn" onClick={() => setRenamingId(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="agent-card-name">{agent.name}</div>
                      <div className="agent-card-handle">{agent.handle}</div>
                    </>
                  )}
                </div>
              </div>
              <p className="agent-library-instructions">{agent.instructions}</p>
              {agent.documents?.length > 0 && (
                <p className="agent-doc-badge">
                  {agent.documents.length} book{agent.documents.length > 1 ? 's' : ''} ·{' '}
                  {agent.documents.map((d) => formatDocSize(d)).join(', ')}
                </p>
              )}
              <div className="agent-library-buttons">
                <button
                  type="button"
                  className="debate-action-btn"
                  onClick={() => {
                    setFocusName(true)
                    setEditing(agent)
                  }}
                >
                  Rename
                </button>
                <button type="button" className="debate-action-btn" onClick={() => setEditing(agent)}>
                  Edit
                </button>
                <button type="button" className="debate-action-btn debate-action-btn--new" onClick={() => handleDelete(agent.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {agents.length >= 2 && (
        <div className="agent-studio-footer">
          <button type="button" className="prompt-action" onClick={onStartRoom}>
            Start a conversation →
          </button>
        </div>
      )}

      {(creating || editing) && (
        <AgentEditor
          agent={editing}
          focusName={focusName}
          saveError={saveError}
          onSave={handleSave}
          onCancel={() => {
            setCreating(false)
            setEditing(null)
            setFocusName(false)
          }}
        />
      )}
    </section>
  )
}
