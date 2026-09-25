'use client'

import { useRef } from 'react'
import { styles } from './meme-generator-config'
import {
  PRESETS,
  PRESET_DURATION,
  clampMotion,
  elementsOf,
  motionFor,
  type DrawnElement,
  type ElementId,
  type ElementMotion,
  type Preset,
} from './meme-generator-motion'
import { sceneStart, type Scene } from './meme-generator-timeline'
import {
  PX_PER_SECOND,
  SecondsField,
  keyStep,
  seconds,
  useDrag,
} from './timeline-controls'

/** A change to one element's bar. `grouped` folds a drag into one undo step. */
export type ElementChange = (
  index: number,
  id: ElementId,
  motion: ElementMotion,
  grouped: boolean,
) => void

export const PRESET_NAMES: Record<Preset, string> = {
  none: 'None',
  fade: 'Fade',
  'slide-up': 'Slide up',
  pop: 'Pop',
}

/** Every element any scene draws, once each, in timeline order. */
function rowsOf(scenes: Scene[]): DrawnElement[] {
  const rows = new Map<ElementId, DrawnElement>()
  for (const scene of scenes)
    for (const element of elementsOf(scene.design))
      rows.set(element.id, element)
  const order = (id: ElementId) =>
    id === 'logo' ? 2 : id === 'qr' ? 1 : Number(id.slice(4)) / 10
  return [...rows.values()].sort((a, b) => order(a.id) - order(b.id))
}

/** One end of a bar: when the element enters, or when it has left. */
function BarEnd({
  end,
  label,
  motion,
  duration,
  onChange,
}: {
  end: 'enter' | 'leave'
  label: string
  motion: ElementMotion
  duration: number
  onChange: (motion: ElementMotion) => void
}) {
  const start = useRef(motion)
  const value = motion[end]
  const [min, max] =
    end === 'enter' ? [0, motion.leave] : [motion.enter, duration]
  const set = (to: number) => {
    const bounded = Math.min(Math.max(Math.round(to * 10) / 10, min), max)
    if (bounded !== value) onChange({ ...motion, [end]: bounded })
  }
  const drag = useDrag(
    () => {
      start.current = motion
    },
    (delta) => set(start.current[end] + delta),
  )
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={seconds(value)}
      aria-orientation="horizontal"
      title={
        end === 'enter'
          ? 'Drag to change when it enters'
          : 'Drag to change when it leaves'
      }
      {...drag}
      onKeyDown={(event) => {
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          set(event.key === 'Home' ? min : max)
          return
        }
        const step = keyStep(event)
        if (step === null) return
        event.preventDefault()
        set(value + step)
      }}
      // Above the playhead, as the scenes' own edges are: it sits on a
      // scene's start, where every bar that enters at 0 begins.
      className={`group absolute top-0 z-30 flex h-full w-2.5 cursor-col-resize touch-none justify-center focus:outline-none ${
        end === 'enter' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'
      }`}
    >
      <span className="my-0.5 w-1 rounded-full bg-brand-cloud-blue/60 group-hover:bg-brand-cloud-blue group-focus-visible:bg-brand-cloud-blue group-focus-visible:ring-2 group-focus-visible:ring-brand-cloud-blue dark:bg-blue-400/60 dark:group-hover:bg-blue-400 dark:group-focus-visible:bg-blue-400" />
    </div>
  )
}

/**
 * An element's bar within its scene: it is on screen from one end to the
 * other. Drag an end to move it; drag the bar to move both at once.
 */
function ElementBar({
  sceneNumber,
  element,
  motion,
  duration,
  left,
  onChange,
}: {
  sceneNumber: number
  element: DrawnElement
  motion: ElementMotion
  duration: number
  /** The scene's start on the track, in pixels. */
  left: number
  onChange: (motion: ElementMotion) => void
}) {
  const start = useRef(motion)
  const body = useDrag(
    () => {
      start.current = motion
    },
    (delta) => {
      const { enter, leave } = start.current
      // Moved whole, never squeezed against the scene's ends.
      const shift = Math.min(Math.max(delta, -enter), duration - leave)
      const moved = clampMotion(
        { ...motion, enter: enter + shift, leave: leave + shift },
        duration,
      )
      if (moved.enter !== motion.enter || moved.leave !== motion.leave)
        onChange(moved)
    },
  )
  const width = (motion.leave - motion.enter) * PX_PER_SECOND
  const ramp = (preset: Preset) =>
    Math.min(PRESET_DURATION[preset] * PX_PER_SECOND, width / 2)
  const name = `Scene ${sceneNumber} ${element.name}`
  return (
    <div
      className="absolute top-0 h-full"
      style={{ left: left + motion.enter * PX_PER_SECOND, width }}
    >
      <div
        {...body}
        aria-hidden="true"
        title="Drag to move when it enters and leaves"
        className="relative flex size-full cursor-grab touch-none items-center overflow-hidden rounded border border-brand-cloud-blue/40 bg-brand-cloud-blue/15 px-1.5 text-[10px] leading-none font-medium whitespace-nowrap select-none active:cursor-grabbing dark:border-blue-400/40 dark:bg-blue-500/20"
      >
        {/* The entrance and exit, shaded over the time they take. */}
        {motion.entrance !== 'none' && (
          <span
            className="absolute inset-y-0 left-0 bg-linear-to-r from-brand-cloud-blue/40 to-transparent dark:from-blue-400/40"
            style={{ width: ramp(motion.entrance) }}
          />
        )}
        {motion.exit !== 'none' && (
          <span
            className="absolute inset-y-0 right-0 bg-linear-to-l from-brand-cloud-blue/40 to-transparent dark:from-blue-400/40"
            style={{ width: ramp(motion.exit) }}
          />
        )}
        <span className="relative truncate">{element.name}</span>
      </div>
      <BarEnd
        end="enter"
        label={`${name} enters`}
        motion={motion}
        duration={duration}
        onChange={onChange}
      />
      <BarEnd
        end="leave"
        label={`${name} leaves`}
        motion={motion}
        duration={duration}
        onChange={onChange}
      />
    </div>
  )
}

