import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { insertFeedPost, listFeedPosts } from './feedDb.js'

const seedPath = join(dirname(fileURLToPath(import.meta.url)), 'feedSeed.json')

export function ensureFeedSeed() {
  const posts = listFeedPosts()
  const replyCount = posts.filter((p) => p.inReplyTo).length
  if (replyCount > 0) return posts

  if (!existsSync(seedPath)) return posts

  const seed = JSON.parse(readFileSync(seedPath, 'utf8'))
  if (!Array.isArray(seed) || seed.length === 0) return posts

  for (const post of seed) {
    insertFeedPost(post)
  }

  return listFeedPosts()
}
