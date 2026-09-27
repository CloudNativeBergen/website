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
  type Source = ReturnType<PlayerContext['createBufferSource']>
  let ctx: PlayerContext | null = null
  let channels: readonly Float32Array[] | null = null
  let buffer: unknown = null
  let loop = false
  let volume = 1
  /** Every source plays through this, which carries the volume. */
  let output: ReturnType<PlayerContext['createGain']> | null = null
  /**
   * THE clock, one mapping for every path: at audio (render) time
   * `startedAt` the sound was at `offset` into the mix, and it runs on from
   * there — wrapped at the mix's end while looping. The playhead is that
   * mapping read `outputLatency` late: what is being heard. A `fresh` start
   * holds the playhead at `offset` until its first sample is heard; a
   * handover (a new mix mid-play) continues sound already heard, so it
   * reads straight back across its start.
   */
  let anchor: { offset: number; startedAt: number; fresh: boolean } | null =
    null
  /** Sources scheduled, in order, and the audio time the last one ends. */
  let sources: { node: Source; at: number }[] = []
  let scheduledUntil = 0
  /** A scrub in progress: where it is, and the timer that settles it. */
  let scrub: { at: number; timer: ReturnType<typeof setTimeout> } | null = null
  /** Counts plays, so a late refusal only undoes the play it belongs to. */
  let starts = 0

  const length = () => (channels ? channels[0].length / MIX_RATE : 0)

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

  /** Where the sound is at audio time `t`, by the one mapping. */
  const positionAt = (t: number) => {
    if (!anchor) return null
    const elapsed = t - anchor.startedAt
    const raw = anchor.offset + (anchor.fresh ? Math.max(0, elapsed) : elapsed)
    const pass = length()
    if (!loop || pass <= 0) return raw
    return ((raw % pass) + pass) % pass
  }

  const stopSources = (keep: (entry: { at: number }) => boolean) => {
    sources = sources.filter((entry) => {
      if (keep(entry)) return true
      entry.node.stop()
      entry.node.disconnect()
      return false
    })
  }

  /** Everything stops: sources, the scrub, the clock. */
  const halt = () => {
    if (scrub) clearTimeout(scrub.timer)
    scrub = null
    stopSources(() => false)
    anchor = null
  }

  /** A source of the mix, started at audio time `when` from `offset`. */
  const schedule = (context: PlayerContext, when: number, offset: number) => {
    if (!output) {
      output = context.createGain()
      output.gain.value = volume
      output.connect(context.destination as never)
    }
    const node = context.createBufferSource()
    node.buffer = bufferFor(context)
    node.connect(output as never)
    node.start(when, offset)
    sources.push({ node, at: when })
    scheduledUntil = when + length() - offset
  }

  /**
   * While looping, the next pass is always queued ahead — to start on the
   * very sample the one before it ends, never once that end is heard, which
   * would leave a gap as long as the output latency on every loop.
   */
  const queueAhead = () => {
    if (!loop || !ctx || !channels || !anchor || length() <= 0) return
    // One pass ahead of the one being rendered is enough.
    while (scheduledUntil - length() <= ctx.currentTime)
      schedule(ctx, scheduledUntil, 0)
    // Passes already over are let go of.
    const current = ctx.currentTime
    sources = sources.filter(
      (entry, i) => i >= sources.length - 2 || entry.at > current,
    )
  }

  /**
   * Sound from `from` at once. A `handover` carries on sound already
   * heard (a new mix mid-play); otherwise it is a fresh start.
   */
  const start = (from: number, handover = false) => {
    halt()
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
      if (attempt === starts) halt()
    })
    if (!channels) return
    anchor = { offset: from, startedAt: ctx.currentTime, fresh: !handover }
    schedule(ctx, 0, from)
    // `when` 0 is now: the pass ends from `now`, not from 0.
    scheduledUntil = ctx.currentTime + length() - from
    queueAhead()
  }

  const time = () => {
    if (scrub) return scrub.at
    if (!anchor || !ctx) return null
    queueAhead()
    return positionAt(ctx.currentTime - (ctx.outputLatency ?? 0))
  }

  return {
    load(next) {
      const at = time()
      // Where the sound has got to — the output latency ahead of what is
      // heard, wrapped into the pass it is in — read before the mix changes.
      const sent = !scrub && ctx && anchor ? positionAt(ctx.currentTime) : null
      channels = next
      buffer = null
      if (at === null) return
      // Mid-scrub, the settling scrub starts the new mix: never before.
      if (next && scrub) return
      // Mid-play, the new mix takes over where the sound has got to, so the
      // speakers play on from the old one's last samples without repeating
      // any, and the picture carries on from what is heard.
      if (next) start(sent ?? at, sent !== null)
      else halt()
    },
    play: (from) => start(from),
    pause: halt,
    seek(to) {
      if (!anchor && !scrub) return
      halt()
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
      if (on === loop) return
      if (!on && ctx && anchor) {
        // The pass being rendered plays out; the clock stops wrapping, so
        // the playhead runs past the end and the editor ends playback.
        const now = ctx.currentTime
        const rendered = positionAt(now) ?? 0
        const current = sources.filter((entry) => entry.at <= now).at(-1)
        stopSources((entry) => entry.at <= now)
        if (current) {
          anchor = {
            offset: rendered,
            startedAt: now,
            fresh: false,
          }
          scheduledUntil = now + length() - rendered
        }
      }
      loop = on
      queueAhead()
    },
    time,
    scrubbing: () => scrub !== null,
    dispose() {
      halt()
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
