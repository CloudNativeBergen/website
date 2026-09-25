// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  FRAME,
  MAX_VIDEO_DURATION,
  addScene,
  clampDuration,
  duplicateScene,
  maxSceneDuration,
  dropIndex,
  moveScene,
  removeScene,
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
import { STILL } from './meme-generator-motion'

const scene = (duration: number, transition: Transition = 'cut'): Scene => ({
  key: `s${duration}${transition}`,
  design: DEFAULT_DESIGN,
  duration,
  transition,
  motion: STILL,
})

describe('clampDuration', () => {
  it('never goes under a second', () => {
    expect(clampDuration(0.4)).toBe(1)
    expect(clampDuration(-3)).toBe(1)
    expect(clampDuration(Number.NaN)).toBe(1)
  })

  it('never goes over a minute', () => {
    expect(clampDuration(61)).toBe(60)
    expect(clampDuration(1e308)).toBe(60)
    expect(clampDuration(Number.POSITIVE_INFINITY)).toBe(60)
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

  it("clamps the shortened scene's element times into it", () => {
    const bar = { entrance: 'fade', exit: 'pop' } as const
    const scenes: Scene[] = [
      {
        ...scene(5),
        motion: {
          drift: true,
          elements: {
            text0: { ...bar, enter: 1, leave: 4.5 },
            logo: { ...bar, enter: 3.5, leave: 4 },
            qr: { ...bar, enter: 0, leave: 5 },
          },
        },
      },
      scene(2),
    ]
    const [shortened, other] = setSceneDuration(scenes, 0, 3)
    expect(shortened.motion).toEqual({
      drift: true,
      elements: {
        text0: { ...bar, enter: 1, leave: 3 },
        logo: { ...bar, enter: 3, leave: 3 },
        qr: { ...bar, enter: 0, leave: 3 },
      },
    })
    expect(other).toBe(scenes[1])
  })
})

describe('the 60-second cap', () => {
  const lengths = (scenes: Scene[]) => scenes.map((s) => s.duration)

  it('lets a scene grow only into what the others leave', () => {
    const scenes = [scene(50), scene(5)]
    expect(maxSceneDuration(scenes, 1)).toBe(10)
    expect(lengths(setSceneDuration(scenes, 1, 20))).toEqual([50, 10])
    expect(lengths(setSceneDuration(scenes, 0, 59))).toEqual([55, 5])
  })

  it('is worked out in tenths, so what is left is exact', () => {
    // 29.4 + 29.5 in floating point is 58.900000000000006.
    const scenes = [scene(29.4), scene(29.5), scene(1)]
    expect(maxSceneDuration(scenes, 2)).toBe(1.1)
    expect(lengths(setSceneDuration(scenes, 2, 9))).toEqual([29.4, 29.5, 1.1])
  })

  it('holds a lone scene to a minute', () => {
    expect(maxSceneDuration([scene(3)], 0)).toBe(MAX_VIDEO_DURATION)
  })

  it('adds a three-second scene at the end while it fits', () => {
    const scenes = [scene(57)]
    const added = addScene(scenes, DEFAULT_DESIGN)
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(lengths(added.scenes)).toEqual([57, 3])
    expect(added.index).toBe(1)
  })

  it('refuses a scene that would pass a minute, and says why', () => {
    const scenes = [scene(29.4), scene(27.7)]
    const added = addScene(scenes, DEFAULT_DESIGN)
    expect(added).toEqual({
      ok: false,
      reason:
        'A new scene is 3.0 s and only 2.9 s of the 60 s is left. Shorten a scene first.',
    })
  })

  it('duplicates a scene right after itself, with a key of its own', () => {
    const scenes = [scene(2, 'fade'), scene(4)]
    const copied = duplicateScene(scenes, 0)
    expect(copied.ok).toBe(true)
    if (!copied.ok) return
    expect(copied.index).toBe(1)
    expect(lengths(copied.scenes)).toEqual([2, 2, 4])
    expect(copied.scenes[1]).toMatchObject({
      design: DEFAULT_DESIGN,
      transition: 'fade',
    })
    expect(copied.scenes[1].key).not.toBe(scenes[0].key)
  })

  it('refuses a copy that would pass a minute, and says why', () => {
    const scenes = [scene(50), scene(6)]
    expect(duplicateScene(scenes, 1)).toEqual({
      ok: false,
      reason:
        'A copy of scene 2 is 6.0 s and only 4.0 s of the 60 s is left. Shorten a scene first.',
    })
    expect(duplicateScene(scenes, 1 - 1).ok).toBe(false)
  })
})

describe('removeScene', () => {
  const named = (...lengths: number[]) =>
    lengths.map((length, i) => ({ ...scene(length), key: `k${i}` }))
  const keys = (scenes: Scene[]) => scenes.map((s) => s.key)

  it('never removes the last scene', () => {
    expect(removeScene(named(3), 0, 1)).toEqual({
      ok: false,
      reason: 'A video has at least one scene.',
    })
  })

  it('puts the playhead at the start of the scene that takes the place of the one under it', () => {
    const removed = removeScene(named(2, 3, 4), 1, 3.5)
    expect(removed).toMatchObject({ ok: true, time: 2 })
    if (removed.ok) expect(keys(removed.scenes)).toEqual(['k0', 'k2'])
  })

  it('goes back to the new last scene when the last one under the playhead goes', () => {
    const removed = removeScene(named(2, 3, 4), 2, 8)
    expect(removed).toMatchObject({ ok: true, time: 2 })
  })

  it('keeps the playhead on its scene, at the same point in it, when another goes', () => {
    // Scene k2, 1.5 s in; with k0 gone it starts at 3.
    expect(removeScene(named(2, 3, 4), 0, 6.5)).toMatchObject({
      ok: true,
      time: 4.5,
    })
    // A later scene going leaves the time alone.
    expect(removeScene(named(2, 3, 4), 2, 1)).toMatchObject({ time: 1 })
  })
})

describe('moveScene', () => {
  const named = (...lengths: number[]) =>
    lengths.map((length, i) => ({ ...scene(length), key: `k${i}` }))
  const keys = (scenes: Scene[]) => scenes.map((s) => s.key)

  it('moves a scene, and the playhead goes with the scene it was on', () => {
    // The playhead is 0.5 s into k1, which now opens the video.
    const moved = moveScene(named(2, 3, 4), 1, 0, 2.5)
    expect(keys(moved.scenes)).toEqual(['k1', 'k0', 'k2'])
    expect(moved.time).toBe(0.5)
  })

  it('keeps the playhead on an unmoved scene that shifted', () => {
    const moved = moveScene(named(2, 3, 4), 2, 0, 1)
    expect(keys(moved.scenes)).toEqual(['k2', 'k0', 'k1'])
    expect(moved.time).toBe(5)
  })

  it('ignores a move past either end', () => {
    const scenes = named(2, 3)
    expect(moveScene(scenes, 0, -1, 1).scenes).toBe(scenes)
    expect(moveScene(scenes, 1, 2, 1).scenes).toBe(scenes)
  })
})

describe('dropIndex', () => {
  // Scenes of 2, 3 and 4 s: centres at 1, 3.5 and 7.
  const scenes = [scene(2), scene(3), scene(4)]

  it('drops a dragged scene after every other scene whose centre it passed', () => {
    // Scene 1 (centre 1) dragged to 4: past scene 2's centre, not scene 3's.
    expect(dropIndex(scenes, 0, 4)).toBe(1)
    expect(dropIndex(scenes, 0, 8)).toBe(2)
    expect(dropIndex(scenes, 2, 0.5)).toBe(0)
    expect(dropIndex(scenes, 2, 2)).toBe(1)
  })

  it('leaves a scene where it is when it has not passed a centre', () => {
    expect(dropIndex(scenes, 1, 1.5)).toBe(1)
    expect(dropIndex(scenes, 1, 6.5)).toBe(1)
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

  it('puts boundaries where the tenths say, not where floating point drifts', () => {
    const drifting = [scene(1.1), scene(2.2), scene(1)]
    expect(sceneStart(drifting, 2)).toBe(3.3)
    expect(totalDuration(drifting)).toBe(4.3)
    // 99 frames at 30 fps is 3.3 s: the first frame of scene 3.
    expect(sceneIndexAt(drifting, 99 / 30)).toBe(2)
    expect(frameAt(drifting, 3.3)).toEqual({ kind: 'scene', index: 2, time: 0 })
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
    expect(frameAt(scenes, 1.75)).toMatchObject({
      kind: 'transition',
      progress: 0,
    })
    expect(frameAt(scenes, 2)).toMatchObject({
      kind: 'transition',
      progress: 0.5,
    })
    const late = frameAt(scenes, 2.2)
    expect(late.kind).toBe('transition')
    if (late.kind === 'transition') expect(late.progress).toBeCloseTo(0.9)
    // The window closes on the incoming scene.
    expect(frameAt(scenes, 2.25)).toEqual({
      kind: 'scene',
      index: 1,
      time: 0.25,
    })
  })

  it.each(['slide', 'zoom'] as const)(
    'gives a %s the same half-second window as a fade',
    (style) => {
      const scenes = [scene(2, style), scene(3)]
      expect(frameAt(scenes, 1.74).kind).toBe('scene')
      expect(frameAt(scenes, 1.75)).toEqual({
        kind: 'transition',
        style,
        from: { index: 0, time: 1.75 },
        to: { index: 1, time: 0 },
        progress: 0,
      })
      expect(frameAt(scenes, 2)).toMatchObject({ style, progress: 0.5 })
      expect(frameAt(scenes, 2.25)).toEqual({
        kind: 'scene',
        index: 1,
        time: 0.25,
      })
    },
  )

  it('names the style of the transition it is in', () => {
    const scenes = [scene(2, 'fade'), scene(1, 'zoom'), scene(2)]
    expect(frameAt(scenes, 2)).toMatchObject({ style: 'fade' })
    expect(frameAt(scenes, 3)).toMatchObject({ style: 'zoom' })
  })

  it('holds the outgoing scene at its last frame, the incoming at its first', () => {
    const scenes = [scene(2, 'fade'), scene(3)]
    expect(frameAt(scenes, 1.8)).toMatchObject({
      from: { index: 0 },
      to: { index: 1, time: 0 },
    })
    const early = frameAt(scenes, 1.8)
    if (early.kind === 'transition') expect(early.from.time).toBeCloseTo(1.8)

    const after = frameAt(scenes, 2.1)
    expect(after).toMatchObject({
      from: { index: 0, time: 2 - FRAME },
      to: { index: 1 },
    })
    if (after.kind === 'transition') expect(after.to.time).toBeCloseTo(0.1)
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
      kind: 'transition',
      from: { index: 0 },
      to: { index: 1 },
    })
    expect(frameAt(scenes, 2.5)).toEqual({
      kind: 'scene',
      index: 1,
      time: 0.5,
    })
    expect(frameAt(scenes, 2.8)).toMatchObject({
      kind: 'transition',
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
