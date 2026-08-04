'use client'

import { useId } from 'react'
import {
  SECTION_VARIANTS,
  VARIANT_DESCRIPTIONS,
  VARIANT_LABELS,
  type HomepageSectionType,
} from '@/lib/homepage'

/** One selectable presentation variant, as the picker renders it. */
export interface VariantOption {
  value: string
  label: string
  description: string
  /** The FIRST registry entry — today's look, and the value never persisted. */
  isDefault: boolean
}

/**
 * The picker options for a section type, read STRAIGHT off the closed variant
 * registry. Labels and helper text are never restated here: the Studio field,
 * the write path and this picker all read the one table, so they cannot drift.
 */
export function variantOptions(type: HomepageSectionType): VariantOption[] {
  const labels = VARIANT_LABELS[type] as Record<string, string>
  const descriptions = VARIANT_DESCRIPTIONS[type] as Record<string, string>
  return (SECTION_VARIANTS[type] as readonly string[]).map((value, index) => ({
    value,
    label: labels[value] ?? value,
    description: descriptions[value] ?? '',
    isDefault: index === 0,
  }))
}

/**
 * The presentation-variant picker — the first row of every config panel.
 *
 * Purely presentational (it is handed its options) so the single-variant case
 * is exercisable on its own. Two rules live here:
 *
 *  - A type with only ONE variant gets NO picker at all — a lone radio button
 *    is a lie about the choice available (the Studio field takes the same line).
 *  - Choosing the DEFAULT reports `undefined`, not the default's name, so
 *    "picked the default" and "never touched the picker" are the same row and
 *    therefore the same payload. The default is never persisted, which is what
 *    keeps the workspace's dirty guard from lighting up on a no-op click.
 *
 * In the workspace the picker is now two clicks from a real render of the
 * chosen look: choosing one re-renders that band in the preview within a
 * debounce tick, which is why no variant thumbnails are drawn here.
 */
export function VariantPicker({
  sectionLabel,
  options,
  value,
  onChange,
}: {
  sectionLabel: string
  options: VariantOption[]
  value?: string
  onChange: (variant: string | undefined) => void
}) {
  // One radio group per card: without a unique name every card on the page
  // would share a group and steal the selection from each other.
  const groupName = useId()
  if (options.length < 2) return null
  const selected = options.find((o) => o.value === value) ?? options[0]
  return (
    <fieldset>
      {/* "Variant — how this section is presented" was our word for it, plus a
          gloss admitting the word needed one. "Layout" needs no gloss. */}
      <legend className="text-xs font-medium text-gray-600 dark:text-gray-300">
        Layout
      </legend>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            aria-label={`${sectionLabel} variant: ${option.label}${
              option.isDefault ? ' (default)' : ''
            }`}
            className="group relative flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 has-checked:border-brand-cloud-blue has-checked:bg-brand-cloud-blue/10 has-checked:text-brand-cloud-blue has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-cloud-blue dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:has-checked:border-brand-cloud-blue dark:has-checked:bg-brand-cloud-blue/20 dark:has-checked:text-white"
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={selected.value === option.value}
              onChange={() =>
                onChange(option.isDefault ? undefined : option.value)
              }
              className="absolute inset-0 appearance-none focus:outline-none"
            />
            <span>{option.label}</span>
            {option.isDefault ? (
              <span className="text-[10px] tracking-wide text-gray-400 uppercase dark:text-gray-500">
                default
              </span>
            ) : null}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
        {selected.description}
      </p>
    </fieldset>
  )
}
