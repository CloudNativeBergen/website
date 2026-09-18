import { ReactNode } from 'react'
import clsx from 'clsx'

export type StatColor =
  'blue' | 'green' | 'purple' | 'slate' | 'indigo' | 'yellow' | 'red'

export interface StatCardProps {
  /** The main value to display */
  value: string | number
  /** Label describing the stat */
  label: string
  /** Optional subtitle or additional context */
  subtitle?: string | ReactNode
  /** Color theme for the value */
  color?: StatColor
  /** Optional className for the container */
  className?: string
  onClick?: () => void
  pressed?: boolean
}

const valueColorClasses: Record<StatColor, string> = {
  blue: 'text-brand-cloud-blue dark:text-blue-300',
  green: 'text-brand-fresh-green dark:text-green-300',
  purple: 'text-brand-nordic-purple dark:text-indigo-300',
  indigo: 'text-brand-cloud-blue dark:text-indigo-300',
  yellow: 'text-yellow-600 dark:text-yellow-300',
  red: 'text-red-600 dark:text-red-300',
  slate: 'text-gray-900 dark:text-white',
}

export function StatCard({
  value,
  label,
  subtitle,
  color = 'slate',
  className,
  onClick,
  pressed,
}: StatCardProps) {
  // Phrasing content throughout, so the card is valid inside a <button>.
  //
  // It used to render `<dt>`/`<dd>`. Those are not phrasing content, so the
  // clickable variant was invalid HTML — first with the button REPLACING the
  // card element, then with the button wrapping a `<dl>`, which is flow content
  // and no better. There was no `<dl>` ancestor in the non-clickable case
  // either (`AdminPageHeader` lays the cards out in a plain grid), so the
  // description-list semantics were never real. Spans with an explicit
  // `aria-label` give assistive tech one honest reading: "Overdue, 5".
  const body = (
    <>
      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <span
        className={clsx(
          'mt-1 block text-xl font-semibold',
          valueColorClasses[color],
        )}
      >
        {value}
      </span>
      {subtitle && (
        <span className="block text-xs text-gray-600 dark:text-gray-400">
          {subtitle}
        </span>
      )}
    </>
  )
  const shell = clsx(
    'rounded-lg border px-4 py-3 shadow-sm',
    // A pressed card must LOOK pressed. `aria-pressed` alone told assistive
    // tech the filter was on and left sighted users clicking a card twice with
    // no cue either way.
    pressed
      ? 'border-brand-cloud-blue bg-blue-50 ring-2 ring-brand-cloud-blue/40 dark:border-blue-400 dark:bg-blue-950/40 dark:ring-blue-400/40'
      : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900',
    className,
  )
  if (!onClick) return <div className={shell}>{body}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={`${label}, ${value}`}
      className={clsx(
        shell,
        'w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue',
      )}
    >
      {body}
    </button>
  )
}
