import { useEffect, useState } from 'react'
import AgentStrip from './AgentStrip'
import DebatePost from './DebatePost'
import ComposeBox from './ComposeBox'
import NewDebateDialog from './NewDebateDialog'
import { checkApiHealth, fetchAgentReply, fetchCreateDebate } from '../api/debate'
import { createPost, getParticipant, isCustomDebate, parseMentions, USER_PARTICIPANT } from '../constants/customDebate'
import { clearCustomDebate, loadCustomDebate, saveCustomDebate } from '../utils/customStorage'

function getInitialState() {
  const saved = loadCustomDebate()
  if (saved && isCustomDebate(saved.agents) && saved.posts?.length > 0) {
    return {
      topic: saved.topic,
      agents: saved.agents,
      posts: saved.posts,
      lastMentioned: saved.lastMentioned || [],
      draft: saved.draft || '',
      started: true,
    }
  }
  return {
    topic: '',
    agents: [],
    posts: [],
    lastMentioned: [],
    draft: '',
    started: false,
  }
}

export default function CustomDebatePortal() {
  const initial = getInitialState()
  const [topic, setTopic] = useState(initial.topic)
  const [agents, setAgents] = useState(initial.agents)
  const [posts, setPosts] = useState(initial.posts)
  const [draft, setDraft] = useState(initial.draft)
  const [taggedIds, setTaggedIds] = useState(new Set())
  const [lastMentioned, setLastMentioned] = useState(initial.lastMentioned)
  const [posting, setPosting] = useState(false)
  const [pendingAgentIds, setPendingAgentIds] = useState([])
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [apiOnline, setApiOnline] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(!initial.started)
  const [creating, setCreating] = useState(false)

  const started = posts.length > 0

  useEffect(() => {
    checkApiHealth().then(setApiOnline)
  }, [])

  useEffect(() => {
    if (started) {
      saveCustomDebate({ topic, agents, posts, lastMentioned, draft })
    }
  }, [topic, agents, posts, lastMentioned, draft, started])

  function toggleTag(agentId) {
    setTaggedIds((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  function getExplicitMentions(text) {
    const fromText = parseMentions(text, agents)
    const fromTags = [...taggedIds].filter((id) => !fromText.includes(id))
    return [...new Set([...fromText, ...fromTags])]
  }

  async function requestAgentReplies(userPost, mentioned, thread) {
    for (const agentId of mentioned) {
      setPendingAgentIds((prev) => [...prev, agentId])

      try {
        const debater = getParticipant(agentId, agents)
        const replyText = await fetchAgentReply({
          mode: 'custom',
          topic,
          posts: thread,
          agents,
          debater,
          replyToPost: userPost,
        })

        const agentPost = createPost({
          author: agentId,
          text: replyText,
          inReplyTo: userPost.id,
        })

        thread = [...thread, agentPost]
        setPosts((prev) => [...prev, agentPost])
      } finally {
        setPendingAgentIds((prev) => prev.filter((id) => id !== agentId))
      }
    }

    return thread
  }

  async function handlePost() {
    const text = draft.trim()
    if (!text) return

    setError(null)
    setInfo(null)
    setPosting(true)

    const userPost = createPost({ author: 'user', text })
    const explicit = getExplicitMentions(text)
    const mentioned = explicit.length > 0 ? explicit : lastMentioned

    setPosts((prev) => [...prev, userPost])
    setDraft('')
    setTaggedIds(new Set())

    if (mentioned.length === 0) {
      setInfo(`Tag ${agents.map((a) => a.handle).join(' or ')} to get a reply.`)
      setPosting(false)
      return
    }

    if (explicit.length > 0) setLastMentioned(explicit)

    let thread = [...posts, userPost]

    try {
      await requestAgentReplies(userPost, mentioned, thread)
    } catch (err) {
      setError(err.message)
      setApiOnline(await checkApiHealth())
    } finally {
      setPosting(false)
      setPendingAgentIds([])
    }
  }

  async function handleCreateDebate(newTopic) {
    setCreating(true)
    setError(null)

    try {
      const result = await fetchCreateDebate(newTopic)
      clearCustomDebate()
      setTopic(result.topic)
      setAgents(result.agents)
      setPosts(result.posts)
      setDraft('')
      setLastMentioned([])
      setTaggedIds(new Set())
      setDialogOpen(false)
      setInfo(`Debate started with ${result.agents.map((a) => a.name).join(' vs ')}. Tag them to continue.`)
    } catch (err) {
      setError(err.message)
      setApiOnline(await checkApiHealth())
    } finally {
      setCreating(false)
    }
  }

  function handleNewDebate() {
    setDialogOpen(true)
  }

  const displayPosts = [
    ...posts,
    ...pendingAgentIds.map((agentId) => ({
      id: `pending-${agentId}`,
      author: agentId,
      text: '',
      pending: true,
    })),
  ]

  return (
    <section className="debate-thread custom-portal">
      <div className="portal-header">
        <div className="portal-header-text">
          <h2 className="portal-title">Your own debate</h2>
          <p className="portal-sub">Ask a question — AI creates pro and against.</p>
        </div>
        {started && (
          <button type="button" className="debate-action-btn debate-action-btn--new" onClick={handleNewDebate}>
            New question
          </button>
        )}
      </div>

      {error && <p className="debate-error">{error}</p>}
      {info && !error && <p className="debate-info">{info}</p>}
      {!apiOnline && <p className="debate-error">AI backend is offline. Run: npm run dev</p>}

      {!started && !dialogOpen && (
        <div className="debate-start-panel">
          <p>Ask anything — two opposing debaters are created for you.</p>
          <button type="button" className="prompt-action" onClick={() => setDialogOpen(true)}>
            Ask a question
          </button>
        </div>
      )}

      {started && (
        <>
          <header className="debate-header">
            <h2>{topic}</h2>
            <span className="debate-meta">{agents.map((a) => a.name).join(' · ')} · You</span>
          </header>
          <AgentStrip agents={agents} />
        </>
      )}

      <div className="debate-replies">
        {displayPosts.map((post, i) => (
          <DebatePost
            key={post.id}
            post={post}
            agents={agents}
            isLast={i === displayPosts.length - 1 && !posting}
            isPending={post.pending || pendingAgentIds.includes(post.author)}
            getParticipant={getParticipant}
          />
        ))}
      </div>

      {started && (
        <ComposeBox
          draft={draft}
          agents={agents}
          taggedIds={taggedIds}
          posting={posting}
          lastMentioned={lastMentioned}
          onDraftChange={setDraft}
          onToggleTag={toggleTag}
          onPost={handlePost}
          hostLabel="You"
          userParticipant={USER_PARTICIPANT}
          placeholder={`Join the debate… tag ${agents.map((a) => a.handle).join(' or ')}`}
        />
      )}

      {dialogOpen && (
        <NewDebateDialog
          loading={creating}
          onStart={handleCreateDebate}
          onCancel={() => (started ? setDialogOpen(false) : null)}
        />
      )}
    </section>
  )
}
