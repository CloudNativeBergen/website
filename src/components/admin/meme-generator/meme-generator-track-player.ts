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
  createGain(): {
    readonly gain: { value: number }
    connect(destination: never): unknown
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
  /**
   * Loop the sound, gaplessly: the next pass is queued to start on the very
   * sample the current one ends — never started once the end is heard, which
   * would leave a gap as long as the output latency on every loop.
   */
  setLoop(on: boolean): void
  /** 0 to 1, applied as the sound plays: nothing is rebuilt or restarted. */
  setVolume(volume: number): void
  /** The playhead while playing with a mix; null when it is not the clock. */
  time(): number | null
  /** A scrub during playback has not settled yet: the sound is off. */
  scrubbing(): boolean
  dispose(): void
}

export function createTrackPlayer(
  openContext: () => PlayerContext = () => new AudioContext(),
): TrackPlayer {
  let ctx: PlayerContext | null = null
  let channels: readonly Float32Array[] | null = null
  let buffer: unknown = null
  let source: ReturnType<PlayerContext['createBufferSource']> | null = null
  let loop = false
  let volume = 1
  /** Every source plays through this, which carries the volume. */
  let output: ReturnType<PlayerContext['createGain']> | null = null
  /** The next pass, queued at audio time `at` while looping. */
  let queued: {
    node: ReturnType<PlayerContext['createBufferSource']>
    at: number
  } | null = null
  /** Playing: the playhead `offset` at audio time `startedAt`. */
  let clock: { offset: number; startedAt: number } | null = null
  /** A scrub in progress: where it is, and the timer that settles it. */
  let scrub: { at: number; timer: ReturnType<typeof setTimeout> } | null = null
  /** Counts plays, so a late refusal only undoes the play it belongs to. */
  let starts = 0

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

  const unqueue = () => {
    if (!queued) return
    queued.node.stop()
    queued.node.disconnect()
    queued = null
  }

  const silence = () => {
    if (scrub) clearTimeout(scrub.timer)
    scrub = null
    unqueue()
    if (!source) return
    source.stop()
    source.disconnect()
    source = null
  }

  /** A source of the mix, started at audio time `when` from `offset`. */
  const sourceAt = (context: PlayerContext, when: number, offset: number) => {
    if (!output) {
      output = context.createGain()
      output.gain.value = volume
      output.connect(context.destination as never)
    }
    const node = context.createBufferSource()
    node.buffer = bufferFor(context)
    node.connect(output as never)
    node.start(when, offset)
    return node
  }

  /** Queue the pass after the playing one, where it ends. */
  const queueNext = () => {
    if (!loop || queued || !clock || !ctx || !channels) return
    const at = clock.startedAt + channels[0].length / MIX_RATE - clock.offset
    queued = { node: sourceAt(ctx, at, 0), at }
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
    // A context that will not run has a clock that never moves: the sound
    // is dropped and the preview plays on silent, on its own clock — unless
    // a later play has started since.
    const attempt = ++starts
    ctx.resume().catch(() => {
      if (attempt !== starts) return
      silence()
      clock = null
    })
    if (!channels) return
    source = sourceAt(ctx, 0, from)
    clock = { offset: from, startedAt: ctx.currentTime }
    queueNext()
  }

  const time = () => {
    if (scrub) return scrub.at
    if (!clock || !ctx) return null
    const latency = ctx.outputLatency ?? 0
    // The queued pass is being heard: it is the clock now, and the one
    // after it is queued.
    if (queued && ctx.currentTime - latency >= queued.at) {
      source?.disconnect()
      source = queued.node
      clock = { offset: 0, startedAt: queued.at }
      queued = null
      queueNext()
    }
    const heard = ctx.currentTime - clock.startedAt - latency
    return clock.offset + Math.max(0, heard)
  }

  return {
    load(next) {
      const at = time()
      channels = next
      buffer = null
      if (at === null) return
      // Mid-scrub, the settling scrub starts the new mix: never before.
      if (next && scrub) return
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
    setVolume(next) {
      volume = next
      if (output) output.gain.value = next
    },
    setLoop(on) {
      loop = on
      if (on) queueNext()
      else unqueue()
    },
    time,
    scrubbing: () => scrub !== null,
    dispose() {
      silence()
      clock = null
      ctx?.close().catch(() => {})
      ctx = null
      output = null
    },
  }
}

/**
 * A track file decoded to samples at MIX_RATE, whatever the hardware's rate
 * (spec §6: pinned, so a project exports the same on every machine). An
 * offline context resamples as it decodes. More than two channels — the
 * gallery takes a 5.1 WAV — are folded down to stereo by rendering through
 * a stereo offline context, with Web Audio's speaker rules (the centre at √½
 * into each side, the surrounds likewise, the LFE left out); decoding alone
 * keeps every channel, and the mix reads only the first two.
 */
export async function decodeTrack(bytes: ArrayBuffer): Promise<Float32Array[]> {
  const context = new OfflineAudioContext(2, 1, MIX_RATE)
  const decoded = await context.decodeAudioData(bytes)
  if (decoded.numberOfChannels <= 2)
    return Array.from({ length: decoded.numberOfChannels }, (_, c) =>
      decoded.getChannelData(c),
    )
  const stereo = new OfflineAudioContext(2, decoded.length, MIX_RATE)
  const source = stereo.createBufferSource()
  source.buffer = decoded
  source.channelInterpretation = 'speakers'
  source.connect(stereo.destination)
  source.start()
  const rendered = await stereo.startRendering()
  return [rendered.getChannelData(0), rendered.getChannelData(1)]
}
