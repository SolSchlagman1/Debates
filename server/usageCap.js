import Database from 'better-sqlite3'
import { dbPath } from './dataDir.js'

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS usage_totals (
    period TEXT PRIMARY KEY,
    total_usd REAL NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
`)

function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getSpendCapUsd() {
  const raw = process.env.OPENAI_SPEND_CAP_USD
  if (raw === undefined || raw === '') return 0
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function getPricing() {
  return {
    inputPer1M: Number(process.env.OPENAI_INPUT_PRICE_PER_1M) || 2.5,
    outputPer1M: Number(process.env.OPENAI_OUTPUT_PRICE_PER_1M) || 10,
  }
}

function estimateCost(usage) {
  if (!usage) return 0.01

  const { inputPer1M, outputPer1M } = getPricing()
  const prompt = usage.prompt_tokens || 0
  const completion = usage.completion_tokens || 0

  return (prompt / 1_000_000) * inputPer1M + (completion / 1_000_000) * outputPer1M
}

function getPeriodRow(period = currentPeriod()) {
  return db.prepare('SELECT * FROM usage_totals WHERE period = ?').get(period)
}

export function getUsageSummary() {
  const period = currentPeriod()
  const cap = getSpendCapUsd()
  const row = getPeriodRow(period)
  const spent = row?.total_usd || 0

  return {
    period,
    spent: Math.round(spent * 10_000) / 10_000,
    cap,
    remaining: cap > 0 ? Math.max(0, Math.round((cap - spent) * 10_000) / 10_000) : null,
    capped: cap > 0 && spent >= cap,
    calls: row?.calls || 0,
    promptTokens: row?.prompt_tokens || 0,
    completionTokens: row?.completion_tokens || 0,
  }
}

export function assertWithinCap() {
  const cap = getSpendCapUsd()
  if (!cap) return

  const { spent } = getUsageSummary()
  if (spent >= cap) {
    const err = new Error(
      `Monthly OpenAI limit reached ($${cap.toFixed(2)}). Raise OPENAI_SPEND_CAP_USD in .env or wait until next month.`,
    )
    err.code = 'SPEND_CAP'
    throw err
  }
}

export function recordUsage(usage) {
  const period = currentPeriod()
  const cost = estimateCost(usage)
  const prompt = usage?.prompt_tokens || 0
  const completion = usage?.completion_tokens || 0
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO usage_totals (period, total_usd, calls, prompt_tokens, completion_tokens, updated_at)
    VALUES (@period, @cost, 1, @prompt, @completion, @now)
    ON CONFLICT(period) DO UPDATE SET
      total_usd = total_usd + @cost,
      calls = calls + 1,
      prompt_tokens = prompt_tokens + @prompt,
      completion_tokens = completion_tokens + @completion,
      updated_at = @now
  `).run({ period, cost, prompt, completion, now })
}
