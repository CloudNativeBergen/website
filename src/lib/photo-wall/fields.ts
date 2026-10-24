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

export interface WallPostFields {
  uploadId: string
  photo: Blob
  caption: string | null
  name: string | null
  crop: { x: number; y: number }
  marketingConsent: boolean
}

export type WallField =
  'uploadId' | 'photo' | 'caption' | 'name' | 'crop' | 'marketing'

export type WallFieldsCheck =
  { ok: true; fields: WallPostFields } | { ok: false; field: WallField }

export function isUploadId(value: unknown): value is string {
  return typeof value === 'string' && UPLOAD_ID.test(value)
}

/**
 * Unicode NFC; control characters removed; any run of whitespace (newlines
 * included) becomes one space; trimmed. Tab, newline and their kin are both
 * control characters and whitespace: they become a space, as the spec says
 * of newlines, so only the controls that are not whitespace are dropped.
 */
export function normaliseWallText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/(?!\s)\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalised text, `null` when empty, `undefined` when refused. */
function text(
  value: FormDataEntryValue | null,
  maxPoints: number,
): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const normalised = normaliseWallText(value)
  if (normalised === '') return null
  return [...normalised].length > maxPoints ? undefined : normalised
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
  if (caption === undefined) return { ok: false, field: 'caption' }
  const name = text(form.get('name'), MAX_NAME_POINTS)
  if (name === undefined) return { ok: false, field: 'name' }

  const x = cropCoordinate(form.get('cropX'))
  const y = cropCoordinate(form.get('cropY'))
  if (x === undefined || y === undefined) return { ok: false, field: 'crop' }

  const marketing = form.get('marketingConsent')
  if (marketing !== 'true' && marketing !== 'false') {
    return { ok: false, field: 'marketing' }
  }

  return {
    ok: true,
    fields: {
      uploadId,
      photo,
      caption,
      name,
      crop: { x, y },
      marketingConsent: marketing === 'true',
    },
  }
}
