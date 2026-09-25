'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  DocumentDuplicateIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid'
import { styles } from './meme-generator-config'
import {
  MIN_SCENE_DURATION,
  clampDuration,
  dropIndex,
  maxSceneDuration,
  TRANSITION_WINDOW,
  TRANSITIONS,
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
  onDuplicateScene: (index: number) => void
  onDeleteScene: (index: number) => void
  onMoveScene: (from: number, to: number) => void
  /** Why the last add, copy or delete was refused, if it was. */
  refusal: string | null
  onPlayToggle: () => void
  onLoopChange: (loop: boolean) => void
}

const seconds = (value: number) => `${value.toFixed(1)} s`

const TRANSITION_NAMES: Record<Transition, string> = {
  cut: 'Cut',
  fade: 'Fade',
  slide: 'Slide',
  zoom: 'Zoom',
}

/** How far a scene has to be dragged before it is a move and not a click. */
const DRAG_THRESHOLD_PX = 6

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
      // No text selection while dragging — but a slider still takes focus,
      // so the arrow keys carry on where the pointer left off.
      event.preventDefault()
      if (event.currentTarget.tabIndex >= 0) event.currentTarget.focus()
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
 * A seconds field that commits on Enter or when it loses focus — never
 * mid-typing, where "12" would first commit "1". A text field, not a number
 * one: a number input silently empties itself on "3,0", and a decimal comma
 * is what half of Europe types.
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
    const parsed = Number.parseFloat((draft ?? '').replace(',', '.'))
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
        type="text"
        inputMode="decimal"
        aria-description={
          max === undefined
            ? `At least ${min} seconds`
            : `From ${min} to ${max.toFixed(1)} seconds`
        }
        value={draft ?? value.toFixed(1)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
        onBlur={commit}
        // Its draft is its own: the editor's undo shortcut leaves it alone.
        data-own-undo=""
        className={`${styles.input} w-24 py-1 text-sm tabular-nums`}
      />
    </div>
  )
}

function DurationEdge({
  scene,
  index,
  max,
  onDurationChange,
}: {
  scene: Scene
  index: number
  /** What the other scenes leave of the minute. */
  max: number
  onDurationChange: (index: number, seconds: number) => void
}) {
  const startDuration = useRef(scene.duration)
  // A handle resized by keyboard is kept in view — End alone can carry it
  // from 180 px to 3600 px along a narrow, scrolling track.
  const edge = useRef<HTMLDivElement>(null)
  const resizedByKey = useRef(false)
  useEffect(() => {
    if (!resizedByKey.current) return
    resizedByKey.current = false
    edge.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [scene.duration])
  const resizeByKey = (seconds: number) => {
    // Only a key that changes the length asks: one pressed against a limit
    // changes nothing, and the request would wait for an unrelated resize.
    if (Math.min(clampDuration(seconds), max) === scene.duration) return
    resizedByKey.current = true
    onDurationChange(index, seconds)
  }
  const drag = useDrag(
    () => {
      startDuration.current = scene.duration
    },
    (delta) => onDurationChange(index, startDuration.current + delta),
  )
  return (
    <div
      ref={edge}
      role="slider"
      tabIndex={0}
      aria-label={`Scene ${index + 1} length`}
      aria-valuemin={MIN_SCENE_DURATION}
      aria-valuemax={max}
      aria-valuenow={scene.duration}
      aria-valuetext={seconds(scene.duration)}
      aria-orientation="horizontal"
      title="Drag to change the scene's length"
      {...drag}
      onKeyDown={(event) => {
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          resizeByKey(event.key === 'Home' ? MIN_SCENE_DURATION : max)
          return
        }
        const step = keyStep(event)
        if (step === null) return
        event.preventDefault()
        resizeByKey(scene.duration + step)
      }}
      // Above the playhead, which sits exactly on a boundary after a scene is
      // picked or playback ends; there it would take every press meant for
      // the edge.
      className="group absolute top-0 right-0 z-30 flex h-full w-3 translate-x-1/2 cursor-col-resize touch-none justify-center focus:outline-none"
    >
      <span className="my-2 w-1 rounded-full bg-brand-slate-gray/40 group-hover:bg-brand-cloud-blue group-focus-visible:bg-brand-cloud-blue group-focus-visible:ring-2 group-focus-visible:ring-brand-cloud-blue dark:bg-gray-400/50 dark:group-hover:bg-blue-400 dark:group-focus-visible:bg-blue-400" />
    </div>
  )
}

/**
 * One scene on the track. A click puts the playhead at its start; the arrows
 * move the playhead; Alt with an arrow, or a drag, moves the scene itself.
 */
