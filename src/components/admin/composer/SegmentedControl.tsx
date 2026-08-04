'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Spoken label, when {@link label} is an icon or an abbreviation. */
  srLabel?: string
  title?: string
}

/**
 * The workspace's one toggle shape — used for Compose/Preview, Desktop/Mobile,
 * light/dark and Design/Live.
 *
 * Buttons with `aria-pressed` rather than a radio group: these switch what the
 * TOOL is showing, not what will be saved, and screen-reader users should hear
 * "Design mode, pressed" rather than a form control implying the choice is part
 * of the composition.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className,
}: {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.srLabel}
            title={option.title ?? option.srLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
              size === 'sm'
                ? 'min-h-[32px] px-2.5 text-xs'
                : 'min-h-[36px] px-3 text-sm',
              selected
                ? 'bg-white text-gray-900 shadow-xs dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
