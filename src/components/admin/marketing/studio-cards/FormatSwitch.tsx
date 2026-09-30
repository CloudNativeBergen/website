'use client'

import { useId, useState } from 'react'
import { StudioFormatContext } from '@/components/common/image-capture'
import {
  DEFAULT_STUDIO_FORMAT,
  STUDIO_FORMATS,
  STUDIO_FORMAT_IDS,
  type StudioFormat,
} from '@/lib/marketing-asset'

/**
 * One Format switch per studio tab (docs/MARKETING_STUDIO_FORMATS_SPEC.md §4):
 * Square, Landscape or Portrait, above the card grid, changing every card on
 * the tab at once. Download and "Save to gallery" capture the Format shown,
 * through the context this provides.
 */
export function FormatSwitch({
  defaultFormat = DEFAULT_STUDIO_FORMAT,
  children,
}: {
  defaultFormat?: StudioFormat
  children: React.ReactNode
}) {
  const [format, setFormat] = useState<StudioFormat>(defaultFormat)
  const labelId = useId()
  // A radio group: arrow keys move the choice, one tab stop for the group.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      event.key
    ]
    if (!step) return
    event.preventDefault()
    const at = STUDIO_FORMAT_IDS.indexOf(format)
    const next =
      STUDIO_FORMAT_IDS[
        (at + step + STUDIO_FORMAT_IDS.length) % STUDIO_FORMAT_IDS.length
      ]
    setFormat(next)
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-format="${next}"]`)
      ?.focus()
  }
  return (
    <StudioFormatContext.Provider value={format}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span
          id={labelId}
          className="font-inter text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Format
        </span>
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          onKeyDown={onKeyDown}
          className="inline-flex max-w-full flex-wrap rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
        >
          {STUDIO_FORMAT_IDS.map((id) => {
            const { label, width, height } = STUDIO_FORMATS[id]
            const active = id === format
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                data-format={id}
                onClick={() => setFormat(id)}
                className={`font-inter inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white text-brand-cloud-blue shadow-sm dark:bg-gray-700 dark:text-blue-300'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                <span
                  aria-hidden
                  className={`block rounded-[2px] border-2 ${
                    active
                      ? 'border-brand-cloud-blue dark:border-blue-300'
                      : 'border-gray-400 dark:border-gray-500'
                  }`}
                  style={{
                    width: `${Math.round((14 * width) / Math.max(width, height))}px`,
                    height: `${Math.round((14 * height) / Math.max(width, height))}px`,
                  }}
                />
                {label}
                <span className="hidden text-xs text-gray-500 sm:inline dark:text-gray-400">
                  {width}×{height}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {children}
    </StudioFormatContext.Provider>
  )
}
