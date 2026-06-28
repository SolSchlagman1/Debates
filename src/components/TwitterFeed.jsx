import { useEffect, useRef, useState } from 'react'
import Tweet from './Tweet'
import ProfilePhotos from './ProfilePhotos'
import { checkApiHealth, fetchAgentReply, fetchFeed, saveFeedPost } from '../api/debate'
import { createPost, getParticipant, parseMentions, USER_PARTICIPANT } from '../constants/agentCore'
import { loadAgentLibrary } from '../utils/agentLibrary'
import { buildFeedGroups, filterGroupsForAuthor, findRootId, getRootIdForPost, getThreadGroup } from '../utils/feedThreads'
import {
  buildThreadShareUrl,
  buildTweetShareUrl,
  clearShareRoute,
  copyShareLink,
  loadPublicUrl,
  parseShareRoute,
  setShareRoute,
} from '../utils/shareLinks'

const DEFAULT_TOPIC = 'In the news'

const TABS = [
  { id: 'all', label: 'Home' },
  { id: 'marx', label: '@karlmarx' },
  { id: 'hayek', label: '@FAH' },
]

function pickDebaters(library) {
  const marx = library.find((a) => /karl marx|^marx$/i.test(a.name))
  const hayek = library.find((a) => /hayek/i.test(a.name))
  return { marx, hayek }
}

function otherAgentId(agents, authorId) {
  const ids = agents.map((a) => a.id)
  if (authorId === 'user') return ids[0]
  return ids.find((id) => id !== authorId) || ids[0]
}

function slimAgents(agents) {
  return agents.map(({ id, name, handle, color, instructions }) => ({
    id,
    name,
    handle,
    color,
    instructions,
  }))
}

