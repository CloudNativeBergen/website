import { ReactNode } from 'react'
import clsx from 'clsx'

export interface TableContainerProps {
  children: ReactNode
  className?: string
}

export function TableContainer({ children, className }: TableContainerProps) {
  return (
    <div className="overflow-x-auto">
      <div
        className={clsx(
          'overflow-hidden shadow-sm ring-1 ring-gray-200 md:rounded-lg dark:ring-gray-700',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
