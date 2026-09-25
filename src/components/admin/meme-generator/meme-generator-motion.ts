import type { MemeDesign } from './meme-generator-draw'

/**
 * How the elements of a scene enter and leave, and how its background drifts
 * — as arithmetic. Everything is a preset with a time: there is nothing to
 * keyframe and no easing to choose. `drawDesign` reads the state at a time
 * and transforms what it draws; it never changes a font size, as text wraps
 * by measuring and a changing size would re-wrap a line mid-animation.
 */

export type Preset = 'none' | 'fade' | 'slide-up' | 'pop'
export const PRESETS: readonly Preset[] = ['none', 'fade', 'slide-up', 'pop']

/** Seconds each preset takes. An exit takes as long as its entrance. */
export const PRESET_DURATION: Record<Preset, number> = {
  none: 0,
  fade: 0.4,
  'slide-up': 0.4,
  pop: 0.35,
}

/** How far below its place a sliding element starts, in canvas pixels. */
const SLIDE_DISTANCE = 40
/** How much larger a drifting background is at the end of its scene. */
export const DRIFT_ZOOM = 0.1

/** Each text line by index, the logo and the QR code. */
export type ElementId = `text${number}` | 'logo' | 'qr'

export interface ElementMotion {
  entrance: Preset
  exit: Preset
  /** When the element enters, in seconds into its scene. */
  enter: number
  /** When it has left. Never before `enter`, never after the scene's end. */
  leave: number
}

export interface SceneMotion {
  /** A slow zoom of the background image across the scene. */
  drift: boolean
  /** An element with no entry here is shown, unanimated, for the whole scene. */
  elements: Partial<Record<ElementId, ElementMotion>>
}

export const STILL: SceneMotion = { drift: false, elements: {} }

/** What an element looks like at one moment. */
export interface ElementState {
  opacity: number
  /** Downward, in canvas pixels. */
  offsetY: number
  /** About the element's centre. */
  scale: number
}

export const AT_REST: ElementState = { opacity: 1, offsetY: 0, scale: 1 }
export const isAtRest = (state: ElementState) =>
  state.opacity === 1 && state.offsetY === 0 && state.scale === 1

const HIDDEN: ElementState = { opacity: 0, offsetY: 0, scale: 1 }

export function easeOutCubic(p: number): number {
  const t = Math.min(Math.max(p, 0), 1)
  return 1 - (1 - t) ** 3
}

/** Where the pop's overshoot peaks, as a share of the eased progress. */
const POP_PEAK = 0.7

/** A preset `p` of the way through its entrance: 0 is the start, 1 at rest. */
export function presetState(preset: Preset, p: number): ElementState {
  const e = easeOutCubic(p)
  switch (preset) {
    case 'none':
      return AT_REST
    case 'fade':
      return { opacity: e, offsetY: 0, scale: 1 }
    case 'slide-up':
      return { opacity: e, offsetY: SLIDE_DISTANCE * (1 - e), scale: 1 }
    case 'pop':
      // 0.8 up to 1.05, then settling back to 1.
      return {
        opacity: 1,
        offsetY: 0,
        scale:
          e < POP_PEAK
            ? 0.8 + 0.25 * (e / POP_PEAK)
            : 1.05 - 0.05 * ((e - POP_PEAK) / (1 - POP_PEAK)),
      }
  }
}

/** How far through `preset` a time `elapsed` seconds after it began is. */
const progress = (preset: Preset, elapsed: number) =>
  PRESET_DURATION[preset] === 0 ? 1 : elapsed / PRESET_DURATION[preset]

/**
 * An element at `time` seconds into its scene: hidden before it enters and
 * from the moment it leaves; between, its entrance played forwards from
 * `enter` and its exit backwards into `leave`. Where the two overlap both
 * apply at once.
 */
export function elementStateAt(
  motion: ElementMotion,
  time: number,
): ElementState {
  if (time < motion.enter || time >= motion.leave) return HIDDEN
  const entering = presetState(
    motion.entrance,
    progress(motion.entrance, time - motion.enter),
  )
  const leaving = presetState(
    motion.exit,
    progress(motion.exit, motion.leave - time),
  )
  return {
    opacity: entering.opacity * leaving.opacity,
    offsetY: entering.offsetY + leaving.offsetY,
    scale: entering.scale * leaving.scale,
  }
}

