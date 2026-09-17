import clsx from 'clsx'
import { formatConferenceDateShort, instantToOsloLocalInput } from '@/lib/time'

export function Th({
  children,
  align = 'left',
  title,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  title?: string
}) {
  return (
    <th
      scope="col"
      title={title}
      className={clsx(
        'px-3 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <td
      className={clsx(
        'px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200',
        align === 'right' ? 'text-right tabular-nums' : 'text-left',
      )}
    >
      {children}
    </td>
  )
}

/**
 * The due column carries a date and a time for every row, so the full
 * localized form pushes the numbers off the table on a laptop. Short date plus
 * the Oslo clock time — the same wall clock the Task editor schedules in.
 */
export function compactDue(date: string | null): string {
  if (!date) return '—'
  const local = instantToOsloLocalInput(date)
  const time = local ? local.slice(11, 16) : ''
  const day = formatConferenceDateShort(date)
  return time ? `${day}, ${time}` : day
}

/**
 * An em dash is NOT a zero. A count we could not read and a count that is
 * genuinely nought have to look different, or the ledger lies quietly.
 */
export function formatCount(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-GB')
}
