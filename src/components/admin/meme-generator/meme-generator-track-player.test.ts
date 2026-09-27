// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SCRUB_SETTLE_MS,
  createTrackPlayer,
  type PlayerContext,
} from './meme-generator-track-player'
import { MIX_RATE } from './meme-generator-music'

/** An audio context whose clock the test moves, recording every source. */
function fakeContext(outputLatency = 0) {
  const sources: {
    startedAt: number
    offset: number
    stopped: boolean
    samples: number
  }[] = []
  const gain = { gain: { value: 1 }, connected: false }
  const ctx = {
    gain,
    createGain() {
      return {
        gain: gain.gain,
        connect: () => {
          gain.connected = true
        },
      }
    },
    currentTime: 0,
    outputLatency,
    destination: {},
    resumed: 0,
    closed: false,
    createBuffer: (_channels: number, length: number) => ({
      length,
      copyToChannel: () => {},
    }),
    createBufferSource() {
      const record = { startedAt: -1, offset: -1, stopped: false, samples: 0 }
      const node = {
        buffer: null as unknown,
        connect: () => {},
        disconnect: () => {},
        start(when: number, offset: number) {
          // As Web Audio has it: a time already past (0 included) is now.
          record.startedAt = Math.max(when, ctx.currentTime)
          record.offset = offset
          record.samples = (node.buffer as { length: number }).length
          sources.push(record)
        },
        stop: () => {
          record.stopped = true
        },
      }
      return node
    },
    resume: async () => {
      ctx.resumed++
    },
    close: async () => {
      ctx.closed = true
    },
  } satisfies PlayerContext & Record<string, unknown>
  return { ctx, sources }
}

