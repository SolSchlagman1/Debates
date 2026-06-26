import { USER_PARTICIPANT as DEFAULT_USER } from '../constants/debate'

export default function ComposeBox({
  draft,
  agents,
  taggedIds,
  posting,
  lastMentioned,
  onDraftChange,
  onToggleTag,
  onPost,
  hostLabel = 'Host',
  userParticipant = DEFAULT_USER,
  placeholder,
}) {
  const canPost = draft.trim().length > 0 && !posting

  function insertMention(handle) {
    const mention = handle + ' '
    if (draft.includes(handle)) return
    onDraftChange(draft ? `${draft.trimEnd()} ${mention}` : mention)
  }

  function handleToggle(agent) {
    onToggleTag(agent.id)
    insertMention(agent.handle)
  }

  const agentNames = (ids) =>
    ids.map((id) => agents.find((a) => a.id === id)?.name).filter(Boolean).join(', ')

  const replyHint =
    lastMentioned.length > 0
      ? `Will call on: ${agentNames(lastMentioned)}`
      : 'Tap someone below, or tag them here'

  const tagHint = agents.map((a) => a.handle).join(' ')

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canPost) onPost()
    }
  }

  return (
    <footer className="compose-box">
      <div className="compose-header">
        <div className="avatar" style={{ backgroundColor: userParticipant.color }}>
          {userParticipant.name[0]}
        </div>
        <span className="compose-label">{hostLabel}</span>
      </div>

      <p className="compose-hint">{replyHint}</p>

      <textarea
        className="compose-input"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || `Guide the round table… tag who should speak, e.g. ${tagHint}`}
        rows={3}
        disabled={posting}
      />

      <div className="compose-tags">
        <span className="compose-tags-label">Call on:</span>
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className={`tag-chip${taggedIds.has(agent.id) ? ' tag-chip--active' : ''}`}
            style={
              taggedIds.has(agent.id)
                ? { borderColor: agent.color, color: agent.color, background: `${agent.color}22` }
                : undefined
            }
            onClick={() => handleToggle(agent)}
            disabled={posting}
          >
            {agent.handle}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="prompt-action compose-post"
        onClick={onPost}
        disabled={!canPost}
      >
        {posting ? 'Posting…' : 'Post'}
      </button>
    </footer>
  )
}
