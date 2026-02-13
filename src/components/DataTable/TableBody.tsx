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
  hoverable = true,
  selected,
  ...props
}: TrProps) {
  return (
    <tr
      className={clsx(
        hoverable && 'hover:bg-gray-50 dark:hover:bg-gray-800',
        selected && 'bg-indigo-50 dark:bg-indigo-900/20',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  )
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
