export function findRootId(post, byId) {
  let current = post
  while (current?.inReplyTo && byId[current.inReplyTo]) {
    current = byId[current.inReplyTo]
  }
  return current?.id
}

export function buildFeedGroups(posts) {
  const byId = Object.fromEntries(posts.map((p) => [p.id, p]))
  const roots = posts
    .filter((p) => !p.inReplyTo || !byId[p.inReplyTo])
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  return roots.map((root) => {
    const replies = posts
      .filter((p) => p.id !== root.id && findRootId(p, byId) === root.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    return { root, replies }
  })
}

export function getRootIdForPost(postId, posts) {
  const byId = Object.fromEntries(posts.map((p) => [p.id, p]))
  const post = byId[postId]
  if (!post) return null
  return findRootId(post, byId)
}

export function getThreadGroup(rootId, posts) {
  return buildFeedGroups(posts).find((group) => group.root.id === rootId) || null
}

export function filterGroupsForAuthor(groups, authorId) {
  return groups
    .map(({ root, replies }) => {
      if (root.author === authorId) return { root, replies }
      const authorReplies = replies.filter((p) => p.author === authorId)
      if (authorReplies.length === 0) return null
      return { root, replies: authorReplies }
    })
    .filter(Boolean)
}
