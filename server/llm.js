import { assertWithinCap, recordUsage } from './usageCap.js'

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5'
const REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || 'low'

const DEBATE_TOPIC = 'Should the UK increase capital gains tax?'

export const MAX_CHARS = 600
export const TARGET_CHARS = 520

export const VOICE_RULES = `Writing style (strict):
- You are a committed advocate for your side — passionate, confident, and direct. You BELIEVE what you argue
- Plain English with conviction: strong claims, vivid examples, numbers where useful — not dry hedging or both-sides softening
- Ground arguments in UK specifics (who pays, buy-to-let, business sale, PAYE worker). Use plausible figures; say "roughly" when estimating
- One complete post; never stop mid-sentence
- NOT a real person, NOT a named expert, NOT an impersonation`

export const ANTI_CONCESSION_RULES = `Advocacy rules (strict — only concede if the prompt explicitly says you lost):
- Do NOT concede, hedge, or validate the other side. Banned phrases include: "I see your point", "fair point", "you're right that", "both sides", "there's truth in", "I respectfully disagree but", "valid concern", "I understand why you think"
- Do NOT sound balanced, diplomatic, or like a moderator. You are here to WIN the argument for your side
- Rebut the prior speaker — explain why they are wrong, overstating, or missing the point
- If you must reference their fact, immediately show why it does NOT undermine your position
- Stay civil — passionate does not mean rude or insulting`

export const RESPONSE_STRUCTURE = `Response structure:
- Rebut the prior speaker's specific claim directly — why they are wrong or incomplete
- Then advance your own argument with a fresh fact, example, or scenario
- End on your side's strength, not on agreement or common ground`

const PANEL_VOICES = [
  {
    id: 'left',
    name: 'Left',
    voice: 'Workers on PAYE bear the full tax load; asset gains are taxed more lightly. Raise CGT, fund public services.',
  },
  {
    id: 'right',
    name: 'Right',
    voice: 'Higher CGT discourages investment and property sales. Keep rates low and predictable.',
  },
  {
    id: 'centre',
    name: 'Centre',
    voice: 'Weigh who pays, revenue raised, and whether design avoids cliff edges — neither yes nor no by default.',
  },
]