function SceneItem({
  scenes,
  index,
  active,
  onSeek,
  onMove,
  onPlayheadKey,
  onDurationChange,
}: {
  scenes: Scene[]
  index: number
  active: boolean
  onSeek: (time: number) => void
  onMove: (from: number, to: number) => void
  onPlayheadKey: (event: React.KeyboardEvent) => void
  onDurationChange: (index: number, seconds: number) => void
}) {
  const scene = scenes[index]
  const start = sceneStart(scenes, index)
  const isLast = index === scenes.length - 1
  // Pixels the scene has been dragged, once past the threshold; a drag that
  // never gets there is a click.
  const [dragged, setDragged] = useState<number | null>(null)
  const origin = useRef<number | null>(null)
  const swallowClick = useRef(false)
  const endDrag = () => {
    origin.current = null
    setDragged(null)
  }
  return (
    <li
      className={`relative h-full shrink-0 ${dragged !== null ? 'z-40 opacity-80' : ''}`}
      style={{
        width: scene.duration * PX_PER_SECOND,
        transform: dragged !== null ? `translateX(${dragged}px)` : undefined,
      }}
    >
      <button
        type="button"
        data-scene-key={scene.key}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          onSeek(start)
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture?.(event.pointerId)
          origin.current = event.clientX
          swallowClick.current = false
        }}
        onPointerMove={(event) => {
          if (origin.current === null) return
          const dx = event.clientX - origin.current
          if (dragged === null && Math.abs(dx) < DRAG_THRESHOLD_PX) return
          setDragged(dx)
        }}
        onPointerUp={() => {
          if (dragged !== null) {
            swallowClick.current = true
            const centre = start + scene.duration / 2 + dragged / PX_PER_SECOND
            onMove(index, dropIndex(scenes, index, centre))
          }
          endDrag()
        }}
        onPointerCancel={endDrag}
        onKeyDown={(event) => {
          if (
            event.altKey &&
            (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          ) {
            event.preventDefault()
            onMove(index, index + (event.key === 'ArrowLeft' ? -1 : 1))
            return
          }
          if (keyStep(event) === null && !/^(Home|End)$/.test(event.key)) return
          onPlayheadKey(event)
        }}
        aria-current={active || undefined}
        aria-label={`Scene ${index + 1}, ${seconds(scene.duration)}`}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        aria-roledescription="movable scene"
        title="Drag, or Alt with an arrow key, to move the scene"
        className={`flex size-full cursor-grab touch-none flex-col items-start justify-center gap-0.5 overflow-hidden rounded-md border-2 px-2 text-left text-xs select-none active:cursor-grabbing ${
          active
            ? 'border-brand-cloud-blue bg-brand-cloud-blue/10 dark:border-blue-400 dark:bg-blue-500/20'
            : 'border-brand-frosted-steel bg-gray-50 hover:border-brand-cloud-blue/50 dark:border-gray-600 dark:bg-gray-700/60'
        }`}
      >
        <span className="flex items-center gap-1.5 font-semibold whitespace-nowrap">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-sm border border-black/10 dark:border-white/20"
            style={{ backgroundColor: scene.design.background.color }}
          />
          Scene {index + 1}
        </span>
        <span className="tabular-nums">{seconds(scene.duration)}</span>
      </button>
      {scene.transition !== 'cut' && !isLast && (
        <span
          aria-hidden="true"
          title={TRANSITION_NAMES[scene.transition]}
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
        max={maxSceneDuration(scenes, index)}
        onDurationChange={onDurationChange}
      />
    </li>
  )
}

function SceneAction({
  label,
  icon: Icon,
  text,
  disabled,
  refused,
  describedBy,
  onClick,
}: {
  label: string
  icon: React.ElementType
  /** Shown beside the icon; without it the button is the icon alone. */
  text?: string
  disabled?: boolean
  refused?: boolean
  describedBy?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={refused || undefined}
      aria-label={label}
      aria-describedby={describedBy}
      title={label}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${styles.buttonInactive}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {text}
    </button>
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
  onDuplicateScene,
  onDeleteScene,
  onMoveScene,
  refusal,
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
  const loopHintId = useId()
  const refusalId = useId()

  // A scene moved keeps focus: React moves its element, and a moved element
  // loses focus in the browser, so it is given back once the list has
  // settled — a keyboard user presses Alt+→ again and it goes on moving.
  const list = useRef<HTMLOListElement>(null)
  const refocus = useRef<string | null>(null)
  const moveScene = (from: number, to: number) => {
    if (to < 0 || to >= scenes.length || to === from) return
    if (list.current?.contains(document.activeElement))
      refocus.current = scenes[from].key
    onMoveScene(from, to)
  }
  useEffect(() => {
    const key = refocus.current
    if (key === null) return
    refocus.current = null
    const button = list.current?.querySelector<HTMLElement>(
      `[data-scene-key="${key}"]`,
    )
    button?.focus()
    button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [scenes])

  // A playhead moved by KEYBOARD is kept in view: on a narrow screen it
  // would otherwise walk out of the scrolling track with focus still on it.
  // Only then — following it on every frame of playback would pull the page
  // back to it while the author scrolls to the controls.
  const playhead = useRef<HTMLDivElement>(null)
  const movedByKey = useRef(false)
  // A scene just added is where the playhead went; on a narrow track that
  // is past the right edge, so it is brought into view.
  const sceneCount = useRef(scenes.length)
  useEffect(() => {
    const added = scenes.length > sceneCount.current
    sceneCount.current = scenes.length
    if (added) {
      playhead.current?.scrollIntoView?.({
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }, [scenes.length])
  useEffect(() => {
    if (!movedByKey.current) return
    movedByKey.current = false
    playhead.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [time])

  const movePlayhead = (event: React.KeyboardEvent) => {
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? total
          : // In tenths, as the scene boundaries are: 0.1 added eleven times
            // is 1.0999999999999999, a hair short of a 1.1 s boundary.
            Math.round((time + (keyStep(event) ?? Number.NaN)) * 10) / 10
    if (Number.isNaN(target)) return
    event.preventDefault()
    // Only a move that lands somewhere new asks to be kept in view: a key
    // pressed against an end changes nothing, so no render would consume the
    // request and it would fire on the next frame of playback instead.
    const clamped = Math.min(Math.max(target, 0), total)
    if (clamped === time) return
    movedByKey.current = true
    onSeek(clamped)
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
          // Not `disabled`: a disabled button cannot be focused, and then the
          // reason it does nothing never reaches a keyboard or screen reader.
          aria-disabled={!loopAllowed || undefined}
          aria-describedby={loopAllowed ? undefined : loopHintId}
          onClick={() => loopAllowed && onLoopChange(!loop)}
          title={
            loopAllowed ? 'Play the video again from the start' : undefined
          }
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${
            loop && loopAllowed ? styles.buttonActive : styles.buttonInactive
          }`}
        >
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          Loop
        </button>
        {!loopAllowed && (
          <span id={loopHintId} className="sr-only">
            Looping is off because your system asks for reduced motion.
          </span>
        )}
        <span className="text-sm tabular-nums">
          {time.toFixed(1)} / {seconds(total)}
        </span>
        <button
          type="button"
          onClick={onAddScene}
          aria-describedby={refusal ? refusalId : undefined}
          className={`ml-auto flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${styles.buttonInactive}`}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          Add scene
        </button>
      </div>
      {/* Always in the page, so a refusal is announced when it appears. */}
      <p
        id={refusalId}
        role="status"
        className="mb-3 text-sm text-amber-700 empty:hidden dark:text-amber-400"
      >
        {refusal}
      </p>

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

          <ol
            ref={list}
            className="relative mt-1 flex h-14"
            aria-label="Scenes"
          >
            {scenes.map((scene, index) => (
              <SceneItem
                key={scene.key}
                scenes={scenes}
                index={index}
                active={index === editingIndex}
                onSeek={onSeek}
                onMove={moveScene}
                onPlayheadKey={(event) => {
                  // The arrows move the playhead; focus goes with it, so
                  // the change is announced and the next key continues.
                  playhead.current?.focus()
                  movePlayhead(event)
                }}
                onDurationChange={onDurationChange}
              />
            ))}
          </ol>

          {/* The playhead spans the ruler and the scenes. */}
          <div
            ref={playhead}
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
          // A draft belongs to its scene: when playback ends and the panel
          // moves to another scene, an uncommitted length is dropped rather
          // than applied to the wrong one.
          key={editing.key}
          label={`Scene ${editingIndex + 1} length (s)`}
          value={editing.duration}
          min={MIN_SCENE_DURATION}
          max={maxSceneDuration(scenes, editingIndex)}
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
                  TRANSITIONS.find((t) => t === event.target.value) ?? 'cut',
                )
              }
              className={`${styles.input} py-1 text-sm`}
            >
              {TRANSITIONS.map((transition) => (
                <option key={transition} value={transition}>
                  {TRANSITION_NAMES[transition]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div
          role="group"
          aria-label={`Scene ${editingIndex + 1}`}
          className="ml-auto flex flex-wrap gap-1"
        >
          <SceneAction
            label={`Move scene ${editingIndex + 1} earlier`}
            icon={ArrowLeftIcon}
            disabled={editingIndex === 0}
            onClick={() => onMoveScene(editingIndex, editingIndex - 1)}
          />
          <SceneAction
            label={`Move scene ${editingIndex + 1} later`}
            icon={ArrowRightIcon}
            disabled={isLast}
            onClick={() => onMoveScene(editingIndex, editingIndex + 1)}
          />
          <SceneAction
            label={`Duplicate scene ${editingIndex + 1}`}
            icon={DocumentDuplicateIcon}
            text="Duplicate"
            describedBy={refusal ? refusalId : undefined}
            onClick={() => onDuplicateScene(editingIndex)}
          />
          <SceneAction
            label={`Delete scene ${editingIndex + 1}`}
            icon={TrashIcon}
            text="Delete"
            // Not `disabled`: it stays focusable, and a press says why.
            refused={scenes.length === 1}
            describedBy={refusal ? refusalId : undefined}
            onClick={() => onDeleteScene(editingIndex)}
          />
        </div>
      </div>
    </section>
  )
}
