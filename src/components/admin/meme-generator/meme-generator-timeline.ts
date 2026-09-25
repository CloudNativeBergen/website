import type { MemeDesign } from './meme-generator-draw'

/**
 * A video's timeline, as arithmetic. Scenes sit end to end — a transition
 * never overlaps them — so the video is as long as its scenes put together.
 * A fade, slide or zoom is a half-second window centred on the boundary: the outgoing scene
 * keeps its own time, held at its last frame once that runs out, and the
 * incoming one is held at its first frame until it starts.
 */

export const FPS = 30
/** One frame, in seconds. */
export const FRAME = 1 / FPS
export const NEW_SCENE_DURATION = 3
export const MIN_SCENE_DURATION = 1
/** A video is at most a minute, all scenes together. */
export const MAX_VIDEO_DURATION = 60
/** A scene can be at most the whole video. */
export const MAX_SCENE_DURATION = MAX_VIDEO_DURATION
export const TRANSITION_WINDOW = 0.5

/** A transition that draws both scenes, in its half-second window. */
export type TransitionStyle = 'fade' | 'slide' | 'zoom'
export type Transition = 'cut' | TransitionStyle
export const TRANSITIONS: readonly Transition[] = [
  'cut',
  'fade',
  'slide',
  'zoom',
]

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
  | {
      kind: 'transition'
      style: TransitionStyle
      from: SceneTime
      to: SceneTime
      /** 0 as the window opens, 1 as it closes. */
      progress: number
    }

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

/** What is left of the minute once `scenes` are laid end to end, in tenths. */
const tenthsLeft = (scenes: Scene[]) =>
  tenths(MAX_VIDEO_DURATION) -
  scenes.reduce((sum, scene) => sum + tenths(scene.duration), 0)

/**
 * The longest scene `index` can be: whatever the other scenes leave of the
 * minute. Never under a second, as every other scene is at least one and the
 * total never passes the minute.
 */
export function maxSceneDuration(scenes: Scene[], index: number): number {
  const others = scenes.filter((_, i) => i !== index)
  return Math.max(tenthsLeft(others), tenths(MIN_SCENE_DURATION)) / 10
}

/** A length for scene `index`, clamped to a second and to what the minute leaves. */
export function setSceneDuration(
  scenes: Scene[],
  index: number,
  seconds: number,
): Scene[] {
  const max = maxSceneDuration(scenes, index)
  return scenes.map((scene, i) =>
    i === index
      ? { ...scene, duration: Math.min(clampDuration(seconds), max) }
      : scene,
  )
}

/** A change to the scene list, or why it was refused. */
export type SceneChange =
  { ok: true; scenes: Scene[]; index: number } | { ok: false; reason: string }

function refusal(what: string, seconds: number, scenes: Scene[]) {
  const left = Math.max(tenthsLeft(scenes), 0) / 10
  return {
    ok: false as const,
    reason: `${what} is ${seconds.toFixed(1)} s and only ${left.toFixed(1)} s of the ${MAX_VIDEO_DURATION} s is left. Shorten a scene first.`,
  }
}

const fits = (scenes: Scene[], seconds: number) =>
  tenths(seconds) <= tenthsLeft(scenes)

/** A new scene at the end — refused if it would take the video past a minute. */
export function addScene(scenes: Scene[], design: MemeDesign): SceneChange {
  const scene = newScene(design)
  if (!fits(scenes, scene.duration))
    return refusal('A new scene', scene.duration, scenes)
  return { ok: true, scenes: [...scenes, scene], index: scenes.length }
}

/** A copy of scene `index` right after it — refused if it would not fit. */
export function duplicateScene(scenes: Scene[], index: number): SceneChange {
  const original = scenes[index]
  if (!fits(scenes, original.duration))
    return refusal(`A copy of scene ${index + 1}`, original.duration, scenes)
  const copy = { ...original, key: sceneKey() }
  return {
    ok: true,
    scenes: [...scenes.slice(0, index + 1), copy, ...scenes.slice(index + 1)],
    index: index + 1,
  }
}

/**
 * Where the playhead goes when the scenes change under it: the same point of
 * the same scene, so the controls keep editing it. Never onto the boundary at
 * its end, which belongs to the next scene.
 */
function followScene(before: Scene[], after: Scene[], time: number): number {
  const index = sceneIndexAt(before, time)
  const key = before[index]?.key
  const to = after.findIndex((scene) => scene.key === key)
  if (to < 0) return clampTime(after, time)
  const offset = Math.max(time - sceneStart(before, index), 0)
  return sceneStart(after, to) + Math.min(offset, after[to].duration - FRAME)
}

/**
 * Scene `index` removed, and where the playhead goes: the start of the scene
 * that takes its place if it was the one under the playhead (the new last
 * scene, if it was last); otherwise it stays on its own scene.
 */
export function removeScene(
  scenes: Scene[],
  index: number,
  time: number,
): { ok: true; scenes: Scene[]; time: number } | { ok: false; reason: string } {
  if (scenes.length <= 1)
    return { ok: false, reason: 'A video has at least one scene.' }
  const next = scenes.filter((_, i) => i !== index)
  if (sceneIndexAt(scenes, time) !== index)
    return { ok: true, scenes: next, time: followScene(scenes, next, time) }
  return {
    ok: true,
    scenes: next,
    time: sceneStart(next, Math.min(index, next.length - 1)),
  }
}

/** Scene `from` moved to position `to`; the playhead stays on its scene. */
export function moveScene(
  scenes: Scene[],
  from: number,
  to: number,
  time: number,
): { scenes: Scene[]; time: number } {
  if (to < 0 || to >= scenes.length || from === to) return { scenes, time }
  const next = scenes.filter((_, i) => i !== from)
  next.splice(to, 0, scenes[from])
  return { scenes: next, time: followScene(scenes, next, time) }
}

/**
 * Where a scene dragged along the timeline lands: after every other scene
 * whose centre its own centre, at `centre` seconds, has passed.
 */
export function dropIndex(
  scenes: Scene[],
  from: number,
  centre: number,
): number {
  return scenes.filter(
    (_, i) =>
      i !== from && sceneStart(scenes, i) + scenes[i].duration / 2 < centre,
  ).length
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

  // In the second half of a transition out of the previous scene…
  const previous = scenes[index - 1]
  if (previous && previous.transition !== 'cut' && t < start + half) {
    return transition(scenes, index - 1, start, t)
  }
  // …or the first half of one into the next.
  const end = sceneStart(scenes, index + 1)
  if (
    scenes[index].transition !== 'cut' &&
    index < scenes.length - 1 &&
    t >= end - half
  ) {
    return transition(scenes, index, end, t)
  }
  return { kind: 'scene', ...held(scenes, index, t - start) }
}

/** The transition from scene `from` into the next, at `boundary`. */
function transition(
  scenes: Scene[],
  from: number,
  boundary: number,
  t: number,
): Frame {
  const outgoingStart = boundary - scenes[from].duration
  const style = scenes[from].transition
  if (style === 'cut') throw new Error('A cut has no transition window')
  return {
    kind: 'transition',
    style,
    from: held(scenes, from, t - outgoingStart),
    to: held(scenes, from + 1, t - boundary),
    progress: (t - (boundary - TRANSITION_WINDOW / 2)) / TRANSITION_WINDOW,
  }
}
