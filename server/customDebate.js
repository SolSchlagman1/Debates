import {
  ANTI_CONCESSION_RULES,
  MAX_CHARS,
  TARGET_CHARS,
  RESPONSE_STRUCTURE,
  fitResponse,
  formatThread,
  getParticipantName,
  getPriorPost,
  invokeModel,
  parseJson,
} from './llm.js'

const CUSTOM_VOICE_RULES = `Writing style (strict):
- You are a fierce advocate for your side — passionate, convinced, and fighting to win
- Write like someone who deeply believes their position: strong language, sharp rebuttals, vivid examples
- Plain English with fire — not academic hedging, not "on the other hand" diplomacy
- One complete post; never stop mid-sentence
- Fictional persona, NOT a real person`

const AGENT_COLORS = ['#1d9bf0', '#7856ff']

function normalizeHandle(handle) {
  const raw = String(handle || '').replace(/^@/, '').replace(/\s+/g, '')
  return raw ? `@${raw}` : '@Debater'
}

function normalizeCustomAgents(rawAgents) {
  return rawAgents.slice(0, 2).map((agent, i) => ({
    id: agent.id || (i === 0 ? 'pro' : 'anti'),
    name: String(agent.name || `Debater ${i + 1}`).trim(),
    handle: normalizeHandle(agent.handle || agent.name),
    color: agent.color || AGENT_COLORS[i % AGENT_COLORS.length],
    stance: String(agent.stance || 'Argues one side of the debate').trim(),
  }))
}

function buildCreateDebatePrompt(topic) {
  return `Create a debate between two opposing sides on: "${topic}"

Return JSON only:
{
  "agents": [
    {
      "id": "pro",
      "name": "Display Name",
      "handle": "HandleNoSpaces",
      "color": "#1d9bf0",
      "stance": "One sentence: what they argue FOR",
      "opening": "Their opening post"
    },
    {
      "id": "anti",
      "name": "Display Name",
      "handle": "HandleNoSpaces",
      "color": "#7856ff",
      "stance": "One sentence: what they argue AGAINST / opposing view",
      "opening": "Their opening post"
    }
  ]
}

Rules:
- Two clearly opposing debaters on this specific question — not generic Pro/Anti labels as names
- handle has NO @ symbol and NO spaces
- Names and voices should fit the topic
- Fictional debater personas, NOT real people
- Each opening: aim for ${TARGET_CHARS} characters, max ${MAX_CHARS}, complete thought
- Openings must be passionate advocacy — state your case boldly, not tentatively
- ${CUSTOM_VOICE_RULES}
- ${ANTI_CONCESSION_RULES}
- Return ONLY valid JSON`
}

function buildCustomAgentReplyPrompt({ topic, posts, agents, debater, replyToPost }) {
  const threadSoFar = formatThread(posts, agents)
  const priorPost = getPriorPost(posts, debater.id)
  const priorSpeaker = priorPost ? getParticipantName(priorPost.author, agents) : null

  const replyTarget =
    replyToPost?.author === 'user'
      ? `\nThe host directed you. Follow their prompt:\n"${replyToPost.text}"\n`
      : replyToPost
        ? `\nRespond in substance to:\n"${replyToPost.text}"\n`
        : ''

  const priorPointBlock = priorPost
    ? `Prior point to engage (from ${priorSpeaker}):\n"${priorPost.text}"`
    : `State your position on: "${topic}"`

  return `You are ${debater.name} (${debater.handle}) in a structured pro-vs-against debate. Fictional persona, NOT a real person.

Topic: ${topic}
Your position: ${debater.stance}

${CUSTOM_VOICE_RULES}

${ANTI_CONCESSION_RULES}

${RESPONSE_STRUCTURE}

${priorPointBlock}
${replyTarget}

Debate so far:
${threadSoFar}

Task:
- One post only — aim for ${TARGET_CHARS} characters, max ${MAX_CHARS}
- Fight for your side — rebut hard, concede nothing unless told you lost
- Return ONLY the post text`
}

export async function createCustomDebate(topic) {
  const raw = await invokeModel(buildCreateDebatePrompt(topic.trim()), 1200)
  const data = parseJson(raw)
  const agents = normalizeCustomAgents(data.agents || [])

  const posts = agents.map((agent, i) => {
    const rawAgent = data.agents[i] || {}
    return {
      id: `opening-${agent.id}`,
      author: agent.id,
      text: fitResponse(rawAgent.opening || ''),
      isOpening: true,
    }
  })

  return { topic: topic.trim(), agents, posts }
}

export async function customAgentReply(payload) {
  return fitResponse(await invokeModel(buildCustomAgentReplyPrompt(payload), 700))
}
