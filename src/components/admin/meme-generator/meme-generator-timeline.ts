import type { MemeDesign } from './meme-generator-draw'

/**
 * A video's timeline, as arithmetic. Scenes sit end to end — a transition
 * never overlaps them — so the video is as long as its scenes put together.
 * A fade is a half-second window centred on the boundary: the outgoing scene
 * keeps its own time, held at its last frame once that runs out, and the
 * incoming one is held at its first frame until it starts.
 */

export const FPS = 30
/** One frame, in seconds. */
export const FRAME = 1 / FPS
export const NEW_SCENE_DURATION = 3
export const MIN_SCENE_DURATION = 1
/** A scene can be at most the whole video. */
export const MAX_SCENE_DURATION = 60
export const TRANSITION_WINDOW = 0.5

export type Transition = 'cut' | 'fade'

export interface Scene {
  key: string
  design: MemeDesign
  /** Seconds. */
  duration: number
  /** Into the next scene; the last scene's is never used. */
  transition: Transition
}

/** A scene at a time within it. */
export interface SceneTime {
  index: number
  time: number
}

/** What to paint at one moment of the video. */
export type Frame =
  | ({ kind: 'scene' } & SceneTime)
  | { kind: 'fade'; from: SceneTime; to: SceneTime; progress: number }

let keys = 0
const sceneKey = () => `scene-${Date.now().toString(36)}-${++keys}`

export function newScene(design: MemeDesign): Scene {
  return {
    key: sceneKey(),
    design,
    duration: NEW_SCENE_DURATION,
    transition: 'cut',
  }
}

/**
 * Between a second and a minute, in tenths — what the keyboard steps and the
 * fields show.
 */
export function clampDuration(seconds: number): number {
  if (Number.isNaN(seconds)) return MIN_SCENE_DURATION
  const bounded = Math.min(
    Math.max(seconds, MIN_SCENE_DURATION),
    MAX_SCENE_DURATION,
  )
  return Math.round(bounded * 10) / 10
}

/**
 * Durations are whole tenths, so sums are taken in tenths: 1.1 + 2.2 in
 * floating point is 3.3000000000000003, which would put the boundary a hair
 * after 3.3 and give that instant to the outgoing scene.
 */
const tenths = (seconds: number) => Math.round(seconds * 10)

export function setSceneDuration(
  scenes: Scene[],
  index: number,
  seconds: number,
): Scene[] {
  return scenes.map((scene, i) =>
    i === index ? { ...scene, duration: clampDuration(seconds) } : scene,
  )
}

export function totalDuration(scenes: Scene[]): number {
  return scenes.reduce((sum, scene) => sum + tenths(scene.duration), 0) / 10
}

export function sceneStart(scenes: Scene[], index: number): number {
  return totalDuration(scenes.slice(0, index))
}

export function clampTime(scenes: Scene[], time: number): number {
  if (!Number.isFinite(time)) return 0
  return Math.min(Math.max(time, 0), totalDuration(scenes))
}

/**
 * The scene playing at `time`. A boundary belongs to the scene that starts
 * there; the end of the video, and anything past it, to the last scene.
 */
export function sceneIndexAt(scenes: Scene[], time: number): number {
  let end = 0
  for (let index = 0; index < scenes.length - 1; index++) {
    end += tenths(scenes[index].duration)
    if (time < end / 10) return index
  }
  return Math.max(scenes.length - 1, 0)
}

/** A scene's own time, never past its last frame. */
function held(scenes: Scene[], index: number, local: number): SceneTime {
  const last = scenes[index].duration - FRAME
  return { index, time: Math.min(Math.max(local, 0), last) }
}

export function frameAt(scenes: Scene[], time: number): Frame {
  const t = clampTime(scenes, time)
  const index = sceneIndexAt(scenes, t)
  const start = sceneStart(scenes, index)
  const half = TRANSITION_WINDOW / 2

  // In the second half of a fade out of the previous scene…
  const previous = scenes[index - 1]
  if (previous?.transition === 'fade' && t < start + half) {
    return fade(scenes, index - 1, start, t)
  }
  // …or the first half of a fade into the next one.
  const end = sceneStart(scenes, index + 1)
  if (
    scenes[index].transition === 'fade' &&
    index < scenes.length - 1 &&
    t >= end - half
  ) {
    return fade(scenes, index, end, t)
  }
  return { kind: 'scene', ...held(scenes, index, t - start) }
}

/** The fade from scene `from` into the next, whose boundary is at `boundary`. */
function fade(
  scenes: Scene[],
  from: number,
  boundary: number,
  t: number,
): Frame {
  const outgoingStart = boundary - scenes[from].duration
  return {
    kind: 'fade',
    from: held(scenes, from, t - outgoingStart),
    to: held(scenes, from + 1, t - boundary),
    progress: (t - (boundary - TRANSITION_WINDOW / 2)) / TRANSITION_WINDOW,
  }
}
