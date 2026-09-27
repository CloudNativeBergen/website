import { MIX_RATE } from './meme-generator-music'

/**
 * The preview's sound, and — while it plays — the preview's clock
 * (docs/MARKETING_STUDIO_VIDEO_SPEC.md §6). It plays the same mix the export
 * encodes. The playhead is read from the audio clock, so picture and sound
 * cannot drift apart; pause, seek and loop restart the sound where the
 * playhead is. Scrubbing is silent: a seek during playback stops the sound,
 * holds the playhead where it was put, and plays on only once the seeks have
 * stopped for {@link SCRUB_SETTLE_MS}.
 */

export const SCRUB_SETTLE_MS = 150

/** The parts of an `AudioContext` the player uses. */
export interface PlayerContext {
  readonly currentTime: number
  /** How far behind `currentTime` the speakers are; absent in some browsers. */
  readonly outputLatency?: number
  readonly destination: unknown
  createBuffer(channels: number, length: number, sampleRate: number): unknown
  createBufferSource(): {
    buffer: unknown
    connect(destination: never): unknown
    disconnect(): void
    start(when: number, offset: number): void
    stop(): void
  }
  resume(): Promise<void>
  close(): Promise<void>
}

export interface TrackPlayer {
  /** The mix to play (`mixTrack`), or none. Mid-play, carries on in it. */
  load(channels: readonly Float32Array[] | null): void
  /** Play from `from` seconds, at once. Must be called from a user gesture. */
  play(from: number): void
  pause(): void
  /** Move the playhead: silent while paused; a scrub while playing. */
  seek(to: number): void
  /** The playhead while playing with a mix; null when it is not the clock. */
  time(): number | null
  dispose(): void
}

export function createTrackPlayer(
  openContext: () => PlayerContext = () => new AudioContext(),
): TrackPlayer {
  let ctx: PlayerContext | null = null
  let channels: readonly Float32Array[] | null = null
  let buffer: unknown = null
  let source: ReturnType<PlayerContext['createBufferSource']> | null = null
  /** Playing: the playhead `offset` at audio time `startedAt`. */
  let clock: { offset: number; startedAt: number } | null = null
  /** A scrub in progress: where it is, and the timer that settles it. */
  let scrub: { at: number; timer: ReturnType<typeof setTimeout> } | null = null

  const bufferFor = (context: PlayerContext) => {
    if (buffer || !channels) return buffer
    const made = context.createBuffer(
      channels.length,
      channels[0].length,
      MIX_RATE,
    ) as { copyToChannel(source: Float32Array, channel: number): void }
    channels.forEach((samples, c) => made.copyToChannel(samples, c))
    buffer = made
    return buffer
  }

  const silence = () => {
    if (scrub) clearTimeout(scrub.timer)
    scrub = null
    if (!source) return
    source.stop()
    source.disconnect()
    source = null
  }

  const start = (from: number) => {
    silence()
    clock = null
    // Opened and resumed inside the click even with no mix yet, so a track
    // that finishes loading mid-play can still be heard.
    try {
      ctx ??= openContext()
    } catch {
      // No Web Audio here: the preview plays silent, on its own clock.
      return
    }
    ctx.resume().catch(() => {})
    if (!channels) return
    const node = ctx.createBufferSource()
    node.buffer = bufferFor(ctx)
    node.connect(ctx.destination as never)
    node.start(0, from)
    source = node
    clock = { offset: from, startedAt: ctx.currentTime }
  }

  const time = () => {
    if (scrub) return scrub.at
    if (!clock || !ctx) return null
    const heard = ctx.currentTime - clock.startedAt - (ctx.outputLatency ?? 0)
    return clock.offset + Math.max(0, heard)
  }

  return {
    load(next) {
      const at = time()
      channels = next
      buffer = null
      if (at === null) return
      if (next) start(at)
      else {
        silence()
        clock = null
      }
    },
    play: start,
    pause() {
      silence()
      clock = null
    },
    seek(to) {
      if (!clock && !scrub) return
      silence()
      clock = null
      scrub = {
        at: to,
        timer: setTimeout(() => start(to), SCRUB_SETTLE_MS),
      }
    },
    time,
    dispose() {
      silence()
      clock = null
      ctx?.close().catch(() => {})
      ctx = null
    },
  }
}

/**
 * A track file decoded to samples at MIX_RATE, whatever the hardware's rate
 * (spec §6: pinned, so a project exports the same on every machine). An
 * offline context resamples as it decodes.
 */
export async function decodeTrack(bytes: ArrayBuffer): Promise<Float32Array[]> {
  const context = new OfflineAudioContext(2, 1, MIX_RATE)
  const decoded = await context.decodeAudioData(bytes)
  return Array.from({ length: decoded.numberOfChannels }, (_, c) =>
    decoded.getChannelData(c),
  )
}
