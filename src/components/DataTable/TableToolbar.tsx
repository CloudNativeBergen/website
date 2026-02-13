'use client'

import { ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { SearchInput } from '@/components/SearchInput'

export interface TableToolbarProps {
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  showClearButton?: boolean
  onClear?: () => void
  clearLabel?: string
  children?: ReactNode
  resultCount?: number
  totalCount?: number
  resultLabel?: string
  className?: string
}

export function TableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  showClearButton,
  onClear,
  clearLabel = 'Clear',
  children,
  resultCount,
  totalCount,
  resultLabel = 'items',
  className,
}: TableToolbarProps) {
  const hasSearch = searchValue !== undefined && onSearchChange !== undefined
  const hasResultCount = resultCount !== undefined

  return (
    <div className={clsx('space-y-4', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {hasSearch && (
            <SearchInput
              value={searchValue}
              onChange={onSearchChange}
              placeholder={searchPlaceholder}
              className="flex-1 sm:max-w-xs"
            />
          )}

          {showClearButton && onClear && (
            <button
              onClick={onClear}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
              {clearLabel}
            </button>
          )}
        </div>

        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>

      {hasResultCount && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing {resultCount}
          {totalCount !== undefined && totalCount !== resultCount && (
            <> of {totalCount}</>
          )}{' '}
          {resultLabel}
        </div>
      )}
    </div>
  )
}
