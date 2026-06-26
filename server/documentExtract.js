import { createRequire } from 'module'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { PDFParse } from 'pdf-parse'
import { initKf8File, initMobiFile } from '@lingo-reader/mobi-parser'

const require = createRequire(import.meta.url)
const { EPub } = require('epub2')

const EBOOK_EXTENSIONS = ['.epub', '.mobi', '.azw', '.azw3', '.prc', '.txt', '.pdf']

export function isSupportedDocument(filename) {
  const lower = String(filename).toLowerCase()
  return EBOOK_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function detectType(filename) {
  const lower = String(filename).toLowerCase()
  if (lower.endsWith('.epub')) return 'epub'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.txt')) return 'txt'
  if (lower.endsWith('.mobi') || lower.endsWith('.azw') || lower.endsWith('.azw3') || lower.endsWith('.prc')) {
    return 'mobi'
  }
  return 'document'
}

function cleanText(rawText) {
  return String(rawText || '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function prepareText(text) {
  return cleanText(text)
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export async function extractPdfText(buffer, filename = 'document.pdf') {
  const parser = new PDFParse({ data: buffer })

  try {
    const parsed = await parser.getText()
    const text = prepareText(parsed.text || '')

    return {
      name: filename,
      type: 'pdf',
      text,
      pages: parsed.total || 0,
      charCount: text.length,
    }
  } finally {
    await parser.destroy()
  }
}

export async function extractEpubText(buffer, filename = 'document.epub') {
  const path = join(tmpdir(), `debates-${randomUUID()}.epub`)
  await writeFile(path, buffer)

  try {
    const epub = await EPub.createAsync(path)
    const parts = []

    for (const item of epub.flow || []) {
      const html = await epub.getChapterAsync(item.id)
      const text = stripHtml(html)
      if (text) parts.push(text)
    }

    const text = prepareText(parts.join('\n\n'))

    return {
      name: filename,
      type: 'epub',
      text,
      pages: epub.flow?.length || 0,
      charCount: text.length,
    }
  } finally {
    await unlink(path).catch(() => {})
  }
}

async function extractFromKindleParser(buffer, filename, useKf8) {
  const uint8 = new Uint8Array(buffer)
  let parser
  const parts = []

  try {
    parser = useKf8 ? await initKf8File(uint8) : await initMobiFile(uint8)
    const spine = parser.getSpine() || []

    for (const chapter of spine) {
      const loaded = parser.loadChapter(chapter.id)
      if (loaded?.html) {
        const text = stripHtml(loaded.html)
        if (text) parts.push(text)
      }
    }

    const text = prepareText(parts.join('\n\n'))
    if (!text) {
      throw new Error('No text in this file — it may be DRM-locked. Try EPUB instead.')
    }

    return {
      name: filename,
      type: 'mobi',
      text,
      pages: parts.length,
      charCount: text.length,
    }
  } finally {
    parser?.destroy?.()
  }
}

export async function extractMobiText(buffer, filename = 'book.mobi') {
  const lower = filename.toLowerCase()

  try {
    if (lower.endsWith('.azw3')) {
      return await extractFromKindleParser(buffer, filename, true)
    }
    return await extractFromKindleParser(buffer, filename, false)
  } catch (firstErr) {
    if (!lower.endsWith('.azw3')) {
      try {
        return await extractFromKindleParser(buffer, filename, true)
      } catch {
        // try other parser below
      }
    }

    const msg = String(firstErr?.message || '')
    if (/drm|encrypt|lz77|compression|locked/i.test(msg)) {
      throw new Error('This Kindle file is locked or unsupported. Use EPUB instead (Calibre can convert).')
    }
    throw new Error(msg || 'Could not read Kindle file. Try EPUB instead.')
  }
}

export async function extractTxtText(buffer, filename = 'book.txt') {
  const raw = buffer.toString('utf8')
  const text = prepareText(raw)

  return {
    name: filename,
    type: 'txt',
    text,
    pages: 0,
    charCount: text.length,
  }
}

export async function extractDocumentText(buffer, filename = 'document') {
  const lower = String(filename).toLowerCase()

  if (lower.endsWith('.epub')) {
    return extractEpubText(buffer, filename)
  }

  if (lower.endsWith('.pdf')) {
    return extractPdfText(buffer, filename)
  }

  if (lower.endsWith('.txt')) {
    return extractTxtText(buffer, filename)
  }

  if (lower.endsWith('.mobi') || lower.endsWith('.azw') || lower.endsWith('.azw3') || lower.endsWith('.prc')) {
    return extractMobiText(buffer, filename)
  }

  throw new Error('Unsupported file. Use PDF, EPUB, MOBI, Kindle (AZW), or TXT.')
}
