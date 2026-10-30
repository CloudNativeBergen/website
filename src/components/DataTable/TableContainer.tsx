import { ReactNode } from 'react'
import clsx from 'clsx'

export interface TableContainerProps {
  children: ReactNode
  className?: string
}

export function TableContainer({ children, className }: TableContainerProps) {
  // className lands on the outer wrapper so `hidden md:block` hides the whole
  // table, scroll container included.
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <div className="overflow-hidden shadow-sm ring-1 ring-gray-200 md:rounded-lg dark:ring-gray-700">
        {children}
      </div>
    </div>
  )
}