/** Under the scenes, one row per element and a bar per scene that draws it. */
export function ElementBars({
  scenes,
  onElementChange,
}: {
  scenes: Scene[]
  onElementChange: ElementChange
}) {
  const rows = rowsOf(scenes)
  return (
    <div role="group" aria-label="Element timings" className="mt-1 space-y-1">
      {rows.map((row) => (
        <div key={row.id} className="relative h-5">
          {scenes.map((scene, index) =>
            elementsOf(scene.design).some((e) => e.id === row.id) ? (
              <ElementBar
                key={scene.key}
                sceneNumber={index + 1}
                element={row}
                motion={motionFor(scene.motion, row.id, scene.duration)}
                duration={scene.duration}
                left={sceneStart(scenes, index) * PX_PER_SECOND}
                onChange={(motion) =>
                  onElementChange(index, row.id, motion, true)
                }
              />
            ) : null,
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * The scene being edited, element by element: each preset, and each end of
 * its bar as a number — everything the bars do, without a pointer.
 */
export function ElementFields({
  scene,
  index,
  onElementChange,
  onDriftChange,
}: {
  scene: Scene
  index: number
  onElementChange: ElementChange
  onDriftChange: (index: number, drift: boolean) => void
}) {
  const elements = elementsOf(scene.design)
  const { duration } = scene
  const hasImage = scene.design.background.image !== null
  return (
    <fieldset className="mt-4 min-w-0 border-t border-brand-frosted-steel pt-3 dark:border-gray-700">
      <legend className="sr-only">Scene {index + 1} animation</legend>
      <p aria-hidden="true" className="mb-2 text-xs font-semibold">
        Scene {index + 1} animation
      </p>
      <div className="overflow-x-auto">
        <table className="text-left text-xs">
          <thead>
            <tr className="text-brand-slate-gray/80 dark:text-gray-400">
              <th scope="col" className="py-1 pr-3 font-medium">
                Element
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                Entrance
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Enters (s)
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                Exit
              </th>
              <th scope="col" className="py-1 font-medium">
                Leaves (s)
              </th>
            </tr>
          </thead>
          <tbody>
            {elements.map((element) => {
              const motion = motionFor(scene.motion, element.id, duration)
              const change = (
                patch: Partial<ElementMotion>,
                grouped: boolean,
              ) =>
                onElementChange(
                  index,
                  element.id,
                  clampMotion({ ...motion, ...patch }, duration),
                  grouped,
                )
              const presetSelect = (which: 'entrance' | 'exit') => (
                <select
                  aria-label={`${element.name} ${which}`}
                  value={motion[which]}
                  onChange={(event) =>
                    change(
                      {
                        [which]:
                          PRESETS.find((p) => p === event.target.value) ??
                          'none',
                      },
                      false,
                    )
                  }
                  className={`${styles.input} w-28 min-w-28 py-1 text-xs`}
                >
                  {PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {PRESET_NAMES[preset]}
                    </option>
                  ))}
                </select>
              )
              return (
                // Keyed by scene too: a draft belongs to its scene's field.
                <tr key={`${scene.key}:${element.id}`}>
                  <th
                    scope="row"
                    className="py-1 pr-3 font-medium whitespace-nowrap"
                  >
                    {element.name}
                  </th>
                  <td className="py-1 pr-2">{presetSelect('entrance')}</td>
                  <td className="w-24 min-w-24 py-1 pr-3">
                    <SecondsField
                      hideLabel
                      label={`${element.name} enters (s)`}
                      value={motion.enter}
                      min={0}
                      max={motion.leave}
                      onCommit={(enter) =>
                        change({ enter: Math.min(enter, motion.leave) }, true)
                      }
                    />
                  </td>
                  <td className="py-1 pr-2">{presetSelect('exit')}</td>
                  <td className="w-24 min-w-24 py-1">
                    <SecondsField
                      hideLabel
                      label={`${element.name} leaves (s)`}
                      value={motion.leave}
                      min={motion.enter}
                      max={duration}
                      onCommit={(leave) => change({ leave }, true)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {hasImage && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={scene.motion.drift}
            onChange={(event) => onDriftChange(index, event.target.checked)}
            className="size-4 rounded border-brand-frosted-steel text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-700"
          />
          Drift: a slow zoom of the background image across the scene
        </label>
      )}
    </fieldset>
  )
}
