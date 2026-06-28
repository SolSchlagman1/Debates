import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import express from 'express'
import cors from 'cors'
import { generateOpening, agentReply } from './llm.js'
import { createCustomDebate, customAgentReply } from './customDebate.js'
import { startAgentRoom, agentRoomReply } from './agentRoom.js'
import { extractDocumentText } from './documentExtract.js'
import { deleteAgent, getStorageStats, importAgents, listAgents, updateAgentAvatar, upsertAgent } from './agentsDb.js'
import { clearFeedPosts, insertFeedPost, listFeedPosts } from './feedDb.js'
import { getUsageSummary } from './usageCap.js'
import { ensureNewsTweets } from './newsTweets.js'
import { ensureDebateAgents } from './seedAgents.js'
import { ensureFeedSeed } from './feedSeed.js'

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') })

ensureDebateAgents()
ensureFeedSeed()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '55mb' }))

function friendlyError(err) {
  const message = err?.message || ''

  if (message.includes('OPENAI_API_KEY')) {
    return message
  }

  if (message.includes('Incorrect API key') || message.includes('invalid_api_key')) {
    return 'Invalid OpenAI API key. Check OPENAI_API_KEY in .env.'
  }

  if (message.includes('Monthly OpenAI limit')) {
    return message
  }

  return message || 'Something went wrong'
}

function sendApiError(res, err, logLabel) {
  console.error(`${logLabel}:`, err)
  const status = err?.code === 'SPEND_CAP' ? 429 : 500
  res.status(status).json({ error: friendlyError(err) })
}

app.get('/api/config', (_req, res) => {
  res.json({
    publicUrl: process.env.PUBLIC_APP_URL || '',
  })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/usage', (_req, res) => {
  try {
    res.json(getUsageSummary())
  } catch (err) {
    res.status(500).json({ error: 'Failed to load usage' })
  }
})

app.post('/api/agent-reply', async (req, res) => {
  try {
    let { mode = 'panel', story, topic, posts, agents, debater, replyToPost } = req.body

    if (!Array.isArray(posts) || !debater || !Array.isArray(agents)) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (mode === 'agent') {
      const dbAgents = listAgents()
      const byId = Object.fromEntries(dbAgents.map((a) => [a.id, a]))
      agents = agents.map((a) => byId[a.id] || a)
      debater = byId[debater.id] || debater
    }

    const text =
      mode === 'custom'
        ? await customAgentReply({ topic, posts, agents, debater, replyToPost })
        : mode === 'agent'
          ? await agentRoomReply({ topic, posts, agents, debater, replyToPost })
          : await agentReply({ story, topic, posts, agents, debater, replyToPost })
    res.json({ text })
  } catch (err) {
    sendApiError(res, err, 'Agent reply failed')
  }
})

async function handleExtractDocument(req, res) {
  try {
    const { filename, data } = req.body
    if (!data) {
      return res.status(400).json({ error: 'No file received' })
    }

    const buffer = Buffer.from(data, 'base64')
    if (buffer.length > 40 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 40MB)' })
    }

    const result = await extractDocumentText(buffer, filename || 'document')
    if (!result.text) {
      return res.status(400).json({ error: 'Could not read text from this file.' })
    }

    res.json(result)
  } catch (err) {
    console.error('Document extract failed:', err)
    res.status(500).json({ error: err.message || 'Failed to read file' })
  }
}

app.get('/api/agents', (_req, res) => {
  try {
    res.json({ agents: listAgents() })
  } catch (err) {
    console.error('List agents failed:', err)
    res.status(500).json({ error: 'Failed to load agents' })
  }
})

app.get('/api/agents/stats', (_req, res) => {
  try {
    res.json(getStorageStats())
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' })
  }
})

app.post('/api/agents', (req, res) => {
  try {
    const agent = req.body
    if (!agent?.id || !agent?.name?.trim()) {
      return res.status(400).json({ error: 'Invalid agent' })
    }
    const saved = upsertAgent({
      id: agent.id,
      name: agent.name.trim(),
      handle: agent.handle || `@${agent.name.replace(/\s+/g, '')}`,
      color: agent.color || '#1d9bf0',
      instructions: agent.instructions || '',
      avatarUrl: agent.avatarUrl,
      createdAt: agent.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      documents: (agent.documents || []).slice(0, 5).map((doc) => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        text: doc.text || '',
        pages: doc.pages || 0,
        charCount: doc.charCount || doc.text?.length || 0,
        addedAt: doc.addedAt || new Date().toISOString(),
      })),
    })
    res.json({ agent: saved })
  } catch (err) {
    console.error('Save agent failed:', err)
    res.status(500).json({ error: 'Failed to save agent' })
  }
})

