import type { TrackSource } from '@/lib/video-project'

/**
 * A video's music track, as arithmetic (docs/MARKETING_STUDIO_VIDEO_SPEC.md
 * §6). Pure: the preview and the export both play what `mixTrack` makes, so
 * what is heard while editing is what the file holds.
 */

/**
 * The one sample rate a track is decoded and mixed at. Decoded at the
 * hardware's rate, the same project would export differently on two machines.
 */
export const MIX_RATE = 48_000

/**
 * How long the video's length must hold still before the preview is mixed
 * again: a scene's edge dragged changes it on every pointer move, and a
 * minute's mix is millions of samples.
 */
export const MIX_SETTLE_MS = 200

/** How a video uses its track. Times are seconds; volume is 0 to 1. */
export interface TrackSettings {
  /** Where in the track the video starts. */
  start: number
  volume: number
  fadeIn: number
  fadeOut: number
}

/** Lengths, in seconds: the whole track's and the video's. */
export interface MixLengths {
  track: number
  video: number
}

/**
 * The track's gain at video time `t`: the volume, ramped linearly up over the
 * fade-in from the video's start and down over the fade-out to where the
 * sound ends — the video's end, or the track's if that comes first. Silent
 * outside that. Where the fades overlap, the lower ramp wins.
 */
export function trackGainAt(
  t: number,
  { start, volume, fadeIn, fadeOut }: TrackSettings,
  lengths: MixLengths,
): number {
  const end = Math.min(lengths.video, lengths.track - start)
  if (t < 0 || t >= end) return 0
  const up = fadeIn > 0 ? Math.min(1, t / fadeIn) : 1
  const down = fadeOut > 0 ? Math.min(1, (end - t) / fadeOut) : 1
  return volume * Math.min(up, down)
}

/**
 * The track as the video plays it: stereo at MIX_RATE, exactly the video's
 * length, read from the start point with {@link trackGainAt} applied to every
 * sample. `channels` is the decoded track at MIX_RATE; a mono one plays on
 * both sides.
 */
export function mixTrack(
  channels: readonly Float32Array[],
  settings: TrackSettings,
  videoSeconds: number,
): [Float32Array, Float32Array] {
  const length = Math.round(videoSeconds * MIX_RATE)
  const trackLength = channels[0]?.length ?? 0
  const lengths = { track: trackLength / MIX_RATE, video: length / MIX_RATE }
  const offset = Math.round(settings.start * MIX_RATE)
  const out: [Float32Array, Float32Array] = [
    new Float32Array(length),
    new Float32Array(length),
  ]
  const sources = [channels[0], channels[1] ?? channels[0]]
  for (let i = 0; i < length; i++) {
    const at = offset + i
    if (at >= trackLength) break
    const gain = trackGainAt(i / MIX_RATE, settings, lengths)
    if (gain === 0) continue
    out[0][i] = sources[0][at] * gain
    out[1][i] = sources[1][at] * gain
  }
  return out
}

/**
 * The mix as it is handed to an encoder that delays its output by `priming`
 * samples (docs/MARKETING_STUDIO_VIDEO_PROOF.md §4): the first `priming`
 * samples dropped, so the rest land in step with the picture. The encoder's
 * priming takes their place, so the file's sound is still the video's length
 * (to its last whole AAC frame). The dropped head is under the fade-in when
 * there is one. A view, not a copy: the encoder's AudioBuffer copies it.
 */
export function shiftForPriming<T extends readonly Float32Array[]>(
  channels: T,
  priming: number,
): T {
  if (priming <= 0) return channels
  return channels.map((samples) =>
    samples.subarray(Math.min(priming, samples.length)),
  ) as unknown as T
}

/** The first sample louder than `threshold`, either way; null if none. */
export function findClick(
  samples: Float32Array,
  threshold: number,
): number | null {
  for (let i = 0; i < samples.length; i++)
    if (Math.abs(samples[i]) > threshold) return i
  return null
}

/** The video's music as the editor holds it and a project stores it. */
export interface VideoTrack extends TrackSettings {
  title: string
  /** The gallery track it was picked from, while that exists. */
  galleryAssetId?: string
  /** The file a saved project holds, once saved or opened. */
  fileId?: string
}

/** A newly picked track: from its start, a little under full, eased in and out. */
export const NEW_TRACK_SETTINGS: TrackSettings = {
  start: 0,
  volume: 0.8,
  fadeIn: 1,
  fadeOut: 2,
}

/**
 * Where the editor fetches a track's file: the saved project that holds it,
 * once it does — which it keeps even when its gallery entry is deleted —
 * else the gallery track just picked; null for neither.
 */
export function trackSource(
  track: VideoTrack,
  projectId: string | null,
): TrackSource | null {
  if (track.fileId && projectId)
    return { project: projectId, file: track.fileId }
  if (track.galleryAssetId) return { asset: track.galleryAssetId }
  return null
}
