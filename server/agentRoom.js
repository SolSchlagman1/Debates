import {
  fitResponse,
  formatThread,
  getParticipantName,
  getPriorPost,
  invokeModel,
} from './llm.js'
import { buildRetrievalQuery, buildRetrievedKnowledge } from './rag.js'

const AGENT_TARGET_CHARS = 300
const AGENT_MAX_CHARS = 380

const DEBATE_PURPOSE = `The north star of this debate (steer here over time — not every single tweet):
- How does society actually work — who gains, who loses, what drives change?
- What is the best system — or the least bad — for real people?
- How do we make this practical and grounded — applied to society, with examples of how things would actually unfold?

You are speaking to an audience watching this thread. Your job is to win them over — through logic, evidence, and truth — not cheap rhetoric.

You do NOT need to hit all of this every reply. Vary your posts. But when you can, pull abstract claims back to earth: who does what, what happens next, a real scenario.

Debates have phases — the thread may move through several over time (not in fixed order):
- Opening: core principles and what is at stake
- Rebuttal: engage the other side's last move
- Examples / case studies: a country, a crisis, a policy, a historical episode — when it sharpens the argument
- Hypotheticals: "Imagine if…" / "Picture a factory…" / "Suppose the state…" — make abstract claims visible to ordinary readers
- Practicalities: what would actually happen if X won
- Synthesis or concession: admit a point, then rebuild your case
- Structured summary (every so often): "You're saying X. I'm saying Y. The real fight is Z." — help the audience see both sides clearly

Use the phase that fits the moment. Do not force a case study every tweet — bring one in when the debate is ready for it.`

const CONVERSATION_RULES = `How to speak (strict):
- You are trying to WIN this debate — convince the audience your side is right. Argue with force, clarity, and conviction
- Win through logic and truth: strong reasons, clear chains of thought, facts and examples the audience can follow — not slogans, not dodges, not talking past the other person
- You BELIEVE your worldview — defend it passionately, like a sharp civil debater speaking to people watching, not a lecturer
- You are honest: you want the best system, not a hollow victory. If the other side lands a real logical blow, you can concede a point and update — then show why your overall case still stands
- Do NOT cite your own books ("as I wrote in…"). Use the IDEAS as your own convictions
- Do NOT open with "I am [name]" or list credentials
- Engage what others said. If they ignored or dodged your last point, say so briefly ("You haven't answered X…" / "That sidesteps Y…") — then press your case
- AVOID abstract-only replies (dispersion, safeguards, mechanisms, "social labour directed by a plan") with no scene the audience can picture. If you make a theoretical point, show it happening to someone
- Good patterns (mix these up — do not use the same one every time):
  • Hypothetical: "Imagine a factory closes because…" / "Picture a nurse on a ward when…" / "Suppose the state decides…" — then your argument
  • Call out a dodge, then rebut with a reason the audience should care about
  • Push back on theory with practicalities: "Fine in theory — in practice…"
  • A concrete example or brief case study (a country, a reform, a crash) when it lands the point
  • Concede honestly when wrong on a sub-point, then pivot to your stronger argument
  • Structured summary for the audience: "You're saying X. I'm saying Y. The disagreement is really about Z." — use every so often, not constantly
- Sharp but civil — no insults, no straw men. Fight the idea, not the person
- Plain English. When you use an example, make it specific — a workplace, a price rise, a family budget
- Shorter is better — one tight post, not an essay`

function getDebatersLastPost(posts, debaterId) {
  for (let i = posts.length - 1; i >= 0; i--) {
    if (posts[i].author === debaterId) return posts[i]
  }
  return null
}

function buildPhaseHint(posts) {
  const n = posts.length
  if (n <= 2) {
    return '\nPhase note: early in the thread — principles and first clashes. Case studies optional.\n'
  }
  if (n <= 8) {
    return '\nPhase note: mid-debate — good moment for an example or case study if it strengthens your case, or a sharp rebuttal if not.\n'
  }
  return '\nPhase note: later in the thread — synthesize, get practical, or concede a point and rebuild. A case study can still help if fresh.\n'
}

function buildStructureHint(posts) {
  const n = posts.length
  if (n < 4 || n % 7 !== 0) return ''

  return `\nStructured summary (use this reply): spell out the disagreement clearly for the audience — you're saying [their main point], I'm saying [your main point], and the real issue is [Z]. Be fair to their view; then press yours.\n`
}

function isAbstractHeavy(text = '') {
  const sample = String(text).toLowerCase()
  if (!sample.trim()) return false
  if (/imagine|picture|suppose|let's say|for example|a factory|a nurse|a shop|a family|£\d|\d{4}/i.test(text)) {
    return false
  }
  const abstractPhrases = [
    'dispersion',
    'safeguard',
    'accountable plan',
    'social labour',
    'permission to exist',
    'directed by',
    'gates can',
    'mechanism',
    'framework',
    'incentives structure',
    'hegemony',
    'commodity',
  ]
  return abstractPhrases.some((phrase) => sample.includes(phrase))
}

function buildHypotheticalHint(posts, focusPost, structureHint) {
  if (structureHint) return ''

  const recentText = posts
    .slice(-4)
    .map((p) => p.text)
    .join(' ')
  const abstractHeavy = isAbstractHeavy(recentText) || isAbstractHeavy(focusPost?.text)
  const periodic = posts.length >= 3 && posts.length % 5 === 0

  if (!abstractHeavy && !periodic) return ''

  return `\nAccessibility (important this reply): ground your point in a short hypothetical the audience can picture — "Imagine if…" / "Picture…" / "Suppose…" — one concrete scene (a workplace, a shop, a family bill), then your argument. Do not reply with abstract theory alone.\n`
}

