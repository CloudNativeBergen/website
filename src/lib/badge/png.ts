import { Resvg } from '@resvg/resvg-js'

/**
 * OpenBadges 3.0 PNG baking.
 *
 * Per the OB 3.0 baking spec (§ PNG), a baked credential lives in an `iTXt`
 * chunk whose keyword is `openbadgecredential`; the text is the raw credential
 * (the JSON-LD credential for embedded-proof badges, or the Compact JWS for
 * JWT badges — the 1EdTech PngParser accepts either). This mirrors the SVG
 * baking (`<openbadges:credential>`), giving recipients a PNG they can upload to
 * OB 3.0 displayers such as Credly.
 */
export const OB_PNG_KEYWORD = 'openbadgecredential'

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

// CRC-32 (IEEE) table, computed once.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Serialize a PNG chunk: length(4) | type(4) | data | crc(4). */
function encodeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const typeAndData = new Uint8Array(typeBytes.length + data.length)
  typeAndData.set(typeBytes, 0)
  typeAndData.set(data, typeBytes.length)

  const out = new Uint8Array(4 + typeAndData.length + 4)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(typeAndData, 4)
  view.setUint32(4 + typeAndData.length, crc32(typeAndData))
  return out
}

/**
 * iTXt data payload (uncompressed): keyword \0 compFlag(0) compMethod(0)
 * langTag \0 translatedKeyword \0 text.
 */
function encodeITXtData(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder()
  const kw = enc.encode(keyword)
  const txt = enc.encode(text)
  // kw + NUL + compFlag + compMethod + langTag(NUL) + transKw(NUL) + text
  const out = new Uint8Array(kw.length + 5 + txt.length)
  let o = 0
  out.set(kw, o)
  o += kw.length
  out[o++] = 0 // null separator after keyword
  out[o++] = 0 // compression flag (0 = uncompressed)
  out[o++] = 0 // compression method
  out[o++] = 0 // empty language tag + null
  out[o++] = 0 // empty translated keyword + null
  out.set(txt, o)
  return out
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return false
  return true
}

/**
 * Insert an `openbadgecredential` iTXt chunk immediately before the IEND chunk.
 * Any pre-existing `openbadgecredential` iTXt chunk is dropped first so baking
 * is idempotent.
 */
export function bakeCredentialIntoPng(
  png: Uint8Array,
  credentialText: string,
): Uint8Array {
  if (!isPng(png)) {
    throw new Error('Not a PNG: bad signature')
  }

  const chunks: Uint8Array[] = []
  let offset = 8
  let iendChunk: Uint8Array | null = null
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)

  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset)
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8))
    const total = 12 + length
    const chunk = png.subarray(offset, offset + total)

    if (type === 'IEND') {
      iendChunk = chunk
      break
    }
    // Drop any prior baked credential chunk (idempotent re-bake).
    if (!(
      type === 'iTXt' && chunkKeyword(png, offset, length) === OB_PNG_KEYWORD
    )) {
      chunks.push(chunk)
    }
    offset += total
  }

  if (!iendChunk) {
    throw new Error('Invalid PNG: missing IEND chunk')
  }

  const credentialChunk = encodeChunk(
    'iTXt',
    encodeITXtData(OB_PNG_KEYWORD, credentialText),
  )

  const parts = [PNG_SIGNATURE, ...chunks, credentialChunk, iendChunk]
  const totalLength = parts.reduce((n, p) => n + p.length, 0)
  const result = new Uint8Array(totalLength)
  let o = 0
  for (const p of parts) {
    result.set(p, o)
    o += p.length
  }
  return result
}

/**
 * Read the iTXt keyword at a chunk offset (up to its first NUL), never scanning
 * past the chunk's declared data length — a malformed chunk without a NUL must
 * not bleed into subsequent chunks.
 */
function chunkKeyword(
  png: Uint8Array,
  offset: number,
  dataLength: number,
): string {
  const dataStart = offset + 8
  const dataEnd = Math.min(dataStart + dataLength, png.length)
  let end = dataStart
  while (end < dataEnd && png[end] !== 0) end++
  return new TextDecoder().decode(png.subarray(dataStart, end))
}

/**
 * Extract the `openbadgecredential` text from a baked PNG, or null when absent.
 * Only the uncompressed iTXt form this module writes is supported.
 */
export function extractCredentialFromPng(png: Uint8Array): string | null {
  if (!isPng(png)) return null
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let offset = 8
  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset)
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8))
    if (
      type === 'iTXt' &&
      chunkKeyword(png, offset, length) === OB_PNG_KEYWORD
    ) {
      const dataStart = offset + 8
      const data = png.subarray(dataStart, dataStart + length)
      // keyword \0 compFlag compMethod langTag \0 transKw \0 text
      let p = 0
      while (p < data.length && data[p] !== 0) p++ // keyword
      p++ // NUL
      // Only the uncompressed form this module writes is supported — a
      // compressed chunk's payload would be zlib bytes, not the credential.
      if (data[p] !== 0) return null
      p++ // compression flag
      p++ // compression method
      while (p < data.length && data[p] !== 0) p++ // language tag
      p++ // NUL
      while (p < data.length && data[p] !== 0) p++ // translated keyword
      p++ // NUL
      return new TextDecoder().decode(data.subarray(p))
    }
    if (type === 'IEND') break
    offset += 12 + length
  }
  return null
}

/**
 * Rasterize a badge SVG to a PNG at the given width (aspect ratio is
 * preserved; badge SVGs are square so output is too). The non-rendering
 * `<openbadges:credential>` node (and its CDATA) is stripped first so the
 * rasterizer only sees drawable markup; the credential is re-baked into the PNG
 * separately via {@link bakeCredentialIntoPng}.
 *
 * System fonts are never consulted (there are none on the serverless runtime,
 * and depending on them makes output differ between environments) — callers
 * whose SVG contains `<text>` MUST pass `fontFiles` (see lib/badge/fonts.ts)
 * or the text silently disappears from the render.
 */
export function renderBadgeSvgToPng(
  svg: string,
  options: { width?: number; fontFiles?: string[] } = {},
): Uint8Array {
  const { width = 1024, fontFiles = [] } = options
  const drawable = svg.replace(
    /<openbadges:credential[\s\S]*?<\/openbadges:credential>\s*/g,
    '',
  )
  const resvg = new Resvg(drawable, {
    fitTo: { mode: 'width', value: width },
    font: {
      loadSystemFonts: false,
      fontFiles,
      defaultFontFamily: 'Inter',
    },
  })
  return resvg.render().asPng()
}