app.post('/api/agents/:id/avatar', (req, res) => {
  try {
    const { avatarUrl } = req.body
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return res.status(400).json({ error: 'No image received' })
    }
    if (!avatarUrl.startsWith('data:image/') && !avatarUrl.startsWith('/avatars/')) {
      return res.status(400).json({ error: 'Use a JPG, PNG, or GIF image' })
    }
    if (avatarUrl.startsWith('data:image/') && avatarUrl.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 2MB)' })
    }

    const agent = updateAgentAvatar(req.params.id, avatarUrl)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json({ agent })
  } catch (err) {
    console.error('Avatar upload failed:', err)
    res.status(500).json({ error: 'Failed to save profile picture' })
  }
})

app.post('/api/agents/import', (req, res) => {
  try {
    const { agents } = req.body
    if (!Array.isArray(agents)) {
      return res.status(400).json({ error: 'Invalid import' })
    }
    const normalized = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      handle: agent.handle,
      color: agent.color,
      instructions: agent.instructions || '',
      createdAt: agent.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      documents: agent.documents || [],
    }))
    res.json({ agents: importAgents(normalized) })
  } catch (err) {
    console.error('Import agents failed:', err)
    res.status(500).json({ error: 'Failed to import agents' })
  }
})

app.delete('/api/agents/:id', (req, res) => {
  try {
    deleteAgent(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete agent failed:', err)
    res.status(500).json({ error: 'Failed to delete agent' })
  }
})

app.post('/api/extract-document', handleExtractDocument)
app.post('/api/extract-pdf', handleExtractDocument)

app.post('/api/start-room', async (req, res) => {
  try {
    const { topic, agents } = req.body
    if (!topic?.trim()) {
      return res.status(400).json({ error: 'Enter a topic for the conversation' })
    }
    if (!Array.isArray(agents) || agents.length < 2) {
      return res.status(400).json({ error: 'Pick at least 2 agents' })
    }
    if (agents.length > 6) {
      return res.status(400).json({ error: 'Maximum 6 agents per room' })
    }

    const result = await startAgentRoom(topic.trim(), agents)
    res.json(result)
  } catch (err) {
    sendApiError(res, err, 'Start room failed')
  }
})

app.post('/api/create-debate', async (req, res) => {
  try {
    const { topic } = req.body
    if (!topic?.trim()) {
      return res.status(400).json({ error: 'Enter a debate question' })
    }

    const result = await createCustomDebate(topic.trim())
    res.json(result)
  } catch (err) {
    sendApiError(res, err, 'Create debate failed')
  }
})

app.get('/api/feed', async (_req, res) => {
  try {
    await ensureNewsTweets()
    res.json({ topic: 'In the news', posts: listFeedPosts() })
  } catch (err) {
    sendApiError(res, err, 'Feed failed')
  }
})

app.post('/api/feed', (req, res) => {
  try {
    const post = req.body
    if (!post?.id || !post?.author || !post?.text) {
      return res.status(400).json({ error: 'Invalid post' })
    }
    insertFeedPost(post)
    res.json({ post })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save post' })
  }
})

app.delete('/api/feed', async (_req, res) => {
  try {
    clearFeedPosts()
    await ensureNewsTweets()
    res.json({ topic: 'In the news', posts: listFeedPosts() })
  } catch (err) {
    sendApiError(res, err, 'Feed reset failed')
  }
})

app.post('/api/news-tweets', async (_req, res) => {
  try {
    await ensureNewsTweets()
    res.json({ topic: 'In the news', posts: listFeedPosts() })
  } catch (err) {
    sendApiError(res, err, 'News tweets failed')
  }
})

app.post('/api/generate-opening', async (req, res) => {
  try {
    const { agent, story } = req.body
    if (!agent?.id) {
      return res.status(400).json({ error: 'Missing agent' })
    }

    const result = await generateOpening(agent, story)
    res.json(result)
  } catch (err) {
    sendApiError(res, err, 'Generate opening failed')
  }
})

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(rootDir, 'public')
const distDir = join(rootDir, 'dist')

if (existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }))
}

if (existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false }))
}

if (existsSync(distDir)) {
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (/\.[a-zA-Z0-9]+$/.test(req.path)) {
      return res.status(404).type('text/plain').send('Not found')
    }
    res.sendFile(join(distDir, 'index.html'), (err) => {
      if (err) next(err)
    })
  })
}

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`)
})
