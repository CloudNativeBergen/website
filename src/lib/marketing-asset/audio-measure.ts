import 'server-only'
import { parseBuffer } from 'music-metadata'
import type { MarketingAssetAudioType } from './audio-type'

/**
 * A track's length in seconds, measured from the file itself (spec §6), or
 * null when the bytes are not a readable track of the sniffed format — which
 * includes an MP4 holding video, and any file whose length cannot be read.
 * Null refuses: an unknown length is never let through the ten-minute cap.
 *
 * The parser is the sniffed format's (the type is passed as a hint). MP3s are
 * scanned frame by frame (`duration: true`), so a missing or lying VBR header
 * does not undersell them. A WAV is measured by the larger of its
 * header's length and the bytes it actually holds at its PCM rate, since a
 * decoder reads on past a data chunk that undersells itself.
 *
 * Known hole: an M4A is measured by its movie header. A crafted file whose
 * header lies about its sample tables is not caught here; the file is still
 * bounded by the 20 MB cap.
 */
export async function measureAudio(
  bytes: Uint8Array,
  type: MarketingAssetAudioType,
): Promise<{ durationSeconds: number } | null> {
  let format
  try {
    ;({ format } = await parseBuffer(
      bytes,
      { mimeType: type, size: bytes.length },
      { duration: true, skipCovers: true },
    ))
  } catch {
    return null
  }
  if (format.hasVideo || format.hasAudio === false) return null
  let seconds = format.duration
  if (type === 'audio/wav' && format.bitrate && format.codec === 'PCM')
    seconds = Math.max(seconds ?? 0, (bytes.length * 8) / format.bitrate)
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null
  return { durationSeconds: seconds }
}
