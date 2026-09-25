'use client'

import { useId, useRef, useState } from 'react'
import {
  ArrowPathIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
} from '@heroicons/react/24/solid'
import { styles } from './meme-generator-config'
import {
  MIN_SCENE_DURATION,
  TRANSITION_WINDOW,
  sceneStart,
  totalDuration,
  type Scene,
  type Transition,
} from './meme-generator-timeline'

/** The timeline is drawn to scale; sixty seconds scroll sideways. */
const PX_PER_SECOND = 60

const SMALL_STEP = 0.1
const LARGE_STEP = 1

interface VideoTimelineProps {
  scenes: Scene[]
  time: number
  /** The scene the editor's controls change. */
  editingIndex: number
  playing: boolean
  loop: boolean
  /** Off under reduced motion: the preview then never loops. */
  loopAllowed: boolean
  onSeek: (time: number) => void
  onDurationChange: (index: number, seconds: number) => void
  onTransitionChange: (index: number, transition: Transition) => void
  onAddScene: () => void
  onPlayToggle: () => void
  onLoopChange: (loop: boolean) => void
}

const seconds = (value: number) => `${value.toFixed(1)} s`

/**
 * The step an arrow key asks for, or null for any other key. Shift makes it a
 * whole second; Page Up and Page Down are always a whole second.
 */
function keyStep(event: React.KeyboardEvent): number | null {
  const step = event.shiftKey ? LARGE_STEP : SMALL_STEP
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return step
    case 'ArrowLeft':
    case 'ArrowDown':
      return -step
    case 'PageUp':
      return LARGE_STEP
    case 'PageDown':
      return -LARGE_STEP
    default:
      return null
  }
}

/**
 * Pointer handlers that report how far a drag has moved, in seconds, from
 * where it started. The pointer is captured, so a drag keeps going outside.
 */
function useDrag(
  onStart: (event: React.PointerEvent) => void,
  onMove: (deltaSeconds: number, event: React.PointerEvent) => void,
) {
  const origin = useRef<number | null>(null)
  return {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      origin.current = event.clientX
      onStart(event)
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (origin.current === null) return
      onMove((event.clientX - origin.current) / PX_PER_SECOND, event)
    },
    onPointerUp: () => {
      origin.current = null
    },
    onPointerCancel: () => {
      origin.current = null
    },
  }
}

/**
 * A number field that commits on Enter or when it loses focus — never
 * mid-typing, where "12" would first commit "1".
 */
function SecondsField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max?: number
  onCommit: (value: number) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const parsed = Number.parseFloat(draft ?? '')
    if (draft !== null && Number.isFinite(parsed)) onCommit(parsed)
    setDraft(null)
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={SMALL_STEP}
        min={min}
        max={max}
        value={draft ?? value.toFixed(1)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
        onBlur={commit}
        className={`${styles.input} w-24 py-1 text-sm tabular-nums`}
      />
    </div>
  )
}

function DurationEdge({
  scene,
  index,
  onDurationChange,
}: {
  scene: Scene
  index: number
  onDurationChange: (index: number, seconds: number) => void
}) {
  const startDuration = useRef(scene.duration)
  const drag = useDrag(
    () => {
      startDuration.current = scene.duration
    },
    (delta) => onDurationChange(index, startDuration.current + delta),
  )
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`Scene ${index + 1} length`}
      aria-valuemin={MIN_SCENE_DURATION}
      aria-valuenow={scene.duration}
      aria-valuetext={seconds(scene.duration)}
      aria-orientation="horizontal"
      title="Drag to change the scene's length"
      {...drag}
      onKeyDown={(event) => {
        const step = keyStep(event)
        if (step === null) return
        event.preventDefault()
        onDurationChange(index, scene.duration + step)
      }}
      className="group absolute top-0 right-0 z-10 flex h-full w-3 translate-x-1/2 cursor-col-resize touch-none justify-center focus:outline-none"
    >
      <span className="my-2 w-1 rounded-full bg-brand-slate-gray/40 group-hover:bg-brand-cloud-blue group-focus-visible:bg-brand-cloud-blue group-focus-visible:ring-2 group-focus-visible:ring-brand-cloud-blue dark:bg-gray-400/50 dark:group-hover:bg-blue-400 dark:group-focus-visible:bg-blue-400" />
    </div>
  )
}

