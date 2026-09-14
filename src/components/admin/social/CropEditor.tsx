'use client'

import { useRef, useState } from 'react'
import { AdminButton } from '@/components/admin/AdminButton'
import {
  defaultCropRect,
  isValidRect,
  type ImageAsset,
  type NormalizedRect,
} from '@/lib/social/rendition'

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max)

/**
 * Per-variant crop override for a fixed platform aspect: drag the window
 * over the source, zoom it in with the slider, or go back to the platform
 * default (hotspot-centred). Works in normalized coordinates so the result
 * is exactly what `renditionUrl` sends.
 */
export function CropEditor({
  asset,
  src,
  aspectRatio,
  value,
  onChange,
}: {
  asset: ImageAsset
  src: string
  aspectRatio: number
  /** The override; `null` = platform default. */
  value: NormalizedRect | null
  onChange: (rect: NormalizedRect | null) => void
}) {
  const fallback = defaultCropRect(asset, aspectRatio)
  const rect = isValidRect(value) ? value : fallback
  const frameRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{
    startX: number
    startY: number
    origin: NormalizedRect
  } | null>(null)

  // The window's size is fixed by the aspect; zoom scales it down from the
  // default (which is the largest window that fits).
  const zoom = clamp(fallback.width / rect.width, 1, 3)

  const move = (dx: number, dy: number, origin: NormalizedRect) => {
    onChange({
      ...origin,
      x: clamp(origin.x + dx, 0, 1 - origin.width),
      y: clamp(origin.y + dy, 0, 1 - origin.height),
    })
  }

  const setZoom = (next: number) => {
    const width = fallback.width / next
    const height = fallback.height / next
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    onChange({
      x: clamp(cx - width / 2, 0, 1 - width),
      y: clamp(cy - height / 2, 0, 1 - height),
      width,
      height,
    })
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ startX: e.clientX, startY: e.clientY, origin: rect })
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !frameRef.current) return
    const box = frameRef.current.getBoundingClientRect()
    move(
      (e.clientX - drag.startX) / box.width,
      (e.clientY - drag.startY) / box.height,
      drag.origin,
    )
  }
  const onPointerUp = () => setDrag(null)

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 0.02
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const delta = keys[e.key]
    if (!delta) return
    e.preventDefault()
    move(delta[0], delta[1], rect)
  }

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        role="slider"
        aria-label="Crop position. Drag or use the arrow keys."
        aria-valuetext={`${Math.round(rect.x * 100)}% from the left, ${Math.round(rect.y * 100)}% from the top`}
        aria-valuenow={Math.round(rect.x * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative mx-auto cursor-move touch-none overflow-hidden rounded-lg bg-gray-900 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue"
        style={{
          aspectRatio: `${asset.width} / ${asset.height}`,
          // Never taller than ~20rem; the width follows the source aspect.
          width: `min(100%, calc(20rem * ${asset.width / asset.height}))`,
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-fill opacity-40"
        />
        <div
          aria-hidden
          className="absolute overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] ring-2 ring-white"
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.width * 100}%`,
            height: `${rect.height * 100}%`,
          }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{
              width: `${100 / rect.width}%`,
              height: `${100 / rect.height}%`,
              left: `${(-rect.x / rect.width) * 100}%`,
              top: `${(-rect.y / rect.height) * 100}%`,
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-1 items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </label>
        <AdminButton
          type="button"
          size="xs"
          variant="secondary"
          disabled={value === null}
          onClick={() => onChange(null)}
        >
          Platform default
        </AdminButton>
      </div>
    </div>
  )
}
