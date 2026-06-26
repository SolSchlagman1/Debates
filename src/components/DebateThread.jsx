import { useEffect, useState } from 'react'
import ArticleHeader from './ArticleHeader'
import RoundTablePanel from './RoundTablePanel'
import DebatePost from './DebatePost'
import ComposeBox from './ComposeBox'
import OldChatsPanel, { ArchivedDebateView } from './OldChatsPanel'
import { checkApiHealth, fetchAgentReply, fetchGenerateOpening } from '../api/debate'
import {
  AUTO_DEBATE_ORDER,
  createPost,
  getParticipant,
  PANEL_CHARACTERS,
  isPanelDebate,
  normalizeAgents,
  OPENING_SPEAKER_ID,
  parseMentions,
} from '../constants/debate'
import { getStory } from '../constants/stories'
import {
  deleteFromArchive,
  getArchivedChat,
  loadArchive,
  saveToArchive,
} from '../utils/archive'
import { loadDebate, saveDebate, clearDebate } from '../utils/storage'
import { exportDebateAsJson, exportDebateAsText } from '../utils/exportDebate'

function getInitialState() {
  const saved = loadDebate()
  const story = getStory(saved?.storyId)

  if (saved && isPanelDebate(saved.agents) && saved.posts?.length > 0) {
    return {
      story,
      agents: normalizeAgents(saved.agents),
      posts: saved.posts,
      lastMentioned: saved.lastMentioned || [],
      draft: saved.draft || '',
      started: true,
    }
  }

  return {
    story,
    agents: PANEL_CHARACTERS,
    posts: [],
    lastMentioned: [],
    draft: '',
    started: false,
  }
}

