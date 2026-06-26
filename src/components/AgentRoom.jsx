import { useEffect, useState } from 'react'
import AgentStrip from './AgentStrip'
import DebatePost from './DebatePost'
import ComposeBox from './ComposeBox'
import { checkApiHealth, fetchAgentReply, fetchStartRoom } from '../api/debate'
import { createPost, getParticipant, parseMentions, USER_PARTICIPANT } from '../constants/agentCore'
import { loadAgentLibrary } from '../utils/agentLibrary'
import { clearAgentRoom, loadAgentRoom, saveAgentRoom } from '../utils/agentRoomStorage'

function getInitialState() {
  const saved = loadAgentRoom()
  if (saved?.agents?.length >= 2 && saved.posts?.length > 0) {
    return {
      topic: saved.topic,
      agents: saved.agents,
      posts: saved.posts,
      lastMentioned: saved.lastMentioned || [],
      draft: saved.draft || '',
      started: true,
      setup: false,
    }
  }
  return {
    topic: '',
    agents: [],
    selectedIds: [],
    posts: [],
    lastMentioned: [],
    draft: '',
    started: false,
    setup: true,
  }
}

export default function AgentRoom({ onManageAgents }) {
  const initial = getInitialState()
  const [topic, setTopic] = useState(initial.topic)
  const [library, setLibrary] = useState([])
  const [selectedIds, setSelectedIds] = useState(initial.selectedIds || [])
  const [agents, setAgents] = useState(initial.agents)
  const [posts, setPosts] = useState(initial.posts)
  const [draft, setDraft] = useState(initial.draft)
  const [taggedIds, setTaggedIds] = useState(new Set())
  const [lastMentioned, setLastMentioned] = useState(initial.lastMentioned)
  const [posting, setPosting] = useState(false)
  const [pendingAgentIds, setPendingAgentIds] = useState([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [apiOnline, setApiOnline] = useState(true)
  const [setup, setSetup] = useState(initial.setup && !initial.started)

  const started = posts.length > 0

  useEffect(() => {
    loadAgentLibrary().then(setLibrary)
    checkApiHealth().then(setApiOnline)
  }, [])

  useEffect(() => {
    if (started) {
      saveAgentRoom({ topic, agents, posts, lastMentioned, draft })
    }
  }, [topic, agents, posts, lastMentioned, draft, started])

  function toggleAgent(id) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 6) return prev
      return [...prev, id]
    })
  }

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
          mode: 'agent',
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
      setInfo(`Tag ${agents.map((a) => a.handle).join(', ')} to get a reply.`)
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

  async function handleStartRoom(e) {
    e.preventDefault()
    const trimmed = topic.trim()
    if (!trimmed || selectedIds.length < 2) return

    setStarting(true)
    setError(null)

    const picked = library.filter((a) => selectedIds.includes(a.id))

    try {
      const result = await fetchStartRoom(trimmed, picked)
      clearAgentRoom()
      setAgents(result.agents)
      setPosts(result.posts)
      setDraft('')
      setLastMentioned([])
      setTaggedIds(new Set())
      setSetup(false)
      setInfo(`${result.agents[0]?.name} opened — ${result.agents[1]?.name || 'others'} replied. Tag agents to continue.`)
    } catch (err) {
      setError(err.message)
      setApiOnline(await checkApiHealth())
    } finally {
      setStarting(false)
    }
  }

  function handleNewRoom() {
    clearAgentRoom()
    setTopic('')
    setAgents([])
    setPosts([])
    setSelectedIds([])
    setSetup(true)
    setInfo(null)
    setError(null)
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

  if (setup && !started) {
    return (
      <section className="debate-thread agent-room">
        <div className="portal-header">
          <div className="portal-header-text">
            <h2 className="portal-title">Start a conversation</h2>
            <p className="portal-sub">Pick agents and a topic — one opens, the next replies, then you guide the chat.</p>
          </div>
        </div>

        {error && <p className="debate-error">{error}</p>}
        {!apiOnline && <p className="debate-error">AI backend is offline. Run: npm run dev</p>}

        {library.length < 2 ? (
          <div className="debate-start-panel">
            <p>You need at least 2 agents first.</p>
            <button type="button" className="prompt-action" onClick={onManageAgents}>
              Create agents
            </button>
          </div>
        ) : (
          <form className="room-setup" onSubmit={handleStartRoom}>
            <label className="prompt-field">
              <span className="prompt-label">Topic or question</span>
              <input
                className="dialog-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Should we colonise Mars?"
                required
              />
            </label>
            <p className="prompt-label">Pick agents (2–6)</p>
            <div className="room-agent-pick">
              {library.map((agent) => {
                const selected = selectedIds.includes(agent.id)
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className={`room-agent-chip${selected ? ' room-agent-chip--on' : ''}`}
                    style={{ borderColor: selected ? agent.color : undefined }}
                    onClick={() => toggleAgent(agent.id)}
                  >
                    <span className="agent-card-avatar" style={{ backgroundColor: agent.color }}>
                      {agent.name[0]}
                    </span>
                    {agent.name}
                  </button>
                )
              })}
            </div>
            <button
              type="submit"
              className="prompt-action"
              disabled={starting || selectedIds.length < 2 || !topic.trim()}
            >
              {starting ? 'Starting…' : `Start with ${selectedIds.length} agents`}
            </button>
          </form>
        )}
      </section>
    )
  }

  return (
    <section className="debate-thread agent-room">
      <div className="portal-header">
        <div className="portal-header-text">
          <h2 className="portal-title">Agent room</h2>
          <p className="portal-sub">{agents.map((a) => a.name).join(' · ')}</p>
        </div>
        <button type="button" className="debate-action-btn debate-action-btn--new" onClick={handleNewRoom}>
          New room
        </button>
      </div>

      {error && <p className="debate-error">{error}</p>}
      {info && !error && <p className="debate-info">{info}</p>}
      {!apiOnline && <p className="debate-error">AI backend is offline. Run: npm run dev</p>}

      <header className="debate-header">
        <h2>{topic}</h2>
        <span className="debate-meta">{agents.length} agents · You are moderating</span>
      </header>

      <AgentStrip agents={agents.map((a) => ({ ...a, stance: a.instructions?.slice(0, 80) + (a.instructions?.length > 80 ? '…' : '') }))} />

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
        placeholder={`Guide the chat… tag ${agents.map((a) => a.handle).join(', ')}`}
      />
    </section>
  )
}
