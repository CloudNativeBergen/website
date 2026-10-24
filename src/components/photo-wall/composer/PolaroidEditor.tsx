'use client'

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { dragCrop, type Crop } from '@/lib/photo-wall/crop'
import type { WallFilterKey } from '@/lib/photo-wall/filters'
import { PREVIEW_LONG_EDGE, filteredCopy } from '@/lib/photo-wall/photo'
import { CAPTION_MAX, NAME_MAX, limitCodePoints } from '@/lib/photo-wall/text'

/** The crop as CSS `object-position`, which is the same 0–1 mapping. */
export const objectPosition = (crop: Crop) =>
  `${crop.x * 100}% ${crop.y * 100}%`

/** One arrow key moves the window by this much of the frame. */
const KEY_STEP_CSS_PX = 24

/**
 * The square photo window (Photo Wall spec §6.5): a canvas showing the
 * filtered preview copy, cropped by CSS to the short-edge square the crop
 * places. Dragging pans it 1:1; arrow keys pan it from the keyboard. The
 * preview is redrawn only when the photo or the filter changes; a drag is
 * CSS alone.
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
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null)

  useEffect(() => {
    if (canvas.current) {
      filteredCopy(master, filter, PREVIEW_LONG_EDGE, canvas.current)
    }
  }, [master, filter])

  const photo = { width: master.width, height: master.height }
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
    <div
      ref={frame}
      role="img"
      aria-label="Your photo. Drag it, or use the arrow keys, to choose which part shows."
      tabIndex={0}
      className="relative aspect-square cursor-grab touch-none overflow-hidden bg-gray-200 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue active:cursor-grabbing dark:focus-visible:outline-indigo-400"
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
    </div>
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
 * wall. Both fields are cut at their limits in code points as you type.
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
  return (
    <figure className="bg-white p-3 pb-2 text-gray-900 shadow-lg ring-1 ring-black/5">
      <PhotoWindow
        master={master}
        filter={filter}
        crop={crop}
        onCrop={onCrop}
      />
      <figcaption className="font-caveat">
        <input
          type="text"
          value={caption}
          onChange={(e) =>
            onCaption(limitCodePoints(e.target.value, CAPTION_MAX))
          }
          placeholder="Write something…"
          aria-label="Caption"
          autoComplete="off"
          enterKeyHint="done"
          className="mt-2 w-full bg-transparent text-2xl leading-tight font-medium outline-none placeholder:text-gray-400"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => onName(limitCodePoints(e.target.value, NAME_MAX))}
          placeholder="— your name (optional)"
          aria-label="Your name (optional)"
          autoComplete="name"
          enterKeyHint="done"
          className="w-full bg-transparent text-right text-xl font-medium text-gray-500 outline-none placeholder:text-gray-400"
        />
      </figcaption>
    </figure>
  )
}
