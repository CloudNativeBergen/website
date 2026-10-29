import type { FeedbackColour } from '@/lib/feedback/colour'
import type { FeedbackTotals } from '@/lib/feedback/totals'
import { ANSWERS } from './answers'

/** Per colour: the bar segment, the tile behind a total, and its text. */
export const FEEDBACK_TONE: Record<
  FeedbackColour,
  { bar: string; tile: string; text: string }
> = {
  green: {
    bar: 'bg-green-600 dark:bg-green-500',
    tile: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-800 dark:text-green-300',
  },
  yellow: {
    bar: 'bg-yellow-400',
    tile: 'bg-yellow-50 dark:bg-yellow-900/20',
    text: 'text-yellow-900 dark:text-yellow-300',
  },
  red: {
    bar: 'bg-red-600 dark:bg-red-500',
    tile: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-800 dark:text-red-300',
  },
}

/**
 * The combined totals as one stacked bar, green to red (§4.3). Decorative:
 * the numbers beside it say the same. Spans, so it may sit inside a button.
 * `className` sets the height and spacing.
 */
export function ColourBar({
  totals,
  className = '',
}: {
  totals: FeedbackTotals
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700 ${className}`}
    >
      {totals.total > 0 &&
        ANSWERS.map(({ colour }) =>
          totals.combined[colour] > 0 ? (
            <span
              key={colour}
              className={FEEDBACK_TONE[colour].bar}
              style={{
                width: `${(totals.combined[colour] / totals.total) * 100}%`,
              }}
            />
          ) : null,
        )}
    </span>
  )
}