export default function DebateThread() {
  const initial = getInitialState()
  const [story] = useState(initial.story)
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
  const [archive, setArchive] = useState(loadArchive)
  const [oldChatsOpen, setOldChatsOpen] = useState(false)
  const [viewingArchiveId, setViewingArchiveId] = useState(null)
  const [generatingOpenings, setGeneratingOpenings] = useState(false)
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [debateStarted, setDebateStarted] = useState(initial.started)

  const isBusy = generatingOpenings || autoGenerating

  const viewingChat = viewingArchiveId ? getArchivedChat(viewingArchiveId) : null

  useEffect(() => {
    checkApiHealth().then(setApiOnline)
  }, [])

  useEffect(() => {
    if (debateStarted) {
      saveDebate({
        storyId: story.id,
        topic: story.question,
        agents,
        posts,
        lastMentioned,
        draft,
      })
    }
  }, [story, agents, posts, lastMentioned, draft, debateStarted])

  function refreshArchive() {
    setArchive(loadArchive())
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
          story,
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
      setInfo('Tap who should speak next, or tag them in your message.')
      setPosting(false)
      return
    }

    if (explicit.length > 0) {
      setLastMentioned(explicit)
    } else {
      setInfo(`Calling on ${mentioned.map((id) => getParticipant(id, agents).name).join(', ')}.`)
    }

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

  async function runAutoDebateSequence(currentAgents, thread) {
    for (const agentId of AUTO_DEBATE_ORDER) {
      const debater = getParticipant(agentId, currentAgents)
      const priorPost = thread[thread.length - 1]

      setPendingAgentIds([agentId])
      setInfo(`${debater.name} is speaking…`)

      const replyText = await fetchAgentReply({
        story,
        posts: thread,
        agents: currentAgents,
        debater,
        replyToPost: priorPost,
      })

      const agentPost = createPost({
        author: agentId,
        text: replyText,
        inReplyTo: priorPost.id,
      })

      thread = [...thread, agentPost]
      setPosts(thread)
      setPendingAgentIds([])
    }

    return thread
  }

  async function handleGenerateDebate() {
    setGeneratingOpenings(true)
    setAutoGenerating(false)
    setError(null)
    setInfo(null)

    const openingSpeaker = PANEL_CHARACTERS.find((a) => a.id === OPENING_SPEAKER_ID) || PANEL_CHARACTERS[0]

    try {
      const { agent: updatedSpeaker, posts: openingPosts } = await fetchGenerateOpening(openingSpeaker, story)
      const newAgents = PANEL_CHARACTERS.map((a) =>
        a.id === updatedSpeaker.id ? updatedSpeaker : a,
      )

      setAgents(newAgents)
      setPosts(openingPosts)
      setDraft('')
      setLastMentioned([])
      setTaggedIds(new Set())
      setDebateStarted(true)
      setGeneratingOpenings(false)
      setAutoGenerating(true)
      setInfo(`${updatedSpeaker.name} opens — generating the full round table…`)

      await runAutoDebateSequence(newAgents, openingPosts)
      setInfo('Debate generated. You can jump in below if you like.')
    } catch (err) {
      setError(err.message)
      setApiOnline(await checkApiHealth())
    } finally {
      setGeneratingOpenings(false)
      setAutoGenerating(false)
      setPendingAgentIds([])
    }
  }

  async function handleRestartDebate() {
    if (!window.confirm('Start a fresh round table? The current conversation saves to archive first.')) return

    if (debateStarted && posts.length > 0) {
      saveToArchive({ topic: story.question, headline: story.headline, agents, posts })
      refreshArchive()
    }

    clearDebate()
    setPosts([])
    setDraft('')
    setLastMentioned([])
    setTaggedIds(new Set())
    setDebateStarted(false)
    setViewingArchiveId(null)
    setInfo(null)
    await handleGenerateDebate()
  }

  function handleSaveChat() {
    saveToArchive({ topic: story.question, headline: story.headline, agents, posts })
    refreshArchive()
    setInfo('Saved to archive.')
    setOldChatsOpen(true)
  }

  function handleExportText() {
    exportDebateAsText({ topic: story.question, headline: story.headline, agents, posts })
    setInfo('Downloaded as text.')
  }

  function handleExportJson() {
    exportDebateAsJson({ storyId: story.id, topic: story.question, agents, posts, lastMentioned, draft })
    setInfo('Downloaded as JSON.')
  }

  function handleViewArchive(id) {
    setViewingArchiveId(id)
    setOldChatsOpen(false)
  }

  function handleDeleteArchive(id) {
    if (!window.confirm('Delete this saved conversation?')) return
    deleteFromArchive(id)
    refreshArchive()
    if (viewingArchiveId === id) setViewingArchiveId(null)
    setInfo('Deleted from archive.')
  }

  if (viewingChat) {
    return (
      <section className="debate-thread">
        <ArchivedDebateView chat={viewingChat} onBack={() => setViewingArchiveId(null)} />
      </section>
    )
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
    <section className="debate-thread">
      <ArticleHeader story={story} />

      <RoundTablePanel agents={agents} />

      <div className="conversation-header">
        <h2 className="conversation-title">The conversation</h2>
        <div className="debate-actions">
          {debateStarted && (
            <>
              <button type="button" className="debate-action-btn" onClick={handleSaveChat}>
                Save
              </button>
              <button
                type="button"
                className={`debate-action-btn${oldChatsOpen ? ' debate-action-btn--active' : ''}`}
                onClick={() => setOldChatsOpen((open) => !open)}
              >
                Archive ({archive.length})
              </button>
              <button type="button" className="debate-action-btn" onClick={handleExportText}>
                Export
              </button>
            </>
          )}
          <button
            type="button"
            className="debate-action-btn debate-action-btn--new"
            onClick={debateStarted ? handleRestartDebate : handleGenerateDebate}
            disabled={isBusy}
          >
            {isBusy ? 'Generating…' : debateStarted ? 'Regenerate' : 'Generate debate'}
          </button>
        </div>
      </div>

      {oldChatsOpen && (
        <OldChatsPanel
          archive={archive}
          onView={handleViewArchive}
          onDelete={handleDeleteArchive}
          onClose={() => setOldChatsOpen(false)}
        />
      )}

      {error && <p className="debate-error">{error}</p>}
      {info && !error && <p className="debate-info">{info}</p>}

      {!apiOnline && (
        <p className="debate-error">AI backend is offline. Run: npm run dev</p>
      )}

      {!debateStarted && !isBusy && (
        <div className="debate-start-panel">
          <p>One click — every voice speaks in turn, Twitter-style.</p>
          <button type="button" className="prompt-action" onClick={handleGenerateDebate}>
            Generate debate
          </button>
        </div>
      )}

      {isBusy && (
        <div className="debate-start-panel">
          <p>{autoGenerating ? 'Round table in progress…' : 'Opening the round table…'}</p>
          <p className="debate-start-sub">Centre opens, then right and left — about 30 seconds.</p>
        </div>
      )}

      <div className="debate-replies">
        {displayPosts.map((post, i) => (
          <DebatePost
            key={post.id}
            post={post}
            agents={agents}
            isLast={i === displayPosts.length - 1 && !posting && !autoGenerating}
            isPending={post.pending || pendingAgentIds.includes(post.author)}
          />
        ))}
      </div>

      {debateStarted && !autoGenerating && (
        <ComposeBox
          draft={draft}
          agents={agents}
          taggedIds={taggedIds}
          posting={posting}
          lastMentioned={lastMentioned}
          onDraftChange={setDraft}
          onToggleTag={toggleTag}
          onPost={handlePost}
        />
      )}
    </section>
  )
}
