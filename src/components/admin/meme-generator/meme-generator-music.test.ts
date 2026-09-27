// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  MIX_RATE,
  findClick,
  mixTrack,
  shiftForPriming,
  trackGainAt,
} from './meme-generator-music'

const settings = { start: 0, volume: 1, fadeIn: 0, fadeOut: 0 }

describe('trackGainAt', () => {
  it('is the volume, flat, with no fades', () => {
    const at = (t: number) =>
      trackGainAt(t, { ...settings, volume: 0.5 }, { track: 60, video: 10 })
    expect(at(0)).toBe(0.5)
    expect(at(4.2)).toBe(0.5)
    expect(at(9.99)).toBe(0.5)
  })

  it('is silent from the video end on: a longer track is cut there', () => {
    const at = (t: number) => trackGainAt(t, settings, { track: 60, video: 10 })
    expect(at(10)).toBe(0)
    expect(at(12)).toBe(0)
    expect(at(-0.01)).toBe(0)
  })

  it('fades in from silence over the fade-in', () => {
    const at = (t: number) =>
      trackGainAt(
        t,
        { ...settings, volume: 0.8, fadeIn: 2 },
        { track: 60, video: 10 },
      )
    expect(at(0)).toBe(0)
    expect(at(1)).toBeCloseTo(0.4, 10)
    expect(at(2)).toBeCloseTo(0.8, 10)
    expect(at(5)).toBeCloseTo(0.8, 10)
  })

  it('fades out to silence at the video end when the track outlasts it', () => {
    const at = (t: number) =>
      trackGainAt(t, { ...settings, fadeOut: 2 }, { track: 60, video: 10 })
    expect(at(7)).toBe(1)
    expect(at(8)).toBe(1)
    expect(at(9)).toBeCloseTo(0.5, 10)
    expect(at(9.5)).toBeCloseTo(0.25, 10)
  })

  it('anchors the fade-out to the track end when that comes first, then silence', () => {
    // A 20 s track started 14 s in has 6 s left: it ends at video time 6.
    const at = (t: number) =>
      trackGainAt(
        t,
        { ...settings, start: 14, fadeOut: 2 },
        { track: 20, video: 10 },
      )
    expect(at(3.9)).toBe(1)
    expect(at(4)).toBe(1)
    expect(at(5)).toBeCloseTo(0.5, 10)
    expect(at(6)).toBe(0)
    expect(at(8)).toBe(0)
  })

  it('never ramps above the volume where the fades overlap', () => {
    // 2 s audible, 2 s fades both ways: the lower ramp wins.
    const at = (t: number) =>
      trackGainAt(
        t,
        { start: 0, volume: 1, fadeIn: 2, fadeOut: 2 },
        { track: 2, video: 10 },
      )
    expect(at(0.5)).toBeCloseTo(0.25, 10)
    expect(at(1)).toBeCloseTo(0.5, 10)
    expect(at(1.5)).toBeCloseTo(0.25, 10)
  })

  it('is silent throughout when the start is past the track end', () => {
    expect(
      trackGainAt(1, { ...settings, start: 30 }, { track: 20, video: 10 }),
    ).toBe(0)
  })

  it('mixes at the pinned rate', () => {
    expect(MIX_RATE).toBe(48_000)
  })
})

/** A track of `seconds` at MIX_RATE where every sample of channel c is c + 1. */
const constantTrack = (seconds: number, channels = 2) =>
  Array.from({ length: channels }, (_, c) =>
    new Float32Array(Math.round(seconds * MIX_RATE)).fill(c + 1),
  )

describe('mixTrack', () => {
  it('is the video long, in stereo, at the pinned rate', () => {
    const mixed = mixTrack(constantTrack(60), settings, 2.5)
    expect(mixed).toHaveLength(2)
    expect(mixed[0]).toHaveLength(120_000)
    expect(mixed[1]).toHaveLength(120_000)
  })

  it('reads the track from the start point, at the volume', () => {
    // Sample i of the track holds i, so the output names where it read from.
    const ramp = new Float32Array(10 * MIX_RATE).map((_, i) => i)
    const [left] = mixTrack([ramp], { ...settings, start: 2, volume: 0.5 }, 1)
    // Read from 2 s in (sample 96,000), at half volume.
    expect(left[0]).toBe(48_000)
    expect(left[100]).toBe(48_050)
  })

  it('copies a mono track to both channels', () => {
    const [left, right] = mixTrack(constantTrack(10, 1), settings, 1)
    expect(left[10]).toBe(1)
    expect(right[10]).toBe(1)
  })

  it('applies the fades sample by sample, and silence after a short track', () => {
    // 3 s of track in a 5 s video, 1 s fades.
    const [left, right] = mixTrack(
      constantTrack(3),
      { ...settings, fadeIn: 1, fadeOut: 1 },
      5,
    )
    expect(left[0]).toBe(0)
    expect(left[24_000]).toBeCloseTo(0.5, 6)
    expect(right[24_000]).toBeCloseTo(1, 6)
    expect(left[MIX_RATE * 1.5]).toBe(1)
    expect(left[MIX_RATE * 2.5]).toBeCloseTo(0.5, 6)
    expect(left[MIX_RATE * 3]).toBe(0)
    expect(left[Math.round(MIX_RATE * 4.9)]).toBe(0)
  })

  it('cuts a longer track at the video end with the fade-out applied', () => {
    const [left] = mixTrack(constantTrack(60), { ...settings, fadeOut: 1 }, 4)
    expect(left).toHaveLength(4 * MIX_RATE)
    expect(left[MIX_RATE * 3 - 1]).toBe(1)
    expect(left[MIX_RATE * 3.5]).toBeCloseTo(0.5, 6)
    // The very last sample is one sample short of silence.
    expect(left[4 * MIX_RATE - 1]).toBeCloseTo(1 / MIX_RATE, 6)
  })
})

describe('shiftForPriming', () => {
  it('drops the priming from the head and pads the tail, keeping the length', () => {
    const ramp = new Float32Array(10).map((_, i) => i + 1)
    const [shifted] = shiftForPriming([ramp], 3)
    expect([...shifted]).toEqual([4, 5, 6, 7, 8, 9, 10, 0, 0, 0])
  })

  it('leaves a track alone when there is no priming', () => {
    const ramp = new Float32Array(4).map((_, i) => i + 1)
    expect([...shiftForPriming([ramp], 0)[0]]).toEqual([1, 2, 3, 4])
  })
})

describe('findClick', () => {
  it('finds the first sample over the threshold', () => {
    const samples = new Float32Array(100)
    samples[42] = 0.9
    samples[60] = 0.9
    expect(findClick(samples, 0.45)).toBe(42)
  })

  it('counts a negative excursion too', () => {
    const samples = new Float32Array(100)
    samples[7] = -0.8
    expect(findClick(samples, 0.45)).toBe(7)
  })

  it('is null in silence', () => {
    expect(findClick(new Float32Array(100).fill(0.1), 0.45)).toBeNull()
  })
})
