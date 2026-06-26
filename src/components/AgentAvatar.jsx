export default function AgentAvatar({ participant, className = 'avatar' }) {
  if (participant?.avatarUrl) {
    return <img src={participant.avatarUrl} alt="" className={`${className} agent-avatar-img`} />
  }

  return (
    <div className={className} style={{ backgroundColor: participant?.color || '#1d9bf0' }}>
      {participant?.name?.[0] || '?'}
    </div>
  )
}
