import Database from 'better-sqlite3'
import { dbPath } from './dataDir.js'

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS feed_posts (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL,
    text TEXT NOT NULL,
    article_title TEXT,
    article_url TEXT,
    article_source TEXT,
    in_reply_to TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_feed_created ON feed_posts(created_at);
`)

function rowToPost(row) {
  const post = {
    id: row.id,
    author: row.author_id,
    text: row.text,
    createdAt: row.created_at,
  }
  if (row.in_reply_to) post.inReplyTo = row.in_reply_to
  if (row.article_url) {
    post.article = {
      title: row.article_title,
      url: row.article_url,
      source: row.article_source,
    }
  }
  return post
}

export function listFeedPosts() {
  const rows = db.prepare('SELECT * FROM feed_posts ORDER BY created_at ASC').all()
  return rows.map(rowToPost)
}

export function hasNewsPosts() {
  const count = db
    .prepare('SELECT COUNT(*) as c FROM feed_posts WHERE article_url IS NOT NULL')
    .get().c
  return count > 0
}

export function insertFeedPost(post) {
  db.prepare(`
    INSERT OR REPLACE INTO feed_posts (
      id, author_id, text, article_title, article_url, article_source, in_reply_to, created_at
    ) VALUES (
      @id, @author_id, @text, @article_title, @article_url, @article_source, @in_reply_to, @created_at
    )
  `).run({
    id: post.id,
    author_id: post.author,
    text: post.text,
    article_title: post.article?.title || null,
    article_url: post.article?.url || null,
    article_source: post.article?.source || null,
    in_reply_to: post.inReplyTo || null,
    created_at: post.createdAt || new Date().toISOString(),
  })
  return post
}

export function clearFeedPosts() {
  db.prepare('DELETE FROM feed_posts').run()
}
