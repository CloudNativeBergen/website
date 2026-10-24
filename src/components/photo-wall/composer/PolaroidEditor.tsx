'use client'

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  describeCrop,
  dragCrop,
  objectPosition,
  type Crop,
} from '@/lib/photo-wall/crop'
import type { WallFilterKey } from '@/lib/photo-wall/filters'
import { PREVIEW_LONG_EDGE, filteredCopy } from '@/lib/photo-wall/photo'
import type { Size } from '@/lib/photo-wall/resize'
import { CAPTION_MAX, NAME_MAX, limitWallText } from '@/lib/photo-wall/text'

/** One arrow key moves the window by this much of the frame. */
const KEY_STEP_CSS_PX = 24

const FIELD_FOCUS =
  'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue'

/**
 * The square photo window (Photo Wall spec §6.5): a canvas showing the
 * filtered preview copy, cropped by CSS to the short-edge square the crop
 * places. Dragging pans it 1:1; arrow keys pan it from the keyboard, with
 * the position read out. The preview is redrawn only when the photo or the
 * filter changes; a drag is CSS alone.
 */
export function PhotoWindow({
  master,
  filter,
  crop,
  onCrop,
}: {
  master: HTMLCanvasElement
  filter: WallFilterKey
  crop: Crop
  onCrop: (crop: Crop) => void
}) {
  const frame = useRef<HTMLButtonElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null)
  const hintId = useId()

  useEffect(() => {
    if (canvas.current) {
      filteredCopy(master, filter, PREVIEW_LONG_EDGE, canvas.current)
    }
  }, [master, filter])

  const photo: Size = { width: master.width, height: master.height }
  const frameWidth = () => frame.current?.getBoundingClientRect().width ?? 1

  const down = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, crop }
  }
  const move = (e: ReactPointerEvent) => {
    const start = drag.current
    if (!start) return
    onCrop(
      dragCrop(
        start.crop,
        { dx: e.clientX - start.x, dy: e.clientY - start.y },
        frameWidth(),
        photo,
      ),
    )
  }
  const up = () => {
    drag.current = null
  }
  const key = (e: KeyboardEvent) => {
    const step: Record<string, { dx: number; dy: number }> = {
      ArrowLeft: { dx: KEY_STEP_CSS_PX, dy: 0 },
      ArrowRight: { dx: -KEY_STEP_CSS_PX, dy: 0 },
      ArrowUp: { dx: 0, dy: KEY_STEP_CSS_PX },
      ArrowDown: { dx: 0, dy: -KEY_STEP_CSS_PX },
    }
    const delta = step[e.key]
    if (!delta) return
    e.preventDefault()
    onCrop(dragCrop(crop, delta, frameWidth(), photo))
  }

  return (
    <>
      {/* A button: focusable and interactive by role, with "crop" as what it
          is. Enter and Space do nothing; the arrows and the pointer pan. */}
      <button
        ref={frame}
        type="button"
        aria-roledescription="crop"
        aria-label="Photo position"
        aria-describedby={hintId}
        className="relative block aspect-square w-full cursor-grab touch-none overflow-hidden bg-gray-200 p-0 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue active:cursor-grabbing"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
      >
        <canvas
          ref={canvas}
          data-testid="photo-preview"
          className="pointer-events-none block size-full object-cover"
          style={{ objectPosition: objectPosition(crop) }}
        />
      </button>
      <p id={hintId} className="sr-only">
        Drag the photo, or use the arrow keys, to choose which part of it shows.
      </p>
      <p
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-testid="crop-readout"
      >
        Showing {describeCrop(crop)}
      </p>
    </>
  )
}

export interface PolaroidEditorProps {
  master: HTMLCanvasElement
  filter: WallFilterKey
  crop: Crop
  caption: string
  name: string
  onCrop: (crop: Crop) => void
  onCaption: (caption: string) => void
  onName: (name: string) => void
}

/**
 * The polaroid card as the editor (Photo Wall spec §6.5): the photo window,
 * the caption in the card's handwritten strip and the optional name under it,
 * in Caveat. The card is a white print whatever the page's theme, as on the
 * wall. Both fields are cut as you type where their normalised text reaches
 * the limit in code points.
 */
export function PolaroidEditor({
  master,
  filter,
  crop,
  caption,
  name,
  onCrop,
  onCaption,
  onName,
}: PolaroidEditorProps) {
  const nameField = useRef<HTMLInputElement>(null)
  return (
    <figure className="bg-white p-3 pb-2 text-gray-900 shadow-lg ring-1 ring-black/5">
      <PhotoWindow
        master={master}
        filter={filter}
        crop={crop}
        onCrop={onCrop}
      />
      <figcaption className="font-caveat">
        <textarea
          value={caption}
          onChange={(e) =>
            onCaption(limitWallText(e.target.value, CAPTION_MAX))
          }
          // One line on the wall: Enter moves on to the name instead of
          // breaking the line (a newline would become a space anyway, §6.4).
          // Not while an IME is composing: that Enter confirms a candidate
          // (Safari reports it as keyCode 229 rather than isComposing).
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault()
              nameField.current?.focus()
            }
          }}
          rows={2}
          placeholder="Write something…"
          aria-label="Caption"
          autoComplete="off"
          enterKeyHint="next"
          className={`mt-2 block w-full resize-none bg-transparent text-2xl leading-tight font-medium placeholder:text-gray-400 ${FIELD_FOCUS}`}
        />
        <input
          ref={nameField}
          type="text"
          value={name}
          onChange={(e) => onName(limitWallText(e.target.value, NAME_MAX))}
          placeholder="— your name (optional)"
          aria-label="Your name (optional)"
          autoComplete="name"
          enterKeyHint="done"
          className={`w-full bg-transparent text-right text-xl font-medium text-gray-500 placeholder:text-gray-400 ${FIELD_FOCUS}`}
        />
      </figcaption>
    </figure>
  )
}
