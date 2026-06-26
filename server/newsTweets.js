import { fitResponse, invokeModel } from './llm.js'
import { buildRetrievedKnowledge } from './rag.js'
import { listAgents } from './agentsDb.js'
import { hasNewsPosts, insertFeedPost, listFeedPosts } from './feedDb.js'

const TWEET_MAX_CHARS = 380

export const NEWS_STORIES = [
  {
    id: 'guardian-manufacturing',
    title: 'UK manufacturers hit by sharpest rise in cost inflation since Black Wednesday in 1992',
    url: 'https://www.theguardian.com/business/2026/mar/24/uk-manufacturers-rise-cost-inflation-pmi-oil-prices-iran-war',
    source: 'The Guardian',
    summary:
      'UK manufacturing costs jumped sharply as conflict in the Middle East drove up oil prices. Growth slowed across manufacturing and services. Companies report falling new orders, weaker export sales, and postponed projects.',
  },
  {
    id: 'reuters-policymakers',
    title: 'UK economy shows first hits from Iran war, putting policymakers to the test',
    url: 'https://www.reuters.com/business/energy/uk-economy-shows-first-hits-iran-war-putting-policymakers-test-2026-03-27/',
    source: 'Reuters',
    summary:
      'The OECD sharply cut UK growth forecasts while raising inflation outlook. The Bank of England must balance slowing growth against price rises. The government has limited fiscal room compared with past crises.',
  },
]

function buildPersonaBrief(agent, queryText) {
  const instructions = String(agent.instructions || '').trim()
  const knowledge = buildRetrievedKnowledge(agent, queryText)
  return `You are ${agent.name} (${agent.handle}).

Who you are and what you believe:
${instructions || 'Speak naturally in your own voice.'}
${knowledge ? `\n${knowledge}` : ''}

Fictional persona — NOT a real person.`
}

function buildNewsCommentaryPrompt(agent, article) {
  const queryText = [article.title, article.summary].join('\n')
  return `${buildPersonaBrief(agent, queryText)}

You're posting on social media about this news story:
Title: ${article.title}
Source: ${article.source}
Summary: ${article.summary}

Write ONLY your commentary above the link (aim for ~250 characters, max ${TWEET_MAX_CHARS}).
Rules:
- React as yourself — passionate but honest; you want the best system, not just to score points
- When natural, connect the story to real life: how this hits ordinary people, what would happen next, what system handles it better — not every post needs this
- Do NOT include any URL — the link is attached separately
- Do NOT cite your own books ("as I wrote in…")
- Do NOT open with "I am ${agent.name}"
- One tight take: what this story shows about your worldview

Return ONLY the tweet text.`
}

async function generateNewsCommentary(agent, article) {
  const raw = await invokeModel(buildNewsCommentaryPrompt(agent, article), 500)
  return fitResponse(raw, TWEET_MAX_CHARS)
}

function pickDebaters(agents) {
  const marx = agents.find((a) => /karl marx/i.test(a.name))
  const hayek = agents.find((a) => /hayek/i.test(a.name))
  return { marx, hayek }
}

export async function generateNewsTweets() {
  const { marx, hayek } = pickDebaters(listAgents())
  if (!marx || !hayek) {
    throw new Error('Karl Marx and Friedrich Hayek agents are required in the database.')
  }

  const pairs = [
    { agent: marx, article: NEWS_STORIES[0] },
    { agent: hayek, article: NEWS_STORIES[1] },
  ]

  const now = Date.now()
  const posts = []

  for (let i = 0; i < pairs.length; i++) {
    const { agent, article } = pairs[i]
    const text = await generateNewsCommentary(agent, article)
    posts.push({
      id: `news-${article.id}-${agent.id}`,
      author: agent.id,
      text,
      article: {
        title: article.title,
        url: article.url,
        source: article.source,
      },
      createdAt: new Date(now - (pairs.length - i) * 18 * 60_000).toISOString(),
    })
  }

  return {
    topic: 'In the news',
    posts,
  }
}

export async function ensureNewsTweets() {
  if (hasNewsPosts()) return listFeedPosts()

  const { posts } = await generateNewsTweets()
  for (const post of posts) {
    insertFeedPost(post)
  }
  return listFeedPosts()
}
