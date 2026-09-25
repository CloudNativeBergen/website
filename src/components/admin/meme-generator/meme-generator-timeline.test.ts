// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  FRAME,
  clampDuration,
  clampTime,
  frameAt,
  newScene,
  sceneIndexAt,
  sceneStart,
  setSceneDuration,
  totalDuration,
  type Scene,
  type Transition,
} from './meme-generator-timeline'
import { DEFAULT_DESIGN } from './meme-generator-draw'

const scene = (duration: number, transition: Transition = 'cut'): Scene => ({
  key: `s${duration}${transition}`,
  design: DEFAULT_DESIGN,
  duration,
  transition,
})

describe('clampDuration', () => {
  it('never goes under a second', () => {
    expect(clampDuration(0.4)).toBe(1)
    expect(clampDuration(-3)).toBe(1)
    expect(clampDuration(Number.NaN)).toBe(1)
  })

  it('snaps to a tenth of a second', () => {
    expect(clampDuration(2.46)).toBe(2.5)
    expect(clampDuration(3.04)).toBe(3)
    expect(clampDuration(0.1 + 0.2 + 2)).toBe(2.3)
  })
})

describe('newScene', () => {
  it('is three seconds and cuts', () => {
    const made = newScene(DEFAULT_DESIGN)
    expect(made.duration).toBe(3)
    expect(made.transition).toBe('cut')
    expect(made.design).toBe(DEFAULT_DESIGN)
  })

  it('gets a key of its own', () => {
    expect(newScene(DEFAULT_DESIGN).key).not.toBe(newScene(DEFAULT_DESIGN).key)
  })
})

describe('setSceneDuration', () => {
  it('changes one scene, clamped, and leaves the others alone', () => {
    const scenes = [scene(2), scene(4)]
    expect(setSceneDuration(scenes, 1, 0.2).map((s) => s.duration)).toEqual([
      2, 1,
    ])
    expect(setSceneDuration(scenes, 0, 5.55).map((s) => s.duration)).toEqual([
      5.6, 4,
    ])
  })
})

describe('the scenes laid end to end', () => {
  const scenes = [scene(2), scene(3), scene(1.5)]

  it('is as long as its scenes put together', () => {
    expect(totalDuration(scenes)).toBe(6.5)
    expect(totalDuration([])).toBe(0)
  })

  it('starts each scene where the one before ends', () => {
    expect([0, 1, 2].map((i) => sceneStart(scenes, i))).toEqual([0, 2, 5])
  })

  it('keeps a time inside the video', () => {
    expect(clampTime(scenes, -1)).toBe(0)
    expect(clampTime(scenes, 99)).toBe(6.5)
    expect(clampTime(scenes, 3.25)).toBe(3.25)
    expect(clampTime(scenes, Number.NaN)).toBe(0)
  })

  it('gives a boundary to the scene that starts there', () => {
    expect(sceneIndexAt(scenes, 0)).toBe(0)
    expect(sceneIndexAt(scenes, 1.99)).toBe(0)
    expect(sceneIndexAt(scenes, 2)).toBe(1)
    expect(sceneIndexAt(scenes, 4.99)).toBe(1)
    expect(sceneIndexAt(scenes, 5)).toBe(2)
  })

  it('gives the end, and past it, to the last scene', () => {
    expect(sceneIndexAt(scenes, 6.5)).toBe(2)
    expect(sceneIndexAt(scenes, 100)).toBe(2)
    expect(sceneIndexAt(scenes, -1)).toBe(0)
  })
})

describe('frameAt', () => {
  it('draws one scene at its own time between transitions', () => {
    const scenes = [scene(2, 'fade'), scene(3)]
    expect(frameAt(scenes, 1)).toEqual({ kind: 'scene', index: 0, time: 1 })
    expect(frameAt(scenes, 3.5)).toEqual({
      kind: 'scene',
      index: 1,
      time: 1.5,
    })
  })

  it('has no window at a cut', () => {
    const scenes = [scene(2, 'cut'), scene(3)]
    expect(frameAt(scenes, 1.9)).toEqual({ kind: 'scene', index: 0, time: 1.9 })
    expect(frameAt(scenes, 2)).toEqual({ kind: 'scene', index: 1, time: 0 })
  })

  it('fades over half a second centred on the boundary', () => {
    const scenes = [scene(2, 'fade'), scene(3)]
    // Just before the window opens, and as it opens.
    expect(frameAt(scenes, 1.74).kind).toBe('scene')
    expect(frameAt(scenes, 1.75)).toMatchObject({ kind: 'fade', progress: 0 })
    expect(frameAt(scenes, 2)).toMatchObject({ kind: 'fade', progress: 0.5 })
    const late = frameAt(scenes, 2.2)
    expect(late.kind).toBe('fade')
    if (late.kind === 'fade') expect(late.progress).toBeCloseTo(0.9)
    // The window closes on the incoming scene.
    expect(frameAt(scenes, 2.25)).toEqual({
      kind: 'scene',
      index: 1,
      time: 0.25,
    })
  })

  it('holds the outgoing scene at its last frame, the incoming at its first', () => {
    const scenes = [scene(2, 'fade'), scene(3)]
    expect(frameAt(scenes, 1.8)).toMatchObject({
      from: { index: 0 },
      to: { index: 1, time: 0 },
    })
    const early = frameAt(scenes, 1.8)
    if (early.kind === 'fade') expect(early.from.time).toBeCloseTo(1.8)

    const after = frameAt(scenes, 2.1)
    expect(after).toMatchObject({
      from: { index: 0, time: 2 - FRAME },
      to: { index: 1 },
    })
    if (after.kind === 'fade') expect(after.to.time).toBeCloseTo(0.1)
  })

  it('never fades out of the last scene', () => {
    const scenes = [scene(2), scene(3, 'fade')]
    const late = frameAt(scenes, 4.9)
    expect(late).toMatchObject({ kind: 'scene', index: 1 })
    if (late.kind === 'scene') expect(late.time).toBeCloseTo(2.9)
    expect(frameAt(scenes, 5)).toEqual({
      kind: 'scene',
      index: 1,
      time: 3 - FRAME,
    })
  })

  it('keeps the windows of a one-second scene apart', () => {
    const scenes = [scene(2, 'fade'), scene(1, 'fade'), scene(2)]
    expect(frameAt(scenes, 2.2)).toMatchObject({
      kind: 'fade',
      from: { index: 0 },
      to: { index: 1 },
    })
    expect(frameAt(scenes, 2.5)).toEqual({
      kind: 'scene',
      index: 1,
      time: 0.5,
    })
    expect(frameAt(scenes, 2.8)).toMatchObject({
      kind: 'fade',
      from: { index: 1 },
      to: { index: 2 },
    })
  })

  it('draws a time outside the video at the nearest end', () => {
    const scenes = [scene(2)]
    expect(frameAt(scenes, -1)).toEqual({ kind: 'scene', index: 0, time: 0 })
    expect(frameAt(scenes, 9)).toEqual({
      kind: 'scene',
      index: 0,
      time: 2 - FRAME,
    })
  })
})
