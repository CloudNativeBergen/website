import { ReactNode, ThHTMLAttributes } from 'react'
import clsx from 'clsx'

export interface TableHeaderProps {
  children: ReactNode
  className?: string
}

export function TableHeader({ children, className }: TableHeaderProps) {
  return (
    <thead className={clsx('bg-gray-50 dark:bg-gray-800', className)}>
      {children}
    </thead>
  )
}

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode
  width?: string
  align?: 'left' | 'center' | 'right'
  hidden?: boolean
  hiddenBelow?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Th({
  children,
  className,
  width,
  align = 'left',
  hidden,
  hiddenBelow,
  ...props
}: ThProps) {
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
    <th
      scope="col"
      className={clsx(
        'px-4 py-3 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400',
        alignmentClass,
        responsiveClass,
        className,
      )}
      style={width ? { width } : undefined}
      {...props}
    >
      {children}
    </th>
  )
}
