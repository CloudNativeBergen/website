/**
 * Audio tracks in the gallery (docs/MARKETING_STUDIO_VIDEO_SPEC.md §6): MP3,
 * M4A or WAV, at most 20 MB AND at most 10 minutes. Size alone is no limit — a
 * 20 MB MP3 is twenty minutes and decodes to hundreds of MB of samples.
 * Client-safe: the constants and the byte sniff. The length is measured on the
 * server (`./audio-measure`).
 */

/** The types a track is stored as, one per format, whatever the browser said. */
export const MARKETING_ASSET_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
] as const
export type MarketingAssetAudioType =
  (typeof MARKETING_ASSET_AUDIO_TYPES)[number]

export const MARKETING_ASSET_MAX_AUDIO_BYTES = 20 * 1024 * 1024
export const MARKETING_ASSET_MAX_AUDIO_SECONDS = 10 * 60

export const MARKETING_ASSET_MAX_AUDIO_LABEL = `${MARKETING_ASSET_MAX_AUDIO_BYTES / (1024 * 1024)} MB and ${MARKETING_ASSET_MAX_AUDIO_SECONDS / 60} minutes`

export const MARKETING_ASSET_AUDIO_TYPE_REFUSAL =
  'Only MP3, M4A and WAV tracks can be added.'
export const MARKETING_ASSET_AUDIO_SIZE_REFUSAL = `The track is larger than ${MARKETING_ASSET_MAX_AUDIO_BYTES / (1024 * 1024)} MB.`
export const MARKETING_ASSET_AUDIO_LENGTH_REFUSAL = `The track is longer than ${MARKETING_ASSET_MAX_AUDIO_SECONDS / 60} minutes.`
export const MARKETING_ASSET_RIGHTS_REFUSAL =
  'Confirm that you have the right to use this track in social posts.'

/** The one sentence an organizer confirms, stored with who and when. */
export const MARKETING_ASSET_RIGHTS_STATEMENT =
  'I have the right to use this track in social posts.'

const EXTENSION_TYPES: Record<string, MarketingAssetAudioType> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
}

const BROWSER_TYPES: Record<string, MarketingAssetAudioType> = {
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/mp4': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
}

/**
 * What the browser's pick looks like: the type the upload is sent as, or null
 * when it is not a track. Browsers name M4A and WAV several ways, and some
 * give no type at all, so the extension is the fallback. A hint for the form
 * and the upload only — the server sniffs the bytes.
 */
export function audioTypeForFile(file: {
  name: string
  type: string
}): MarketingAssetAudioType | null {
  const byType = BROWSER_TYPES[file.type.toLowerCase()]
  if (byType) return byType
  if (file.type && !file.type.startsWith('audio/')) return null
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
  return EXTENSION_TYPES[ext] ?? null
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((b, i) => bytes[offset + i] === b)

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

/**
 * The format of a track from its first bytes, or null. Never the client's
 * claim, never the extension. An MP4 container passes as `audio/mp4` here; the
 * measure refuses one that holds video.
 */
export function sniffAudioType(
  bytes: Uint8Array,
): MarketingAssetAudioType | null {
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WAVE'), 8))
    return 'audio/wav'
  if (startsWith(bytes, ascii('ftyp'), 4)) return 'audio/mp4'
  // An ID3v2 tag, or a bare MPEG frame sync with the Layer III bits set. AAC
  // in ADTS (`FF F1`) has layer bits 00 and is not an MP3.
  if (startsWith(bytes, ascii('ID3'))) return 'audio/mpeg'
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe6) === 0xe2)
    return 'audio/mpeg'
  return null
}

/** `83.4` → `1:23`. */
export function formatTrackLength(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