function cleanResponse(text) {
  return text.replace(/^["']|["']$/g, '').trim()
}

export function fitResponse(text, max = MAX_CHARS) {
  text = cleanResponse(text)
  if (text.length <= max) return text

  const chunk = text.slice(0, max)
  const sentenceMatches = [...chunk.matchAll(/[.!?](?:\s|$)/g)]
  if (sentenceMatches.length > 0) {
    const last = sentenceMatches[sentenceMatches.length - 1]
    const end = last.index + 1
    if (end >= max * 0.5) return chunk.slice(0, end).trim()
  }

  const lastSpace = chunk.lastIndexOf(' ')
  if (lastSpace > max * 0.5) return chunk.slice(0, lastSpace).trim()

  return chunk.trim()
}

export function parseJson(text) {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Invalid AI response')
  return JSON.parse(cleaned.slice(start, end + 1))
}

export function formatThread(posts, agents) {
  const lookup = Object.fromEntries(agents.map((a) => [a.id, a]))
  const user = { name: 'Host', handle: '@host' }

  return posts
    .map((post) => {
      const p = post.author === 'user' ? user : lookup[post.author] ?? user
      return `${p.name}: ${post.text}`
    })
    .join('\n\n')
}

export function getParticipantName(authorId, agents) {
  if (authorId === 'user') return 'Moderator'
  return agents.find((a) => a.id === authorId)?.name || authorId
}

export function getPriorPost(posts, debaterId) {
  for (let i = posts.length - 1; i >= 0; i--) {
    const post = posts[i]
    if (post.author === debaterId) continue
    if (post.author === 'user') continue
    return post
  }

  for (let i = posts.length - 1; i >= 0; i--) {
    const post = posts[i]
    if (post.author !== debaterId) return post
  }

  return null
}

function buildStoryContext(story) {
  if (!story) {
    return `Question: "${DEBATE_TOPIC}"`
  }

  const details = (story.details || []).map((p) => `- ${p}`).join('\n')
  return `Headline: ${story.headline}
${story.dek ? `Summary: ${story.dek}` : ''}
${details ? `Background:\n${details}` : ''}
Question: "${story.question || DEBATE_TOPIC}"`
}

function buildPerspectiveBrief(agent) {
  const panel = PANEL_VOICES.find((i) => i.id === agent.id)
  const label = panel?.name || agent.name
  const voice = panel?.voice || agent.voice || agent.ideology || ''

  return `Panel voice: ${label}
Perspective: ${voice}
You are this viewpoint only — not a real human, not a named individual.`
}

function buildOpeningPrompt(agent, story) {
  const question = story?.question || DEBATE_TOPIC

  return `A serious newspaper round table after this story.

${buildStoryContext(story)}

Write an opening statement for one panel voice only.

${buildPerspectiveBrief(agent)}

${VOICE_RULES}

${ANTI_CONCESSION_RULES}

Return JSON only:
{
  "stance": "One sentence: this perspective's position on the question",
  "opening": "Their opening statement"
}

Rules:
- One post only — aim for ${TARGET_CHARS} characters, max ${MAX_CHARS}
- Open with a concrete UK example; argue this perspective with passion and conviction
- ${ANTI_CONCESSION_RULES}
- Return ONLY valid JSON`
}

export function buildAgentReplyPrompt({ story, topic, posts, agents, debater, replyToPost }) {
  const threadSoFar = formatThread(posts, agents)
  const priorPost = getPriorPost(posts, debater.id)
  const priorSpeaker = priorPost ? getParticipantName(priorPost.author, agents) : null

  const replyTarget =
    replyToPost?.author === 'user'
      ? `\nThe host invited you to speak. Follow their prompt while obeying the response structure:\n"${replyToPost.text}"\n`
      : replyToPost
        ? `\nYou are responding in substance to:\n"${replyToPost.text}"\n`
        : ''

  const priorPointBlock = priorPost
    ? `Immediately prior point you must engage (from ${priorSpeaker}):
"${priorPost.text}"`
    : `There is no prior point yet. Give your view on the question clearly.`

  return `You speak for the ${debater.name} panel voice at a serious newspaper round table. NOT a real person.

${buildPerspectiveBrief(debater)}

${buildStoryContext(story)}

${debater.stance ? `Your stated position: ${debater.stance}` : ''}

${VOICE_RULES}

${ANTI_CONCESSION_RULES}

${RESPONSE_STRUCTURE}

${priorPointBlock}
${replyTarget}

Conversation so far:
${threadSoFar}

Task:
- One post only — aim for ${TARGET_CHARS} characters, never exceed ${MAX_CHARS}
- Argue your side with passion — rebut the prior speaker, do not concede
- Return ONLY the post text — no name, no labels, no preamble`
}

export async function invokeModel(prompt, maxTokens = 300) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error('Missing OPENAI_API_KEY. Add your personal key to .env — see .env.example')
  }

  assertWithinCap()

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_completion_tokens: Math.max(maxTokens, 500),
      reasoning_effort: REASONING_EFFORT,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = body?.error?.message || response.statusText
    throw new Error(detail || 'OpenAI API request failed')
  }

  recordUsage(body.usage)

  return body.choices?.[0]?.message?.content?.trim() ?? ''
}

export async function generateOpening(agent, story) {
  const raw = await invokeModel(buildOpeningPrompt(agent, story), 700)
  const data = parseJson(raw)

  const updatedAgent = {
    ...agent,
    stance: String(data.stance || agent.stance || 'Argues from their worldview').trim(),
  }

  const posts = [
    {
      id: `opening-${agent.id}`,
      author: agent.id,
      text: fitResponse(data.opening || ''),
      isOpening: true,
    },
  ]

  return { agent: updatedAgent, posts, topic: story?.question || DEBATE_TOPIC }
}

export async function agentReply(payload) {
  return fitResponse(await invokeModel(buildAgentReplyPrompt(payload), 700))
}