function buildUnansweredNote(posts, debaterId) {
  const myLast = getDebatersLastPost(posts, debaterId)
  if (!myLast) return ''

  const myIndex = posts.findIndex((p) => p.id === myLast.id)
  const afterMine = posts.slice(myIndex + 1)
  const opponentSpoke = afterMine.some((p) => p.author !== debaterId && p.author !== 'user')
  if (!opponentSpoke) return ''

  return `\nYour last point in this thread:\n"${myLast.text}"\nIf the other side did not engage it, call that out briefly before answering.\n`
}

function buildPersonaBrief(agent, queryText = '') {
  const instructions = String(agent.instructions || agent.voice || agent.stance || '').trim()
  const knowledge = buildRetrievedKnowledge(agent, queryText)
  return `You are ${agent.name} (${agent.handle}).

Who you are and what you believe:
${instructions || 'Speak naturally in your own voice.'}
${knowledge ? `\n${knowledge}` : ''}

${DEBATE_PURPOSE}

Fictional persona — NOT a real person.`
}

function buildAgentOpeningPrompt(agent, topic) {
  return `${buildPersonaBrief(agent, topic)}

The group is discussing: "${topic}"

Write your opening — state your position on the topic. Prefer a concrete hook (a hypothetical or real-world scene) over pure abstraction.

${CONVERSATION_RULES}

Rules:
- One post only — aim for ${AGENT_TARGET_CHARS} characters, max ${AGENT_MAX_CHARS}
- No self-introduction by name; jump straight into the argument
- Return ONLY the post text`
}

function buildAgentReplyPrompt({ topic, posts, agents, debater, replyToPost }) {
  const threadSoFar = formatThread(posts, agents)
  const priorPost = getPriorPost(posts, debater.id)
  const priorSpeaker = priorPost ? getParticipantName(priorPost.author, agents) : null

  const directReply =
    replyToPost && replyToPost.author !== debater.id && replyToPost.author !== 'user'
      ? replyToPost
      : null
  const focusPost = directReply || priorPost
  const focusSpeaker = focusPost ? getParticipantName(focusPost.author, agents) : null
  const focusHandle =
    focusPost && focusPost.author !== 'user'
      ? agents.find((a) => a.id === focusPost.author)?.handle || ''
      : ''

  const hostNote =
    replyToPost?.author === 'user'
      ? `\nThe host said:\n"${replyToPost.text}"\n`
      : ''

  const priorPointBlock = focusPost
    ? `${focusSpeaker} tweeted:\n"${focusPost.text}"\nReply directly to this — engage their point. You may start with ${focusHandle} if natural.\n`
    : `State your view on: "${topic}"`

  const confusedHost =
    replyToPost?.author === 'user' &&
    /don'?t understand|confused|explain|simpler|plain english|what do you mean/i.test(replyToPost.text || '')
      ? `\nThe host is confused — explain in simpler words, no jargon, one everyday example.\n`
      : ''

  const unansweredNote = buildUnansweredNote(posts, debater.id)
  const phaseHint = buildPhaseHint(posts)
  const structureHint = buildStructureHint(posts)
  const hypotheticalHint = buildHypotheticalHint(posts, focusPost, structureHint)
  const queryText = buildRetrievalQuery({ topic, priorPost: focusPost, replyToPost })

  return `${buildPersonaBrief(debater, queryText)}

Topic: ${topic}

${priorPointBlock}${hostNote}${confusedHost}${unansweredNote}${phaseHint}${structureHint}${hypotheticalHint}

Conversation so far:
${threadSoFar}

${CONVERSATION_RULES}

Task:
- One tweet only — aim for ${AGENT_TARGET_CHARS} characters, max ${AGENT_MAX_CHARS}
- Respond to ${focusSpeaker || 'the thread'}. Win the audience with logic they can follow — use a hypothetical or concrete scene when the thread is getting too abstract
- Return ONLY the tweet text`
}

function fitAgentResponse(text) {
  return fitResponse(text, AGENT_MAX_CHARS)
}

export async function generateAgentOpening(agent, topic) {
  return fitAgentResponse(await invokeModel(buildAgentOpeningPrompt(agent, topic), 500))
}

export async function agentRoomReply(payload) {
  return fitAgentResponse(await invokeModel(buildAgentReplyPrompt(payload), 500))
}

export async function startAgentRoom(topic, agents) {
  const trimmedTopic = topic.trim()
  const posts = []

  const opener = agents[0]
  const openingText = await generateAgentOpening(opener, trimmedTopic)
  const openingPost = {
    id: `opening-${opener.id}`,
    author: opener.id,
    text: openingText,
    isOpening: true,
  }
  posts.push(openingPost)

  if (agents.length >= 2) {
    const responder = agents[1]
    const replyText = await agentRoomReply({
      topic: trimmedTopic,
      posts,
      agents,
      debater: responder,
      replyToPost: openingPost,
    })
    posts.push({
      id: `opening-reply-${responder.id}`,
      author: responder.id,
      text: replyText,
      inReplyTo: openingPost.id,
      isOpening: true,
    })
  }

  return { topic: trimmedTopic, agents, posts }
}
