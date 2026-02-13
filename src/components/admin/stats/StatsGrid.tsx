import { ReactNode, Children } from 'react'
import clsx from 'clsx'

export interface StatsGridProps {
  /** Stat cards to render in the grid */
  children: ReactNode
  /** Number of columns (auto-calculated from children count if not specified) */
  columns?: 1 | 2 | 3 | 4 | 5 | 6
  /** Gap size between cards */
  gap?: 'sm' | 'md' | 'lg'
  /** Optional className for the container */
  className?: string
}

const gapClasses = {
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
}

function getGridCols(count: number, columns?: number) {
  const cols = columns ?? count
  if (cols <= 1) return 'grid-cols-1'
  if (cols <= 2) return 'grid-cols-2'
  if (cols <= 3) return 'grid-cols-2 sm:grid-cols-3'
  if (cols <= 4) return 'grid-cols-2 md:grid-cols-4'
  if (cols <= 5) return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
  return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
}

export function StatsGrid({
  children,
  columns,
  gap = 'md',
  className,
}: StatsGridProps) {
  const childCount = Children.count(children)

  return (
    <div
      className={clsx(
        'grid',
        getGridCols(childCount, columns),
        gapClasses[gap],
        className,
      )}
    >
      {children}
    </div>
  )
}
