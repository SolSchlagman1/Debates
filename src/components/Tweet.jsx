import { useEffect, useRef } from 'react'
import { getParticipant as defaultGetParticipant } from '../constants/agentCore'
import AgentAvatar from './AgentAvatar'

function buildMentionPattern(agents) {
  const handles = agents.map((a) => a.handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(${handles.join('|')})`, 'gi')
}

function renderMentions(text, agents) {
  const pattern = buildMentionPattern(agents)
  const parts = text.split(pattern)

  return parts.map((part, i) => {
    const agent = agents.find((a) => a.handle.toLowerCase() === part.toLowerCase())
    if (agent) {
      return (
        <span key={i} className="mention" style={{ color: agent.color }}>
          {agent.handle}
        </span>
      )
    }
    return part
  })
}

function formatTime(iso) {
  if (!iso) return 'now'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default function Tweet({
  post,
  agents,
  isPending,
  isRoot = false,
  isLast = true,
  hasThreadBelow = false,
  highlighted = false,
  onOpen = null,
  onShare = null,
  tweetRef = null,
  getParticipant = defaultGetParticipant,
  onReply = null,
  canReply = false,
}) {
  const participant = getParticipant(post.author, agents)
  const inThread = !isRoot
  const articleRef = useRef(null)

  useEffect(() => {
    if (tweetRef) tweetRef(articleRef.current)
  }, [tweetRef, post.id])

  function handleOpen() {
    if (!isPending && onOpen) onOpen()
  }

  return (
    <article
      ref={articleRef}
      id={`tweet-${post.id}`}
      className={`tweet${post.author === 'user' ? ' tweet--user' : ''}${isRoot ? ' tweet--root' : ' tweet--in-thread'}${onOpen ? ' tweet--clickable' : ''}${highlighted ? ' tweet--highlighted' : ''}`}
      onClick={onOpen ? handleOpen : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleOpen()
              }
            }
          : undefined
      }
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <div className="tweet-rail">
        <AgentAvatar participant={participant} className="avatar tweet-avatar" />
        {(hasThreadBelow || (inThread && !isLast)) && <div className="thread-line" />}
      </div>

      <div className="tweet-body">
        <header className="tweet-header">
          <span className="tweet-name">{participant.name}</span>
          <span className="tweet-handle">{participant.handle}</span>
          <span className="tweet-dot">·</span>
          <span className="tweet-time">{formatTime(post.createdAt)}</span>
        </header>

        <p className={`tweet-text${isPending ? ' tweet-text--loading' : ''}`}>
          {isPending ? 'Posting…' : renderMentions(post.text, agents)}
        </p>

        {post.article?.url && !isPending && (
          <a
            className="tweet-link-card"
            href={post.article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="tweet-link-source">{post.article.source}</span>
            <span className="tweet-link-title">{post.article.title}</span>
            <span className="tweet-link-url">{post.article.url.replace(/^https?:\/\//, '')}</span>
          </a>
        )}

        {!isPending && (
          <div className="tweet-actions">
            {canReply && onReply && (
              <button
                type="button"
                className="tweet-action-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onReply(post)
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h3.516v1.7l5.249-2.91c1.902-1.05 3.094-3.02 3.094-5.15 0-3.37-2.77-6.13-8.129-6.13H9.756z"
                  />
                </svg>
                <span>Reply</span>
              </button>
            )}
            {onShare && (
              <button
                type="button"
                className="tweet-action-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onShare()
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.29 3.3-1.41-1.42L12 2.59zM5 18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2h2v2c0 2.21-1.79 4-4 4H7c-2.21 0-4-1.79-4-4v-2h2v2z"
                  />
                </svg>
                <span>Share</span>
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
