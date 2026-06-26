import DebatePost from './DebatePost'
import AgentStrip from './AgentStrip'
import { formatSavedDate } from '../utils/archive'
import { agentMetaLine, DEFAULT_AGENTS, normalizeAgents } from '../constants/debate'

export default function OldChatsPanel({
  archive,
  onView,
  onDelete,
  onClose,
}) {
  if (archive.length === 0) {
    return (
      <div className="old-chats-panel">
        <div className="old-chats-header">
          <h3>Old chats</h3>
          <button type="button" className="old-chats-close" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="old-chats-empty">No saved chats yet. Hit “Save chat” to keep a debate here.</p>
      </div>
    )
  }

  return (
    <div className="old-chats-panel">
      <div className="old-chats-header">
        <h3>Old chats ({archive.length})</h3>
        <button type="button" className="old-chats-close" onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="old-chats-list">
        {archive.map((chat) => {
          const agents = normalizeAgents(chat.agents)
          return (
            <li key={chat.id} className="old-chat-item">
              <button type="button" className="old-chat-view" onClick={() => onView(chat.id)}>
                <span className="old-chat-date">{formatSavedDate(chat.savedAt)}</span>
                <span className="old-chat-meta">{chat.postCount} posts · {agentMetaLine(agents)}</span>
                <span className="old-chat-topic">{chat.topic}</span>
              </button>
              <button
                type="button"
                className="old-chat-delete"
                onClick={() => onDelete(chat.id)}
                aria-label="Delete saved chat"
              >
                Delete
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ArchivedDebateView({ chat, onBack }) {
  const agents = normalizeAgents(chat.agents)

  return (
    <div className="archived-view">
      <div className="archived-view-header">
        <button type="button" className="debate-action-btn" onClick={onBack}>
          ← Back to current debate
        </button>
        <span className="archived-view-meta">Saved {formatSavedDate(chat.savedAt)}</span>
      </div>
      <h2 className="archived-view-title">{chat.topic}</h2>
      <AgentStrip agents={agents} />
      <div className="debate-replies archived-replies">
        {chat.posts.map((post, i) => (
          <DebatePost
            key={post.id}
            post={post}
            agents={agents}
            isLast={i === chat.posts.length - 1}
            isPending={false}
          />
        ))}
      </div>
    </div>
  )
}
