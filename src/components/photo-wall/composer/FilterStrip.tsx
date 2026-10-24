'use client'

import { useEffect, useRef } from 'react'
import type { Crop } from '@/lib/photo-wall/crop'
import { WALL_FILTERS, type WallFilterKey } from '@/lib/photo-wall/filters'
import { THUMBNAIL_LONG_EDGE, filteredCopy } from '@/lib/photo-wall/photo'
import { objectPosition } from './PolaroidEditor'

function Thumbnail({
  master,
  filter,
  crop,
}: {
  master: HTMLCanvasElement
  filter: WallFilterKey
  crop: Crop
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvas.current) {
      filteredCopy(master, filter, THUMBNAIL_LONG_EDGE, canvas.current)
    }
  }, [master, filter])
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="size-16 rounded-lg object-cover"
      style={{ objectPosition: objectPosition(crop) }}
    />
  )
}

/**
 * The filter strip (Photo Wall spec §6.5): the nine filters as a radio group,
 * each a thumbnail of this photo through that filter, run by the same code
 * that bakes the upload. Native radios carry the semantics; the thumbnails
 * follow the crop so they show the part of the photo the card shows.
 */
export function FilterStrip({
  master,
  crop,
  value,
  onChange,
}: {
  master: HTMLCanvasElement
  crop: Crop
  value: WallFilterKey
  onChange: (filter: WallFilterKey) => void
}) {
  return (
    <fieldset className="-mx-4 min-w-0">
      <legend className="sr-only">Filter</legend>
      <div className="flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 pt-1 pb-2">
        {WALL_FILTERS.map((f) => {
          const on = f.key === value
          return (
            <label
              key={f.key}
              className="flex shrink-0 cursor-pointer flex-col items-center gap-1"
            >
              <input
                type="radio"
                name="wall-filter"
                value={f.key}
                checked={on}
                onChange={() => onChange(f.key)}
                className="peer sr-only"
              />
              <span
                className={`block rounded-lg ring-2 ring-offset-2 ring-offset-white peer-focus-visible:ring-4 dark:ring-offset-gray-950 ${on ? 'ring-brand-cloud-blue dark:ring-indigo-400' : 'ring-transparent'}`}
              >
                <Thumbnail master={master} filter={f.key} crop={crop} />
              </span>
              <span
                className={`text-xs ${on ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
              >
                {f.label}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
