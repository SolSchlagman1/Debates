export const USER_PARTICIPANT = {
  id: 'user',
  name: 'Host',
  handle: '@host',
  color: '#00ba7c',
}

export const DEBATE_TOPIC = 'Should the UK increase capital gains tax?'

export const OPENING_SPEAKER_ID = 'centre'

export const AUTO_DEBATE_ORDER = ['right', 'left']

export const PANEL_CHARACTERS = [
  {
    id: 'left',
    name: 'Left',
    handle: '@Left',
    color: '#e0245e',
    perspective: 'left',
    voice:
      'Workers on PAYE bear the full tax load while selling assets is taxed more lightly. A serious case for raising CGT and spending it on public services.',
  },
  {
    id: 'right',
    name: 'Right',
    handle: '@Right',
    color: '#7856ff',
    perspective: 'right',
    voice:
      'Taxing capital gains more heavily discourages investment, property sales, and risk-taking. A serious case for keeping rates low and predictable.',
  },
  {
    id: 'centre',
    name: 'Centre',
    handle: '@Centre',
    color: '#ffad1f',
    perspective: 'centre',
    voice:
      'Neither automatic yes nor no. A serious case for weighing who pays, how much revenue it raises, and whether the design avoids nasty surprises.',
  },
]

export const IDEOLOGY_AGENTS = PANEL_CHARACTERS
export const DEFAULT_AGENTS = PANEL_CHARACTERS
export const DEFAULT_DEBATE_TOPIC = DEBATE_TOPIC
export const OPENING_POSTS = []

export function getParticipant(author, agents = PANEL_CHARACTERS) {
  if (author === 'user') return USER_PARTICIPANT
  return agents.find((a) => a.id === author) ?? USER_PARTICIPANT
}

export function parseMentions(text, agents = PANEL_CHARACTERS) {
  const mentions = []
  for (const agent of agents) {
    const handle = agent.handle.replace('@', '')
    const pattern = new RegExp(`@${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (pattern.test(text)) mentions.push(agent.id)
  }
  return mentions
}

export function agentMetaLine() {
  return 'Round table · Host'
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

export function isPanelDebate(agents) {
  return Array.isArray(agents) && agents.length === PANEL_CHARACTERS.length
}

export const isIdeologyDebate = isPanelDebate

export function normalizeAgents(agents) {
  if (!isPanelDebate(agents)) return PANEL_CHARACTERS.map((a) => ({ ...a }))
  return agents.map((agent) => {
    const base = PANEL_CHARACTERS.find((a) => a.id === agent.id) || agent
    return { ...base, ...agent, voice: base.voice || agent.voice, ideology: base.voice || agent.voice }
  })
}
