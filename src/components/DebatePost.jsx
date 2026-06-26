import { getParticipant as defaultGetParticipant } from '../constants/debate'

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

export default function DebatePost({ post, agents, isLast, isPending, getParticipant = defaultGetParticipant }) {
  const participant = getParticipant(post.author, agents)

  return (
    <article className={`debate-reply${isLast ? ' debate-reply--last' : ''}${post.author === 'user' ? ' debate-reply--user' : ''}`}>
      <div className="reply-rail">
        <div className="avatar" style={{ backgroundColor: participant.color }}>
          {participant.name[0]}
        </div>
        {!isLast && <div className="thread-line" />}
      </div>

      <div className="reply-body">
        <header className="reply-header">
          <span className="reply-name">{participant.name}</span>
          <span className="reply-handle">{participant.handle}</span>
          <span className="reply-dot">·</span>
          <span className="reply-time">now</span>
        </header>

        <p className={`reply-text${isPending ? ' reply-text--loading' : ''}`}>
          {isPending ? 'Replying…' : renderMentions(post.text, agents)}
        </p>
      </div>
    </article>
  )
}