export default function TwitterFeed() {
  const [agents, setAgents] = useState([])
  const [topic, setTopic] = useState(DEFAULT_TOPIC)
  const [posts, setPosts] = useState([])
  const [tab, setTab] = useState('all')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [pendingId, setPendingId] = useState(null)
  const [pendingReplyToId, setPendingReplyToId] = useState(null)
  const [error, setError] = useState(null)
  const [apiOnline, setApiOnline] = useState(true)
  const [openThreadRootId, setOpenThreadRootId] = useState(null)
  const [showProfiles, setShowProfiles] = useState(false)
  const [shareOk, setShareOk] = useState(null)
  const [shareMissing, setShareMissing] = useState(false)
  const [highlightPostId, setHighlightPostId] = useState(null)
  const feedRef = useRef(null)
  const threadRef = useRef(null)
  const tweetRefs = useRef({})

  useEffect(() => {
    loadPublicUrl()
  }, [])

  useEffect(() => {
    let active = true

    async function init() {
      const online = await checkApiHealth()
      if (!active) return
      setApiOnline(online)

      const library = await loadAgentLibrary()
      const { marx, hayek } = pickDebaters(library)

      if (!marx || !hayek) {
        setError('Karl Marx and Friedrich Hayek agents are required in the database.')
        setLoading(false)
        return
      }

      const pair = [marx, hayek]
      setAgents(pair)

      if (!online) {
        setLoading(false)
        return
      }

      try {
        const result = await fetchFeed()
        if (!active) return
        setTopic(result.topic || DEFAULT_TOPIC)
        setPosts(result.posts || [])
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    init()
    return () => {
      active = false
    }
  }, [])

  function openThreadByRootId(rootId, highlightId = null) {
    setOpenThreadRootId(rootId)
    setHighlightPostId(highlightId)
    setShareRoute('thread', rootId)
  }

  function closeThreadView() {
    setOpenThreadRootId(null)
    setHighlightPostId(null)
    clearShareRoute()
  }

  function resolveShareRoute(route) {
    if (!route) {
      setShareMissing(false)
      return
    }

    if (route.type === 'thread') {
      const group = getThreadGroup(route.id, posts)
      if (group) {
        setShareMissing(false)
        openThreadByRootId(route.id)
      } else {
        setShareMissing(true)
      }
      return
    }

    const rootId = getRootIdForPost(route.id, posts)
    if (rootId) {
      setShareMissing(false)
      openThreadByRootId(rootId, route.id)
    } else {
      setShareMissing(true)
    }
  }

  useEffect(() => {
    if (loading) return

    const route = parseShareRoute()
    if (!route) {
      setShareMissing(false)
      return
    }

    if (!posts.length) return

    resolveShareRoute(route)
  }, [loading, posts])

  useEffect(() => {
    if (!highlightPostId) return
    const el = tweetRefs.current[highlightPostId]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => setHighlightPostId(null), 4000)
    return () => clearTimeout(timer)
  }, [highlightPostId, openThreadRootId, posts.length])

  useEffect(() => {
    function onHashChange() {
      const route = parseShareRoute()
      if (!route) {
        setOpenThreadRootId(null)
        setHighlightPostId(null)
        setShareMissing(false)
        return
      }
      if (!posts.length || loading) return
      resolveShareRoute(route)
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [loading, posts])

  async function handleShareThread(rootId) {
    try {
      await copyShareLink(await buildThreadShareUrl(rootId))
      setShareOk('Thread link copied')
      setTimeout(() => setShareOk(null), 2500)
    } catch {
      setError('Could not copy link')
    }
  }

  async function handleShareTweet(post) {
    try {
      await copyShareLink(await buildTweetShareUrl(post.id))
      setShareOk('Tweet link copied')
      setTimeout(() => setShareOk(null), 2500)
    } catch {
      setError('Could not copy link')
    }
  }

  useEffect(() => {
    const el = openThreadRootId ? threadRef.current : feedRef.current
    if (!el || loading) return
    if (openThreadRootId || pendingId) {
      el.scrollTop = el.scrollHeight
    }
  }, [posts.length, pendingId, loading, openThreadRootId])

  async function refreshAgents() {
    const library = await loadAgentLibrary()
    const { marx, hayek } = pickDebaters(library)
    if (marx && hayek) setAgents([marx, hayek])
  }

  async function persistPost(post) {
    await saveFeedPost(post)
    return post
  }

  async function requestTweet(agentId, thread, replyToPost, updateFeed = true) {
    setPendingId(agentId)
    setPendingReplyToId(replyToPost?.id || null)
    try {
      const text = await fetchAgentReply({
        mode: 'agent',
        topic,
        posts: thread,
        agents: slimAgents(agents),
        debater: getParticipant(agentId, agents),
        replyToPost,
      })
      const post = createPost({
        author: agentId,
        text,
        inReplyTo: replyToPost?.id || null,
      })
      await persistPost(post)
      if (updateFeed) setPosts((prev) => [...prev, post])
      return post
    } finally {
      setPendingId(null)
      setPendingReplyToId(null)
    }
  }

  async function handleReplyTo(post) {
    if (posting || post.author === 'user' || agents.length < 2) return
    setError(null)
    setPosting(true)

    const replierId = otherAgentId(agents, post.author)
    const thread = [...posts]

    try {
      await requestTweet(replierId, thread, post)
    } catch (err) {
      setError(err.message)
      setApiOnline(await checkApiHealth())
    } finally {
      setPosting(false)
    }
  }

  async function handleNextExchange() {
    if (posting || posts.length === 0) return
    setError(null)
    setPosting(true)

    const thread = [...posts]
    const last = thread[thread.length - 1]
    const nextId = otherAgentId(agents, last.author)

    try {
      await requestTweet(nextId, thread, last)
    } catch (err) {
      setError(err.message)
      setApiOnline(await checkApiHealth())
    } finally {
      setPosting(false)
    }
  }

  async function handleUserPost() {
    const text = draft.trim()
    if (!text || posting) return

    setError(null)
    setPosting(true)

    const userPost = createPost({ author: 'user', text })
    const mentioned = parseMentions(text, agents)
    let thread = [...posts, userPost]

    setPosts(thread)
    setDraft('')

    try {
      await persistPost(userPost)
      const targets = mentioned.length > 0 ? mentioned : agents.map((a) => a.id)
      for (const agentId of targets) {
        const replyTo = thread[thread.length - 1]
        const agentPost = await requestTweet(agentId, thread, replyTo, false)
        thread = [...thread, agentPost]
        setPosts(thread)
      }
    } catch (err) {
      setError(err.message)
      setApiOnline(await checkApiHealth())
    } finally {
      setPosting(false)
    }
  }

  function handleReset() {
    if (!confirm('Reset the feed? News tweets will stay saved.')) return
    setError(null)
    setLoading(true)
    fetchFeed()
      .then((result) => {
        setPosts(result.posts || [])
        setTopic(result.topic || DEFAULT_TOPIC)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  const marx = agents[0]
  const hayek = agents[1]
  const postById = Object.fromEntries(posts.map((p) => [p.id, p]))

  let groups = buildFeedGroups(posts)
  if (tab === 'marx' && marx) groups = filterGroupsForAuthor(groups, marx.id)
  if (tab === 'hayek' && hayek) groups = filterGroupsForAuthor(groups, hayek.id)

  function appendPendingToGroup(group) {
    if (!pendingId || !pendingReplyToId) return group
    const rootId = findRootId(postById[pendingReplyToId], postById) || pendingReplyToId
    if (group.root.id !== rootId) return group
    return {
      ...group,
      replies: [
        ...group.replies,
        {
          id: 'pending',
          author: pendingId,
          text: '',
          createdAt: new Date().toISOString(),
        },
      ],
    }
  }

  function renderThreadGroup(group, { inFeed = false } = {}) {
    const { root, replies } = appendPendingToGroup(group)
    const openThread = () => openThreadByRootId(root.id)

    return (
      <div key={root.id} className="tweet-group">
        <Tweet
          post={root}
          agents={agents}
          isRoot
          isLast={inFeed ? true : replies.length === 0}
          hasThreadBelow={!inFeed && replies.length > 0}
          highlighted={highlightPostId === root.id}
          tweetRef={(el) => {
            tweetRefs.current[root.id] = el
          }}
          onOpen={inFeed ? openThread : undefined}
          onShare={() => handleShareTweet(root)}
          canReply={
            !inFeed && !posting && !loading && root.author !== 'user' && agents.length === 2
          }
          onReply={handleReplyTo}
        />
        {inFeed && replies.length > 0 && (
          <button type="button" className="thread-preview-link" onClick={openThread}>
            View thread · {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </button>
        )}
        {!inFeed &&
          replies.map((reply, i) => {
            const isPending = reply.id === 'pending'
            return (
              <Tweet
                key={reply.id}
                post={reply}
                agents={agents}
                isPending={isPending}
                isLast={i === replies.length - 1}
                highlighted={highlightPostId === reply.id}
                tweetRef={(el) => {
                  tweetRefs.current[reply.id] = el
                }}
                onShare={() => handleShareTweet(reply)}
                canReply={
                  !posting && !loading && !isPending && reply.author !== 'user' && agents.length === 2
                }
                onReply={handleReplyTo}
              />
            )
          })}
      </div>
    )
  }

  const openThreadGroup = openThreadRootId ? getThreadGroup(openThreadRootId, posts) : null

  return (
    <div className="twitter-app">
      <div className="twitter-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`twitter-tab${tab === t.id ? ' twitter-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="twitter-topic">
        <p className="twitter-topic-label">Home</p>
        <h2 className="twitter-topic-text">{topic}</h2>
        <div className="twitter-topic-actions">
          <button
            type="button"
            className="twitter-action-btn"
            onClick={handleNextExchange}
            disabled={posting || loading || posts.length === 0}
          >
            {posting ? 'Posting…' : 'Continue thread'}
          </button>
          <button
            type="button"
            className="twitter-action-btn twitter-action-btn--ghost"
            onClick={() => setShowProfiles(true)}
          >
            Profile pics
          </button>
          <button type="button" className="twitter-action-btn twitter-action-btn--ghost" onClick={handleReset}>
            Reset
          </button>
        </div>
      </div>

      {shareOk && <p className="twitter-toast twitter-toast--ok">{shareOk}</p>}
      {shareMissing && (
        <p className="debate-error twitter-error">Couldn&apos;t find that tweet — it may have been removed.</p>
      )}
      {error && <p className="debate-error twitter-error">{error}</p>}
      {!apiOnline && <p className="debate-error twitter-error">AI backend is offline. Run: npm run dev</p>}

      {openThreadGroup ? (
        <div className="thread-view">
          <header className="thread-view-header">
            <button type="button" className="thread-back-btn" onClick={closeThreadView}>
              ← Back
            </button>
            <h2 className="thread-view-title">Thread</h2>
            <button
              type="button"
              className="thread-header-btn"
              onClick={() => handleShareThread(openThreadGroup.root.id)}
            >
              Share
            </button>
          </header>
          <div className="thread-view-body" ref={threadRef}>
            {renderThreadGroup(appendPendingToGroup(openThreadGroup))}
          </div>
        </div>
      ) : loading ? (
        <p className="twitter-loading">Loading feed…</p>
      ) : (
        <div className="twitter-feed" ref={feedRef}>
          {groups.map((group) => renderThreadGroup(group, { inFeed: true }))}
        </div>
      )}

      {showProfiles && agents.length === 2 && (
        <ProfilePhotos
          agents={agents}
          onClose={() => setShowProfiles(false)}
          onUpdated={refreshAgents}
        />
      )}

      {!openThreadGroup && (
        <footer className="twitter-compose">
          <div className="twitter-compose-row">
            <div className="avatar" style={{ backgroundColor: USER_PARTICIPANT.color }}>
              {USER_PARTICIPANT.name[0]}
            </div>
            <textarea
              className="twitter-compose-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleUserPost()
                }
              }}
              placeholder="Post your take… tag @karlmarx or @FAH"
              rows={2}
              disabled={posting || loading}
            />
          </div>
          <button
            type="button"
            className="twitter-post-btn"
            onClick={handleUserPost}
            disabled={!draft.trim() || posting || loading}
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </footer>
      )}
    </div>
  )
}
