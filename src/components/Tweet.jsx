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
                className="tweet-reply-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onReply(post)
                }}
              >
                Reply
              </button>
            )}
            {onShare && (
              <button
                type="button"
                className="tweet-share-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onShare()
                }}
              >
                Share
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