/** A drifting background's zoom at `time` seconds into a scene. */
export function driftScale(time: number, duration: number): number {
  return 1 + DRIFT_ZOOM * Math.min(Math.max(time / duration, 0), 1)
}

const tenth = (seconds: number) => Math.round(seconds * 10) / 10

/** An element's motion, or the whole scene with no presets. */
export function motionFor(
  scene: SceneMotion,
  id: ElementId,
  duration: number,
): ElementMotion {
  return (
    scene.elements[id] ?? {
      entrance: 'none',
      exit: 'none',
      enter: 0,
      leave: duration,
    }
  )
}

/**
 * Times pulled into a scene `duration` long, in whole tenths as the scene
 * lengths are, with the exit never before the entrance.
 */
export function clampMotion(
  motion: ElementMotion,
  duration: number,
): ElementMotion {
  const within = (t: number) =>
    Math.min(Math.max(tenth(Number.isFinite(t) ? t : 0), 0), duration)
  const enter = within(motion.enter)
  return { ...motion, enter, leave: Math.max(within(motion.leave), enter) }
}

/**
 * One end of a bar moved to `seconds`: in tenths, inside the scene, and never
 * past the other end — an exit never precedes its entrance.
 */
export function moveEnd(
  motion: ElementMotion,
  end: 'enter' | 'leave',
  seconds: number,
  duration: number,
): ElementMotion {
  const [min, max] =
    end === 'enter' ? [0, motion.leave] : [motion.enter, duration]
  const t = tenth(Number.isFinite(seconds) ? seconds : motion[end])
  return { ...motion, [end]: Math.min(Math.max(t, min), max) }
}

/**
 * A whole bar moved `seconds` along its scene: the shift is snapped to a
 * tenth ONCE and both ends move by it, in whole tenths, so the bar keeps its
 * width — rounding each end on its own can squeeze or stretch it. Held
 * inside the scene, never squeezed against either end.
 */
export function shiftBar(
  motion: ElementMotion,
  seconds: number,
  duration: number,
): ElementMotion {
  const enter = Math.round(motion.enter * 10)
  const width = Math.round(motion.leave * 10) - enter
  const room = Math.round(duration * 10) - width
  const shift = Number.isFinite(seconds) ? Math.round(seconds * 10) : 0
  const moved = Math.min(Math.max(enter + shift, 0), Math.max(room, 0))
  return { ...motion, enter: moved / 10, leave: (moved + width) / 10 }
}

/**
 * A scene's motion once its length goes from `from` to `to` seconds. Times
 * belong to the scene: shortening it clamps them in. An element that ran to
 * the end keeps running to the end, so lengthening a scene never makes one
 * vanish early.
 */
export function resizeMotion(
  scene: SceneMotion,
  from: number,
  to: number,
): SceneMotion {
  const elements: SceneMotion['elements'] = {}
  for (const [id, motion] of Object.entries(scene.elements) as [
    ElementId,
    ElementMotion,
  ][]) {
    // Only a bar that is on screen when the scene ends runs on to the new
    // end; one collapsed there (enter = leave) stays hidden.
    const ranToEnd = motion.leave >= from && motion.enter < from
    const leave = ranToEnd ? to : motion.leave
    elements[id] = clampMotion({ ...motion, leave }, to)
  }
  return { ...scene, elements }
}

/** An element a design draws, and what the timeline calls it. */
export interface DrawnElement {
  id: ElementId
  name: string
}

/**
 * The elements `design` draws, in timeline order: each text line that has
 * text, the QR code once it has a URL, and the logo, which is always there.
 */
export function elementsOf(design: MemeDesign): DrawnElement[] {
  return [
    ...design.textLines.flatMap((line, index) =>
      line.text
        ? [{ id: `text${index}` as const, name: `Text ${index + 1}` }]
        : [],
    ),
    ...(design.qr.url ? [{ id: 'qr' as const, name: 'QR code' }] : []),
    { id: 'logo', name: 'Logo' },
  ]
}
