export default function NewDebateDialog({ onStart, onCancel, loading }) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-labelledby="new-debate-title">
        <h3 id="new-debate-title">Start a new debate</h3>
        <p className="dialog-text">
          Your current chat saves to Old chats. Type a question — the AI creates two debaters on opposite sides, each with a clear position.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const topic = new FormData(e.currentTarget).get('topic')?.toString().trim()
            if (topic) onStart(topic)
          }}
        >
          <label className="prompt-field">
            <span className="prompt-label">Debate title</span>
            <input
              name="topic"
              type="text"
              className="dialog-input"
              placeholder="e.g. Should AI be regulated by government?"
              autoFocus
              disabled={loading}
              required
            />
          </label>
          <div className="dialog-actions">
            <button type="button" className="debate-action-btn" onClick={onCancel} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="prompt-action" disabled={loading}>
              {loading ? 'Starting…' : 'Start debate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
