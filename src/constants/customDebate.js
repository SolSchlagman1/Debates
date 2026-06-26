export const USER_PARTICIPANT = {
  id: 'user',
  name: 'You',
  handle: '@you',
  color: '#00ba7c',
}

export function getParticipant(author, agents) {
  if (author === 'user') return USER_PARTICIPANT
  return agents.find((a) => a.id === author) ?? USER_PARTICIPANT
}

export function parseMentions(text, agents) {
  const mentions = []
  for (const agent of agents) {
    const handle = agent.handle.replace('@', '')
    const pattern = new RegExp(`@${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (pattern.test(text)) mentions.push(agent.id)
  }
  return mentions
}

export function createPost({ author, text, inReplyTo = null }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    text,
    inReplyTo,
    createdAt: new Date().toISOString(),
  }
}

export function isCustomDebate(agents) {
  return Array.isArray(agents) && agents.length === 2
}
