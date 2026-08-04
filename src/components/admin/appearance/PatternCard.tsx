import type { ReactNode } from 'react'
import { CheckCircleIcon, PaintBrushIcon } from '@heroicons/react/24/solid'
import { InfoCard } from '@/app/(admin)/admin/settings/settingsLayout'
import {
  BACKGROUND_PATTERN_VALUES,
  type BackgroundPattern,
} from '@/lib/conference/backgroundPattern'
import { PatternThumb } from './PatternThumb'

/**
 * Appearance → Background pattern. A purely visual choice, so the card renders
 * all three options as tiles with a real (static) render of each — the previous
 * body was the sentence "Cloud Native (animated CNCF logos)", which told an
 * organizer nothing about what any of them looks like.
 *
 * Display only for now: the tiles are not yet the input (that is the inline
 * radio-card batch); the existing fieldset editor in the header still performs
 * the change.
 */

/**
 * Copy per option. Keyed by the enum (not a hand-ordered array) so a new
 * pattern value is a TYPE error here rather than a silently missing tile, and
 * the tiles always render in the enum's own order.
 */
const PATTERN_META: Record<BackgroundPattern, { label: string; hint: string }> =
  {
    'cloud-native': { label: 'Cloud Native', hint: 'Animated CNCF logos' },
    subtle: { label: 'Subtle', hint: 'Sparse, faint logos' },
    none: { label: 'None', hint: 'Plain gradient' },
  }

const BACKGROUND_PATTERN_OPTIONS = BACKGROUND_PATTERN_VALUES.map((value) => ({
  value,
  ...PATTERN_META[value],
}))

export function PatternCard({
  pattern,
  primaryColor,
  accentColor,
  action,
}: {
  pattern: BackgroundPattern
  primaryColor?: string | null
  accentColor?: string | null
  action?: ReactNode
}) {
  return (
    <InfoCard title="Background pattern" icon={PaintBrushIcon} action={action}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {BACKGROUND_PATTERN_OPTIONS.map((option) => {
          const selected = option.value === pattern
          return (
            <li
              key={option.value}
              className={
                selected
                  ? 'rounded-lg p-2 ring-2 ring-indigo-500 dark:ring-indigo-400'
                  : 'rounded-lg p-2 ring-1 ring-gray-200 dark:ring-gray-700'
              }
            >
              <PatternThumb
                pattern={option.value}
                primaryColor={primaryColor}
                accentColor={accentColor}
              />
              <div className="mt-2 flex items-start gap-1.5">
                {selected ? (
                  <CheckCircleIcon
                    className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="min-w-0">
                  <p
                    className={
                      selected
                        ? 'text-sm font-semibold text-gray-900 dark:text-white'
                        : 'text-sm font-medium text-gray-600 dark:text-gray-300'
                    }
                  >
                    {option.label}
                    {selected ? (
                      <span className="sr-only"> (in use)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {option.hint}
                  </p>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </InfoCard>
  )
}
