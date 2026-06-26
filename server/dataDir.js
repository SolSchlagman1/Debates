import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const dataDir = process.env.DATA_DIR || join(root, 'data')
mkdirSync(dataDir, { recursive: true })
export const dbPath = join(dataDir, 'debates.db')
