import { useEffect, useRef, useState } from 'react'
import { fetchExtractDocument } from '../api/debate'
import { createAgentId, createDocumentId, formatDocSize, normalizeAgent } from '../utils/agentLibrary'

const EMPTY = {
  name: '',
  handle: '',
  color: '#1d9bf0',
  instructions: '',
  documents: [],
}

export default function AgentEditor({ agent, onSave, onCancel, focusName = false, saveError = null }) {
  const [form, setForm] = useState(agent ? normalizeAgent(agent) : { ...EMPTY, id: createAgentId() })
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState(null)
  const [docNotice, setDocNotice] = useState(null)
  const jsonRef = useRef(null)
  const docRef = useRef(null)
  const nameRef = useRef(null)

  useEffect(() => {
    if (agent) setForm(normalizeAgent(agent))
    else setForm({ ...EMPTY, id: createAgentId(), color: '#1d9bf0', documents: [] })
  }, [agent])

  useEffect(() => {
    if (focusName) nameRef.current?.focus()
  }, [focusName, agent])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleJsonUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const data = Array.isArray(parsed) ? parsed[0] : parsed.agents?.[0] || parsed
        setForm(normalizeAgent({ ...form, ...data, id: form.id }))
      } catch {
        alert('Could not read that file. Use a JSON agent file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleDocUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.pdf') && !lower.endsWith('.epub') && !lower.endsWith('.mobi') && !lower.endsWith('.azw') && !lower.endsWith('.azw3') && !lower.endsWith('.prc') && !lower.endsWith('.txt')) {
      setDocError('Use a PDF, EPUB, Kindle (MOBI/AZW), or TXT ebook.')
      return
    }

    if (form.documents?.length >= 5) {
      setDocError('Maximum 5 files per agent.')
      return
    }

    setDocLoading(true)
    setDocError(null)
    setDocNotice(null)

    try {
      const result = await fetchExtractDocument(file)
      const doc = {
        id: createDocumentId(),
        name: result.name || file.name,
        type: result.type || (lower.endsWith('.epub') ? 'epub' : lower.endsWith('.txt') ? 'txt' : lower.match(/\.(mobi|azw|azw3|prc)$/) ? 'mobi' : 'pdf'),
        text: result.text,
        pages: result.pages,
        charCount: result.charCount || result.text?.length || 0,
        addedAt: new Date().toISOString(),
      }
      setForm((prev) => ({
        ...prev,
        documents: [...(prev.documents || []), doc],
      }))
      setDocNotice(`Full book saved (${formatDocSize(doc)}). Click Save agent.`)
    } catch (err) {
      setDocError(err.message)
    } finally {
      setDocLoading(false)
    }
  }

  function removeDocument(docId) {
    setForm((prev) => ({
      ...prev,
      documents: (prev.documents || []).filter((d) => d.id !== docId),
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (!form.instructions.trim()) return
    onSave(normalizeAgent(form))
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog agent-editor" role="dialog">
        <h3>{agent ? 'Edit agent' : 'Create agent'}</h3>
        <p className="dialog-text">
          Name your agent, write instructions, and optionally attach ebooks. Click <strong>Save agent</strong> — it stays on this device.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="prompt-field">
            <span className="prompt-label">Name</span>
            <input
              ref={nameRef}
              className="dialog-input"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g. Sunny the Optimist"
              required
            />
          </label>
          <label className="prompt-field">
            <span className="prompt-label">Handle (for @mentions)</span>
            <input
              className="dialog-input"
              value={form.handle}
              onChange={(e) => updateField('handle', e.target.value)}
              placeholder="e.g. @Sunny"
            />
          </label>
          <label className="prompt-field">
            <span className="prompt-label">Colour</span>
            <input
              type="color"
              className="agent-color-input"
              value={form.color}
              onChange={(e) => updateField('color', e.target.value)}
            />
          </label>
          <label className="prompt-field">
            <span className="prompt-label">Instructions</span>
            <textarea
              className="agent-instructions"
              value={form.instructions}
              onChange={(e) => updateField('instructions', e.target.value)}
              placeholder="Describe personality, expertise, tone, and what this agent cares about…"
              rows={6}
              required
            />
          </label>

          <div className="agent-docs-section">
            <span className="prompt-label">Knowledge (ebooks)</span>
            <p className="agent-docs-hint">Full ebooks stored on this device — smart search uses relevant sections in chat.</p>
            {(form.documents || []).map((doc) => (
              <div key={doc.id} className="agent-doc-row">
                <span className="agent-doc-name">
                  {doc.type === 'epub' || doc.type === 'mobi' || doc.type === 'txt' ? '📚' : '📄'} {doc.name}
                </span>
                <span className="agent-doc-meta">
                  {formatDocSize(doc)}
                  {doc.pages
                    ? doc.type === 'epub' || doc.type === 'mobi'
                      ? ` · ${doc.pages} ch`
                      : ` · ${doc.pages} pp`
                    : ''}
                </span>
                <button type="button" className="debate-action-btn debate-action-btn--new" onClick={() => removeDocument(doc.id)}>
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="debate-action-btn"
              onClick={() => docRef.current?.click()}
              disabled={docLoading || (form.documents?.length || 0) >= 5}
            >
              {docLoading ? 'Reading file…' : '+ Upload ebook'}
            </button>
            {docNotice && <p className="agent-doc-notice">{docNotice}</p>}
            {docError && <p className="agent-doc-error">{docError}</p>}
          </div>

          <div className="agent-editor-import">
            <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={handleJsonUpload} />
            <button type="button" className="debate-action-btn" onClick={() => jsonRef.current?.click()}>
              Import from JSON
            </button>
          </div>
          <input
            ref={docRef}
            type="file"
            accept=".pdf,.epub,.mobi,.azw,.azw3,.prc,.txt,application/pdf,application/epub+zip,text/plain"
            hidden
            onChange={handleDocUpload}
          />

          <div className="dialog-actions">
            {saveError && <p className="agent-doc-error agent-save-error">{saveError}</p>}
            <button type="button" className="debate-action-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="prompt-action">
              Save agent
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
