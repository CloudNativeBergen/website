import { inflateSync } from 'zlib'

export interface MarkerPosition {
  pageIndex: number
  x: number
  y: number
}

/**
 * Scans all pages of a PDF for a text marker and returns its position.
 * Uses raw binary parsing to walk the page tree and decompress content
 * streams, then parses PDF operators to extract the text position.
 */
export function findMarkerInPdf(
  pdfBytes: Uint8Array,
  marker: string,
): MarkerPosition | null {
  const raw = Buffer.from(pdfBytes).toString('latin1')

  const contentStreams = findPageContentStreams(raw)

  for (const { pageIndex, objNums } of contentStreams) {
    for (const objNum of objNums) {
      const streamContent = extractStreamContent(raw, objNum)
      if (!streamContent) continue

      const decoded = decodeHexStringsInStream(streamContent)
      if (!decoded.includes(marker)) continue

      const pos = parseTextPosition(decoded, marker)
      if (pos) {
        return { pageIndex, x: pos.x, y: pos.y }
      }
    }
  }

  return null
}

/**
 * Parses PDF content stream operators to find the position of a text string.
 * Tracks the text matrix via Td, TD, Tm, T* and BT operators.
 */
export function parseTextPosition(
  stream: string,
  marker: string,
): { x: number; y: number } | null {
  let tx = 0
  let ty = 0

  const lines = stream.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === 'BT') {
      tx = 0
      ty = 0
      continue
    }

    // Tm — set text matrix: a b c d tx ty Tm
    const tmMatch = trimmed.match(
      /^([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+Tm$/,
    )
    if (tmMatch) {
      tx = parseFloat(tmMatch[5])
      ty = parseFloat(tmMatch[6])
      continue
    }

    // Td / TD — move text position
    const tdMatch = trimmed.match(/^([\d.e+-]+)\s+([\d.e+-]+)\s+T[dD]$/)
    if (tdMatch) {
      tx += parseFloat(tdMatch[1])
      ty += parseFloat(tdMatch[2])
      continue
    }

    // Check if this line shows the marker text
    if (trimmed.includes('Tj') || trimmed.includes('TJ')) {
      const tjTexts: string[] = []
      const tjMatch = trimmed.match(/\(([^)]*)\)\s*Tj/)
      if (tjMatch) tjTexts.push(tjMatch[1])

      const tjArrayMatch = trimmed.match(/\[(.*)\]\s*TJ/)
      if (tjArrayMatch) {
        const parts = tjArrayMatch[1].match(/\(([^)]*)\)/g)
        if (parts) {
          for (const part of parts) {
            tjTexts.push(part.slice(1, -1))
          }
        }
      }

      const combined = tjTexts.join('')
      if (combined.includes(marker)) {
        return { x: tx, y: ty }
      }
    }
  }

  return null
}

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Finds content stream object numbers for each page in the PDF.
 * Tries direct Page objects first, then falls back to decompressing
 * Object Streams (ObjStm) where pdf-lib may pack page objects.
 */
function findPageContentStreams(
  rawPdf: string,
): Array<{ pageIndex: number; objNums: number[] }> {
  const directPages = findDirectPageObjects(rawPdf)
  if (directPages.length > 0) return directPages
  return findPagesInObjectStreams(rawPdf)
}

