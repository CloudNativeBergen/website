'use client'

import { useId, useRef, useState } from 'react'
import { styles } from './meme-generator-config'

/** The timeline is drawn to scale; sixty seconds scroll sideways. */
export const PX_PER_SECOND = 60

const SMALL_STEP = 0.1
const LARGE_STEP = 1

export const seconds = (value: number) => `${value.toFixed(1)} s`

/**
 * The step an arrow key asks for, or null for any other key. Shift makes it a
 * whole second; Page Up and Page Down are always a whole second.
 */
export function keyStep(event: React.KeyboardEvent): number | null {
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
export function useDrag(
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
export function SecondsField({
  label,
  value,
  min,
  max,
  onCommit,
  hideLabel = false,
}: {
  label: string
  value: number
  min: number
  max?: number
  onCommit: (value: number) => void
  /** For a field in a table whose column header already says what it is. */
  hideLabel?: boolean
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
      <label
        htmlFor={id}
        className={hideLabel ? 'sr-only' : 'mb-1 block text-xs font-medium'}
      >
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
