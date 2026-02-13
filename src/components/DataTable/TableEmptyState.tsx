import { ReactNode, ElementType } from 'react'
import clsx from 'clsx'

export interface TableEmptyStateProps {
  icon?: ElementType
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function TableEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: TableEmptyStateProps) {
  return (
    <div className={clsx('py-12 text-center', className)}>
      {Icon && (
        <Icon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
      )}
      <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
