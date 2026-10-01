'use client'

import { ChevronUpDownIcon, ClockIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import type { GalleryEditions } from '@/lib/gallery/editions'

interface EditionSelectProps {
  /** As `gallery.admin.editions` returns them; `undefined` while loading. */
  editions: GalleryEditions | undefined
  /** The selected previous edition's id; `undefined` is the current edition. */
  value: string | undefined
  onChange: (edition: string | undefined) => void
  id?: string
  className?: string
  disabled?: boolean
}

/**
 * The edition filter for gallery surfaces (#1191): the current conference
 * (default) or one of the organization's previous editions, as the SERVER
 * lists them. Renders nothing for an organization with a single edition — the
 * filter has no second option to offer, so it does not take up space.
 */
export function EditionSelect({
  editions,
  value,
  onChange,
  id = 'gallery-edition',
  className,
  disabled,
}: EditionSelectProps) {
  if (!editions || editions.previous.length === 0) return null
  const current = editions.current
  return (
    <div className={clsx('relative', className)}>
      <ClockIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-gray-400" />
      <select
        id={id}
        value={value ?? current._id}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === current._id ? undefined : e.target.value)
        }
        className="h-11 w-full appearance-none rounded-md border border-gray-300 py-1.5 pr-8 pl-8 text-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none disabled:opacity-50 lg:h-9 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        aria-label="Edition"
      >
        <option value={current._id}>
          {current.title || 'This edition'} (current)
        </option>
        {editions.previous.map((edition) => (
          <option key={edition._id} value={edition._id}>
            {edition.title}
          </option>
        ))}
      </select>
      <ChevronUpDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-gray-400" />
    </div>
  )
}
