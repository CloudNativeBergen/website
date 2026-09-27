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
  const ctx = {
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
          record.startedAt = ctx.currentTime + when
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
    vi.advanceTimersByTime(SCRUB_SETTLE_MS - 1)
    expect(sources).toHaveLength(1)
    ctx.currentTime = 2
    vi.advanceTimersByTime(1)
    expect(sources[1]).toMatchObject({ startedAt: 2, offset: 6 })
    ctx.currentTime = 3
    expect(player.time()).toBeCloseTo(7, 10)
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
})
