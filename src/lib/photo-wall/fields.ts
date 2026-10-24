/**
 * THE FIELD CHECKS (Photo Wall spec §6.2 step 1, §6.4) on a Submit's
 * multipart body. Pure: a `FormData` in, the typed fields or the one field
 * that refused out. Every value arrives as a string (or a file part), so the
 * rules are on strings: a crop is a decimal, marketing is exactly `true` or
 * `false`. Text is normalised BEFORE it is measured, in code points.
 */

export const MAX_CAPTION_POINTS = 80
export const MAX_NAME_POINTS = 40

/** The UUID v4 the phone picks per post, lower-case as `crypto.randomUUID()` makes it. */
const UPLOAD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** A decimal number: digits with at most one point; no sign, exponent or space. */
const DECIMAL = /^(\d+\.?\d*|\.\d+)$/

/**
 * What normalisation drops: control characters (`Cc`) and the bidi
 * formatting characters (LRM, RLM, the embeddings and overrides U+202A–U+202E
 * and the isolates U+2066–U+2069), which can make a caption read backwards
 * or hide text. Tab, newline and their kin are controls AND whitespace: they
 * become a space (the spec says so of newlines), so the lookahead keeps them
 * for the whitespace step. U+200D (ZWJ) is not matched, so emoji sequences
 * survive.
 */
const DROPPED = /(?!\s)[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu

export interface WallPostFields {
  uploadId: string
  photo: Blob
  caption: string | null
  name: string | null
  crop: { x: number; y: number }
  marketingConsent: boolean
}

export type WallField =
  'uploadId' | 'photo' | 'caption' | 'name' | 'crop' | 'marketingConsent'

export type WallFieldsCheck =
  { ok: true; fields: WallPostFields } | { ok: false; field: WallField }

export function isUploadId(value: unknown): value is string {
  return typeof value === 'string' && UPLOAD_ID.test(value)
}

/**
 * Unicode NFC; control and bidi formatting characters removed; any run of
 * whitespace (newlines included) becomes one space; trimmed.
 */
export function normaliseWallText(raw: string): string {
  return raw.normalize('NFC').replace(DROPPED, '').replace(/\s+/g, ' ').trim()
}

type TextCheck = { ok: true; value: string | null } | { ok: false }

/** A caption or name: normalised, `null` when empty, refused over `maxPoints`. */
function text(value: FormDataEntryValue | null, maxPoints: number): TextCheck {
  if (value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false }
  const normalised = normaliseWallText(value)
  if (normalised === '') return { ok: true, value: null }
  if ([...normalised].length > maxPoints) return { ok: false }
  return { ok: true, value: normalised }
}

/** A finite decimal in [0, 1], or `undefined`. */
function cropCoordinate(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== 'string' || !DECIMAL.test(value)) return undefined
  const n = Number(value)
  // The regex admits no sign, so `n` is already ≥ 0.
  return Number.isFinite(n) && n <= 1 ? n : undefined
}

export function checkWallFields(form: FormData): WallFieldsCheck {
  const uploadId = form.get('uploadId')
  if (!isUploadId(uploadId)) return { ok: false, field: 'uploadId' }

  const photos = form.getAll('photo')
  const [photo] = photos
  if (photos.length !== 1 || typeof photo === 'string') {
    return { ok: false, field: 'photo' }
  }

  const caption = text(form.get('caption'), MAX_CAPTION_POINTS)
  if (!caption.ok) return { ok: false, field: 'caption' }
  const name = text(form.get('name'), MAX_NAME_POINTS)
  if (!name.ok) return { ok: false, field: 'name' }

  const x = cropCoordinate(form.get('cropX'))
  const y = cropCoordinate(form.get('cropY'))
  if (x === undefined || y === undefined) return { ok: false, field: 'crop' }

  const marketing = form.get('marketingConsent')
  if (marketing !== 'true' && marketing !== 'false') {
    return { ok: false, field: 'marketingConsent' }
  }

  return {
    ok: true,
    fields: {
      uploadId,
      photo,
      caption: caption.value,
      name: name.value,
      crop: { x, y },
      marketingConsent: marketing === 'true',
    },
  }
}