const mix = (seconds: number) =>
  [
    new Float32Array(seconds * MIX_RATE),
    new Float32Array(seconds * MIX_RATE),
  ] as const

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the track player', () => {
  it('is the clock while it plays: where it started plus the audio time since', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    ctx.currentTime = 7
    player.play(2)
    expect(sources).toEqual([
      { startedAt: 7, offset: 2, stopped: false, samples: 10 * MIX_RATE },
    ])
    ctx.currentTime = 8.5
    expect(player.time()).toBeCloseTo(3.5, 10)
  })

  it('shows the picture that is being HEARD: the output latency behind', () => {
    const { ctx } = fakeContext(0.1)
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.play(2)
    // Nothing is heard yet: the picture waits at the start point.
    ctx.currentTime = 0.05
    expect(player.time()).toBe(2)
    ctx.currentTime = 1
    expect(player.time()).toBeCloseTo(2.9, 10)
  })

  it('stops the sound on pause, and is no clock then', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.play(0)
    player.pause()
    expect(sources[0].stopped).toBe(true)
    expect(player.time()).toBeNull()
  })

  it('makes no sound for a seek while paused: scrubbing is silent', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.seek(3)
    player.seek(4)
    vi.advanceTimersByTime(SCRUB_SETTLE_MS * 2)
    expect(sources).toEqual([])
  })

  it('goes silent through a scrub during playback, and plays on from where it settles', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.play(0)
    ctx.currentTime = 1
    player.seek(5)
    expect(sources[0].stopped).toBe(true)
    // Held where the scrub put it until the scrub settles.
    ctx.currentTime = 1.05
    player.seek(6)
    expect(player.time()).toBe(6)
    expect(player.scrubbing()).toBe(true)
    vi.advanceTimersByTime(SCRUB_SETTLE_MS - 1)
    expect(sources).toHaveLength(1)
    ctx.currentTime = 2
    vi.advanceTimersByTime(1)
    expect(sources[1]).toMatchObject({ startedAt: 2, offset: 6 })
    ctx.currentTime = 3
    expect(player.time()).toBeCloseTo(7, 10)
    expect(player.scrubbing()).toBe(false)
  })

  it('restarts at once from where play is pressed, as a loop does', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.play(9)
    ctx.currentTime = 1
    player.play(0)
    expect(sources[0].stopped).toBe(true)
    expect(sources[1]).toMatchObject({ startedAt: 1, offset: 0 })
  })

  it('never plays a scrub that settles after a pause', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.play(0)
    player.seek(4)
    player.pause()
    vi.advanceTimersByTime(SCRUB_SETTLE_MS)
    expect(sources).toHaveLength(1)
    expect(player.time()).toBeNull()
  })

  it('plays a new mix from the same place when the track changes mid-play', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.play(0)
    ctx.currentTime = 2
    player.load(mix(12))
    expect(sources[0].stopped).toBe(true)
    expect(sources[1]).toMatchObject({
      startedAt: 2,
      offset: 2,
      samples: 12 * MIX_RATE,
    })
  })

  it('is no clock, and makes no sound, without a mix', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.play(0)
    expect(sources).toEqual([])
    expect(player.time()).toBeNull()
    player.load(mix(10))
    player.play(0)
    player.load(null)
    expect(sources[0].stopped).toBe(true)
    expect(player.time()).toBeNull()
  })

  it('opens its audio context on the first play — inside the click — and closes it on dispose', () => {
    const { ctx } = fakeContext()
    const open = vi.fn(() => ctx)
    const player = createTrackPlayer(open)
    player.load(mix(10))
    expect(open).not.toHaveBeenCalled()
    player.play(0)
    player.play(1)
    expect(open).toHaveBeenCalledTimes(1)
    expect(ctx.resumed).toBe(2)
    player.dispose()
    expect(ctx.closed).toBe(true)
  })

  it('opens its context inside a click even before the mix has loaded, so the track can join in later', () => {
    const { ctx, sources } = fakeContext()
    const open = vi.fn(() => ctx)
    const player = createTrackPlayer(open)
    player.play(1)
    expect(open).toHaveBeenCalledTimes(1)
    expect(ctx.resumed).toBe(1)
    expect(sources).toEqual([])
    player.load(mix(10))
    player.play(2.5)
    expect(sources[0]).toMatchObject({ offset: 2.5 })
  })

  it('plays silent, without throwing, where there is no Web Audio', () => {
    const player = createTrackPlayer(() => {
      throw new ReferenceError('AudioContext is not defined')
    })
    player.load(mix(10))
    expect(() => player.play(0)).not.toThrow()
    expect(player.time()).toBeNull()
  })

  it('never leaves a rejected resume or close unhandled', async () => {
    vi.useRealTimers()
    const { ctx } = fakeContext()
    const failing = {
      ...ctx,
      createBufferSource: ctx.createBufferSource,
      createBuffer: ctx.createBuffer,
      resume: () => Promise.reject(new Error('resume refused')),
      close: () => Promise.reject(new Error('already closed')),
    }
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const player = createTrackPlayer(() => failing)
    player.load(mix(1))
    player.play(0)
    player.dispose()
    await new Promise((resolve) => setTimeout(resolve, 10))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('stops being the clock when the context refuses to resume, so the preview plays on silent', async () => {
    const { ctx, sources } = fakeContext()
    const refusing = {
      ...ctx,
      createBufferSource: ctx.createBufferSource,
      createBuffer: ctx.createBuffer,
      resume: () => Promise.reject(new Error('not allowed')),
    }
    const player = createTrackPlayer(() => refusing)
    player.load(mix(10))
    player.play(2)
    expect(player.time()).toBe(2)
    await Promise.resolve()
    await Promise.resolve()
    // A suspended context's clock never moves: it must not hold the picture.
    expect(player.time()).toBeNull()
    expect(sources[0].stopped).toBe(true)
  })

  it('never lets an earlier refused resume undo a later play', async () => {
    const { ctx, sources } = fakeContext()
    let refuse = true
    const flaky = {
      ...ctx,
      createBufferSource: ctx.createBufferSource,
      createBuffer: ctx.createBuffer,
      resume: () =>
        refuse ? Promise.reject(new Error('not yet')) : Promise.resolve(),
    }
    const player = createTrackPlayer(() => flaky)
    player.load(mix(10))
    player.play(0)
    refuse = false
    player.play(3)
    await Promise.resolve()
    await Promise.resolve()
    expect(player.time()).toBe(3)
    expect(sources[1].stopped).toBe(false)
  })

  it('loops without a gap: the next pass is scheduled to start exactly where this one ends', () => {
    const { ctx, sources } = fakeContext(0.1)
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.setLoop(true)
    ctx.currentTime = 5
    player.play(8)
    // The pass from 8 s ends 2 s of audio time later; the next is already
    // queued for that very moment, not started once it has been heard.
    expect(sources).toMatchObject([
      { startedAt: 5, offset: 8 },
      { startedAt: 7, offset: 0 },
    ])
    ctx.currentTime = 7.05
    // Heard: 2.05 − 0.1 of the first pass.
    expect(player.time()).toBeCloseTo(9.95, 10)
    ctx.currentTime = 7.2
    // Heard: 0.1 s into the second pass — and the third is queued.
    expect(player.time()).toBeCloseTo(0.1, 10)
    expect(sources[2]).toMatchObject({ startedAt: 17, offset: 0 })
  })

  it('lets a pass run out once looping is turned off, cancelling the one queued', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.setLoop(true)
    player.play(8)
    player.setLoop(false)
    expect(sources[1].stopped).toBe(true)
    expect(sources[0].stopped).toBe(false)
    ctx.currentTime = 2.5
    // Past the end: the editor ends playback there.
    expect(player.time()).toBeCloseTo(10.5, 10)
  })

  it('queues the next pass when looping is turned on mid-pass', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.play(4)
    ctx.currentTime = 1
    player.setLoop(true)
    expect(sources[1]).toMatchObject({ startedAt: 6, offset: 0 })
  })

  it('changes the volume on a gain, never by restarting the sound', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.setVolume(0.8)
    player.play(0)
    expect(ctx.gain.gain.value).toBe(0.8)
    expect(ctx.gain.connected).toBe(true)
    ctx.currentTime = 1
    for (const volume of [0.7, 0.5, 0.3]) player.setVolume(volume)
    expect(ctx.gain.gain.value).toBe(0.3)
    expect(sources).toHaveLength(1)
    expect(sources[0].stopped).toBe(false)
  })

  it('keeps a mix that arrives mid-scrub silent until the scrub settles', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.play(0)
    player.seek(5)
    player.load(mix(12))
    // Still scrubbing: nothing plays, the playhead stays where it was put.
    expect(sources).toHaveLength(1)
    expect(player.time()).toBe(5)
    vi.advanceTimersByTime(SCRUB_SETTLE_MS)
    expect(sources[1]).toMatchObject({ offset: 5, samples: 12 * MIX_RATE })
  })

  it('hands a new mix over where the sound has got to, not where it is heard, so nothing repeats', () => {
    const { ctx, sources } = fakeContext(0.1)
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.play(0)
    ctx.currentTime = 2
    // Heard 1.9 s in; 2.0 s has already gone to the speakers.
    expect(player.time()).toBeCloseTo(1.9, 10)
    player.load(mix(12))
    expect(sources[1]).toMatchObject({ startedAt: 2, offset: 2 })
    // The picture carries on from what is heard, without a jump or a hold.
    expect(player.time()).toBeCloseTo(1.9, 10)
    ctx.currentTime = 2.05
    expect(player.time()).toBeCloseTo(1.95, 10)
    ctx.currentTime = 2.3
    expect(player.time()).toBeCloseTo(2.2, 10)
  })

  it('keeps the phase when a new mix arrives after the next loop pass has begun, before it is heard', () => {
    const { ctx, sources } = fakeContext(0.1)
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.setLoop(true)
    player.play(9.5)
    // The next pass began at 0.5 s of audio time; 0.05 s of it is sent,
    // but the speakers are still 0.05 s before its start.
    ctx.currentTime = 0.55
    expect(player.time()).toBeCloseTo(9.95, 10)
    const before = sources.length
    player.load(mix(10))
    const replaced = sources.slice(before)
    // Carries on 0.05 s into the new pass, not at its end…
    expect(replaced[0].startedAt).toBeCloseTo(0.55, 10)
    expect(replaced[0].offset).toBeCloseTo(0.05, 10)
    // …and the pass after it is queued where this one ends.
    expect(replaced[1].startedAt).toBeCloseTo(10.5, 10)
    expect(replaced[1].offset).toBe(0)
    expect(player.time()).toBeCloseTo(9.95, 10)
    ctx.currentTime = 0.7
    expect(player.time()).toBeCloseTo(0.1, 10)
  })

  it('finishes the pass being heard when looping is turned off after the next one began rendering', () => {
    const { ctx, sources } = fakeContext(0.1)
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.setLoop(true)
    player.play(9.5)
    // The next pass began rendering at 0.5; the speakers are 0.05 s short of it.
    ctx.currentTime = 0.55
    player.setLoop(false)
    expect(player.time()).toBeCloseTo(9.95, 10)
    // The pass not yet heard is stopped; the one heard plays out.
    expect(sources[1]).toMatchObject({ startedAt: 0.5, stopped: true })
    expect(sources[0].stopped).toBe(false)
    ctx.currentTime = 0.65
    // Past the end: the editor ends playback there.
    expect(player.time()).toBeCloseTo(10.05, 10)
  })

  it('picks a loop up at its current phase after the page stopped asking, never starting the missed passes together', () => {
    const { ctx, sources } = fakeContext()
    const player = createTrackPlayer(() => ctx)
    player.load(mix(10))
    player.setLoop(true)
    player.play(0)
    expect(sources).toHaveLength(2)
    // A background tab: no one asks for 35 s of audio time.
    ctx.currentTime = 35
    expect(player.time()).toBeCloseTo(5, 10)
    const added = sources.slice(2)
    // The pass under way now, from its phase, and the next — nothing for
    // the passes at 20 s and 30 s, which would all start at once.
    expect(added).toMatchObject([
      { startedAt: 35, offset: 5 },
      { startedAt: 40, offset: 0 },
    ])
  })
})
