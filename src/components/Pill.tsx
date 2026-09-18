import { ReactNode } from 'react'
import clsx from 'clsx'

export type PillColor = 'purple' | 'blue' | 'green' | 'indigo' | 'gray'

const pillColorClasses: Record<PillColor, string> = {
  purple:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  indigo:
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

/**
 * The small rounded count/status badge used in table cells and cards.
 *
 * `data-pill` is the contract, not decoration: `Td` reads it to cancel this
 * element's own `px-2.5` so the VALUE lines up with its column header instead
 * of sitting 10px to its right. A hand-rolled `<span class="rounded-full …">`
 * in a table cell will not align — use this.
 */
export function Pill({
  color = 'gray',
  className,
  children,
}: {
  color?: PillColor
  className?: string
  children: ReactNode
}) {
  return (
    <span
      data-pill
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        pillColorClasses[color],
        className,
      )}
    >
      {children}
    </span>
  )
}
