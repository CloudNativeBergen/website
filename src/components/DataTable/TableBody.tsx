import { ReactNode, TdHTMLAttributes, HTMLAttributes } from 'react'
import clsx from 'clsx'

export interface TableBodyProps {
  children: ReactNode
  className?: string
}

export function TableBody({ children, className }: TableBodyProps) {
  return (
    <tbody
      className={clsx(
        'divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900',
        className,
      )}
    >
      {children}
    </tbody>
  )
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode
  hoverable?: boolean
  selected?: boolean
}

export function Tr({
  children,
  className,
  hoverable,
  selected,
  ...props
}: TrProps) {
  const isClickable = Boolean(props.onClick)

  return (
    <tr
      className={clsx(
        (hoverable ?? isClickable) && 'hover:bg-gray-50 dark:hover:bg-gray-800',
        isClickable && 'cursor-pointer',
        selected && 'bg-indigo-50 dark:bg-indigo-900/20',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

const PILL_ALIGNMENT: Record<'left' | 'center' | 'right', string> = {
  left: '[&_[data-pill]:first-child]:-ms-2.5',
  // Centred content is already symmetric — the pill's padding displaces
  // nothing.
  center: '',
  right: '[&_[data-pill]:last-child]:-me-2.5',
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode
  truncate?: boolean
  hidden?: boolean
  hiddenBelow?: 'sm' | 'md' | 'lg' | 'xl'
  align?: 'left' | 'center' | 'right'
}

export function Td({
  children,
  className,
  truncate,
  hidden,
  hiddenBelow,
  align = 'left',
  ...props
}: TdProps) {
  const alignmentClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }[align]

  const responsiveClass = hiddenBelow
    ? {
        sm: 'hidden sm:table-cell',
        md: 'hidden md:table-cell',
        lg: 'hidden lg:table-cell',
        xl: 'hidden xl:table-cell',
      }[hiddenBelow]
    : ''

  if (hidden) return null

  return (
    <td
      className={clsx(
        'px-4 py-3',
        alignmentClass,
        // A `Pill` carries its own `px-2.5`, so a pill-rendered value used to
        // start 10px right of its column header — a visible step between the
        // header and the column under it. Cancel the pill's padding at the
        // cell's content edge so the VALUE aligns with the header; the pill's
        // background simply bleeds into the cell padding. Matched on the
        // leading pill (whether it is the cell's own child or the first thing
        // in a wrapper row), so a pill sitting mid-row keeps its gap.
        PILL_ALIGNMENT[align],
        responsiveClass,
        truncate && 'max-w-0 truncate',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  )
}
