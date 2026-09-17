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
  const body = (
    <>
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        className={clsx('mt-1 text-xl font-semibold', valueColorClasses[color])}
      >
        {value}
      </dd>
      {subtitle && (
        <dd className="text-xs text-gray-600 dark:text-gray-400">{subtitle}</dd>
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
  // The BUTTON wraps the card, it does not replace it. `dt`/`dd` are not
  // phrasing content, so putting them inside a <button> is invalid HTML and
  // flattens the term/value pairing into one run-on accessible name.
  return (
    <div className={shell}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed ?? false}
        className="w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue"
      >
        <dl>{body}</dl>
      </button>
    </div>
  )
}