export function VideoTimeline({
  scenes,
  time,
  editingIndex,
  playing,
  loop,
  loopAllowed,
  onSeek,
  onDurationChange,
  onTransitionChange,
  onAddScene,
  onPlayToggle,
  onLoopChange,
}: VideoTimelineProps) {
  const track = useRef<HTMLDivElement>(null)
  const total = totalDuration(scenes)
  const width = total * PX_PER_SECOND
  const editing = scenes[editingIndex]
  const isLast = editingIndex === scenes.length - 1

  // Measured against the track on every move, so a drag that scrolls the
  // timeline sideways keeps the playhead under the pointer.
  const timeAtPointer = (event: React.PointerEvent) => {
    const left = track.current?.getBoundingClientRect().left ?? 0
    return (event.clientX - left) / PX_PER_SECOND
  }
  const scrub = useDrag(
    (event) => onSeek(timeAtPointer(event)),
    (_delta, event) => onSeek(timeAtPointer(event)),
  )
  const transitionId = useId()

  const movePlayhead = (event: React.KeyboardEvent) => {
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onSeek(event.key === 'Home' ? 0 : total)
      return
    }
    const step = keyStep(event)
    if (step === null) return
    event.preventDefault()
    onSeek(time + step)
  }

  return (
    <section
      aria-label="Video timeline"
      className={`${styles.panel} mt-4 text-brand-slate-gray dark:text-gray-300`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPlayToggle}
          className="flex items-center gap-1.5 rounded-md bg-brand-cloud-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-cloud-blue/90 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          {playing ? (
            <PauseIcon className="size-4" aria-hidden="true" />
          ) : (
            <PlayIcon className="size-4" aria-hidden="true" />
          )}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          aria-pressed={loop && loopAllowed}
          disabled={!loopAllowed}
          onClick={() => onLoopChange(!loop)}
          title={
            loopAllowed
              ? 'Play the video again from the start'
              : 'Looping is off because your system asks for reduced motion'
          }
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            loop && loopAllowed ? styles.buttonActive : styles.buttonInactive
          }`}
        >
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          Loop
        </button>
        <span className="text-sm tabular-nums">
          {time.toFixed(1)} / {seconds(total)}
        </span>
        <button
          type="button"
          onClick={onAddScene}
          className={`ml-auto flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${styles.buttonInactive}`}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          Add scene
        </button>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          ref={track}
          className="relative mx-2"
          style={{ width, minWidth: width }}
        >
          {/* Ruler: press or drag anywhere on it to scrub. */}
          <div
            {...scrub}
            className="relative h-6 cursor-ew-resize touch-none border-b border-brand-frosted-steel select-none dark:border-gray-600"
          >
            {Array.from({ length: Math.floor(total) + 1 }, (_, second) => (
              <span
                key={second}
                className="absolute bottom-0 h-2 border-l border-brand-frosted-steel dark:border-gray-600"
                style={{ left: second * PX_PER_SECOND }}
              >
                <span className="absolute -top-4 left-1 text-[10px] tabular-nums">
                  {second}s
                </span>
              </span>
            ))}
          </div>

          <ol className="relative mt-1 flex h-14" aria-label="Scenes">
            {scenes.map((scene, index) => {
              const start = sceneStart(scenes, index)
              const active = index === editingIndex
              return (
                <li
                  key={scene.key}
                  className="relative h-full shrink-0"
                  style={{ width: scene.duration * PX_PER_SECOND }}
                >
                  <button
                    type="button"
                    onClick={() => onSeek(start)}
                    onKeyDown={movePlayhead}
                    aria-current={active || undefined}
                    aria-label={`Scene ${index + 1}, ${seconds(scene.duration)}`}
                    className={`flex size-full flex-col items-start justify-center gap-0.5 overflow-hidden rounded-md border-2 px-2 text-left text-xs ${
                      active
                        ? 'border-brand-cloud-blue bg-brand-cloud-blue/10 dark:border-blue-400 dark:bg-blue-500/20'
                        : 'border-brand-frosted-steel bg-gray-50 hover:border-brand-cloud-blue/50 dark:border-gray-600 dark:bg-gray-700/60'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-semibold whitespace-nowrap">
                      <span
                        aria-hidden="true"
                        className="size-3 shrink-0 rounded-sm border border-black/10 dark:border-white/20"
                        style={{
                          backgroundColor: scene.design.background.color,
                        }}
                      />
                      Scene {index + 1}
                    </span>
                    <span className="tabular-nums">
                      {seconds(scene.duration)}
                    </span>
                  </button>
                  {scene.transition === 'fade' && index < scenes.length - 1 && (
                    <span
                      aria-hidden="true"
                      title="Fade"
                      className="pointer-events-none absolute bottom-1 z-10 h-2 -translate-x-1/2 rounded-full bg-linear-to-r from-brand-cloud-blue/10 via-brand-cloud-blue to-brand-cloud-blue/10 dark:via-blue-400"
                      style={{
                        left: scene.duration * PX_PER_SECOND,
                        width: TRANSITION_WINDOW * PX_PER_SECOND,
                      }}
                    />
                  )}
                  <DurationEdge
                    scene={scene}
                    index={index}
                    onDurationChange={onDurationChange}
                  />
                </li>
              )
            })}
          </ol>

          {/* The playhead spans the ruler and the scenes. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Playhead"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Number(time.toFixed(2))}
            aria-valuetext={seconds(time)}
            onKeyDown={movePlayhead}
            {...scrub}
            className="group absolute top-0 bottom-0 z-20 w-4 -translate-x-1/2 cursor-ew-resize touch-none focus:outline-none"
            style={{ left: time * PX_PER_SECOND }}
          >
            <span className="absolute top-0 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-sm bg-red-500 group-focus-visible:ring-2 group-focus-visible:ring-brand-cloud-blue group-focus-visible:ring-offset-1 dark:group-focus-visible:ring-blue-400" />
            <span className="absolute top-1 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-red-500" />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <SecondsField
          label="Playhead (s)"
          value={time}
          min={0}
          max={total}
          onCommit={onSeek}
        />
        <SecondsField
          label={`Scene ${editingIndex + 1} length (s)`}
          value={editing.duration}
          min={MIN_SCENE_DURATION}
          onCommit={(value) => onDurationChange(editingIndex, value)}
        />
        {!isLast && (
          <div>
            <label
              htmlFor={transitionId}
              className="mb-1 block text-xs font-medium"
            >
              Into scene {editingIndex + 2}
            </label>
            <select
              id={transitionId}
              value={editing.transition}
              onChange={(event) =>
                onTransitionChange(
                  editingIndex,
                  event.target.value === 'fade' ? 'fade' : 'cut',
                )
              }
              className={`${styles.input} py-1 text-sm`}
            >
              <option value="cut">Cut</option>
              <option value="fade">Fade</option>
            </select>
          </div>
        )}
      </div>
    </section>
  )
}