function findDirectPageObjects(
  rawPdf: string,
): Array<{ pageIndex: number; objNums: number[] }> {
  const results: Array<{ pageIndex: number; objNums: number[] }> = []
  const pageObjRegex = /\b(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g
  let match
  while ((match = pageObjRegex.exec(rawPdf)) !== null) {
    const body = match[2]
    if (!/\/Type\s*\/Page\b(?!s)/.test(body)) continue
    const contentsMatch = body.match(/\/Contents\s+([\s\S]*?)(?=\/\w|\s*>>)/)
    if (!contentsMatch) continue

    const refs = extractObjRefs(contentsMatch[1])
    if (refs.length > 0) {
      results.push({ pageIndex: results.length, objNums: refs })
    }
  }
  return results
}

function findPagesInObjectStreams(
  rawPdf: string,
): Array<{ pageIndex: number; objNums: number[] }> {
  const results: Array<{ pageIndex: number; objNums: number[] }> = []

  const objStmRegex = /\b(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g
  let match
  while ((match = objStmRegex.exec(rawPdf)) !== null) {
    const header = match[2]
    if (!header.includes('/ObjStm')) continue

    const objNum = parseInt(match[1], 10)
    const decoded = extractStreamContent(rawPdf, objNum)
    if (!decoded) continue

    const nMatch = header.match(/\/N\s+(\d+)/)
    const firstMatch = header.match(/\/First\s+(\d+)/)
    if (!nMatch || !firstMatch) continue

    const n = parseInt(nMatch[1], 10)
    const first = parseInt(firstMatch[1], 10)

    const headerPart = decoded.substring(0, first)
    const nums = headerPart.trim().split(/\s+/).map(Number)

    for (let i = 0; i < n; i++) {
      const offset = nums[i * 2 + 1]
      const nextOffset =
        i + 1 < n ? nums[(i + 1) * 2 + 1] : decoded.length - first
      const body = decoded.substring(first + offset, first + nextOffset)

      if (/\/Type\s*\/Page\b(?!s)/.test(body)) {
        const contentsMatch = body.match(
          /\/Contents\s+([\s\S]*?)(?=\/\w|\s*>>)/,
        )
        if (contentsMatch) {
          const refs = extractObjRefs(contentsMatch[1])
          if (refs.length > 0) {
            results.push({ pageIndex: results.length, objNums: refs })
          }
        }
      }
    }
  }

  return results
}

function extractObjRefs(text: string): number[] {
  const refs: number[] = []
  const refPattern = /(\d+)\s+0\s+R/g
  let m
  while ((m = refPattern.exec(text)) !== null) {
    refs.push(parseInt(m[1], 10))
  }
  return refs
}

/**
 * Decodes hex-encoded strings in a PDF content stream to parenthesized form.
 * `<48656C6C6F> Tj` becomes `(Hello) Tj` for uniform text matching.
 */
function decodeHexStringsInStream(stream: string): string {
  return stream.replace(/<([0-9A-Fa-f\s]+)>/g, (_match, hex: string) => {
    const clean = hex.replace(/\s/g, '')
    let text = ''
    for (let i = 0; i < clean.length; i += 2) {
      text += String.fromCharCode(parseInt(clean.substring(i, i + 2), 16))
    }
    const escaped = text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
    return `(${escaped})`
  })
}

/**
 * Extracts and decompresses the stream content of a PDF object by number.
 */
function extractStreamContent(rawPdf: string, objNum: number): string | null {
  const objPattern = new RegExp(`\\b${objNum}\\s+0\\s+obj\\b`)
  const objStart = rawPdf.search(objPattern)
  if (objStart === -1) return null

  const streamMarker = 'stream'
  const streamIdx = rawPdf.indexOf(streamMarker, objStart)
  const endstreamIdx = rawPdf.indexOf('endstream', streamIdx)
  if (streamIdx === -1 || endstreamIdx === -1) return null

  let dataStart = streamIdx + streamMarker.length
  if (rawPdf[dataStart] === '\r') dataStart++
  if (rawPdf[dataStart] === '\n') dataStart++

  const streamData = rawPdf.slice(dataStart, endstreamIdx)
  const trimmed = streamData.replace(/\r?\n$/, '')

  const objHeader = rawPdf.slice(objStart, streamIdx)
  if (objHeader.includes('FlateDecode')) {
    try {
      return inflateSync(Buffer.from(trimmed, 'latin1')).toString('latin1')
    } catch {
      return null
    }
  }

  return trimmed
}
