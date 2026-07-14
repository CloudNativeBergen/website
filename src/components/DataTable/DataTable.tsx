'use client'

import { ReactNode, KeyboardEvent } from 'react'
import clsx from 'clsx'
import { TableContainer } from './TableContainer'
import { TableHeader, Th } from './TableHeader'
import { TableBody, Tr, Td } from './TableBody'
import { TableEmptyState } from './TableEmptyState'

export interface Column<T> {
  key: string
  header: string
  width?: string
  align?: 'left' | 'center' | 'right'
  hiddenBelow?: 'sm' | 'md' | 'lg' | 'xl'
  render?: (item: T, index: number) => ReactNode
  className?: string
  /**
   * Marks the column shown as the card title in the mobile card layout.
   * If no column is marked primary, the first column is used.
   */
  primary?: boolean
  /** Omit this column from the mobile card layout (e.g. redundant/duplicated). */
  cardHidden?: boolean
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (item: T, index: number) => string
  emptyState?: {
    icon?: React.ElementType
    title: string
    description?: string
    action?: ReactNode
  }
  onRowClick?: (item: T, index: number) => void
  isRowSelected?: (item: T, index: number) => boolean
  tableClassName?: string
  className?: string
  /**
   * How the table renders below `md`. `cards` (default) stacks each row into a
   * label/value card — the mobile-friendly default. `scroll` keeps the table
   * and lets it scroll horizontally (use for tables that read poorly as cards).
   */
  mobileVariant?: 'cards' | 'scroll'
  /** Full override for a mobile card's body; receives the item and its index. */
  renderCard?: (item: T, index: number) => ReactNode
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  emptyState,
  onRowClick,
  isRowSelected,
  tableClassName,
  className,
  mobileVariant = 'cards',
  renderCard,
}: DataTableProps<T>) {
  if (data.length === 0) {
    if (emptyState) {
      return (
        <TableEmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
          action={emptyState.action}
          className={className}
        />
      )
    }

    return null
  }

  const primaryColumn = columns.find((column) => column.primary) ?? columns[0]
  const detailColumns = columns.filter(
    (column) => column !== primaryColumn && !column.cardHidden,
  )

  const cards =
    mobileVariant === 'cards' ? (
      <div className="space-y-3 md:hidden">
        {data.map((item, index) => {
          const selected = isRowSelected?.(item, index) ?? false
          const clickable = Boolean(onRowClick)
          return (
            <div
              key={keyExtractor(item, index)}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onRowClick!(item, index) : undefined}
              onKeyDown={
                clickable
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onRowClick!(item, index)
                      }
                    }
                  : undefined
              }
              className={clsx(
                'rounded-lg border p-4 text-sm shadow-sm',
                'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900',
                clickable &&
                  'cursor-pointer hover:border-gray-300 dark:hover:border-gray-600',
                selected && 'ring-2 ring-brand-cloud-blue dark:ring-blue-500',
              )}
            >
              {renderCard ? (
                renderCard(item, index)
              ) : (
                <div className="min-h-[44px] space-y-2">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {primaryColumn.render
                      ? primaryColumn.render(item, index)
                      : getCellValue(item, primaryColumn.key)}
                  </div>
                  <dl className="space-y-1">
                    {detailColumns.map((column) => (
                      <div
                        key={column.key}
                        className="flex justify-between gap-3"
                      >
                        <dt className="shrink-0 text-gray-500 dark:text-gray-400">
                          {column.header}
                        </dt>
                        <dd className="text-right text-gray-900 dark:text-gray-200">
                          {column.render
                            ? column.render(item, index)
                            : getCellValue(item, column.key)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )
        })}
      </div>
    ) : null

  const tableWrapperClass =
    mobileVariant === 'cards' ? 'hidden md:block' : undefined

  return (
    <>
      {cards}
      <TableContainer className={clsx(tableWrapperClass, className)}>
        <table
          className={clsx(
            'min-w-full divide-y divide-gray-300 dark:divide-gray-700',
            tableClassName,
          )}
        >
          <TableHeader>
            <tr>
              {columns.map((column) => (
                <Th
                  key={column.key}
                  width={column.width}
                  align={column.align}
                  hiddenBelow={column.hiddenBelow}
                  className={column.className}
                >
                  {column.header}
                </Th>
              ))}
            </tr>
          </TableHeader>
          <TableBody>
            {data.map((item, index) => {
              const handleRowClick = onRowClick
                ? () => onRowClick(item, index)
                : undefined

              const handleRowKeyDown = onRowClick
                ? (event: KeyboardEvent<HTMLTableRowElement>) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onRowClick(item, index)
                    }
                  }
                : undefined

              return (
                <Tr
                  key={keyExtractor(item, index)}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={handleRowClick}
                  onKeyDown={handleRowKeyDown}
                  selected={isRowSelected ? isRowSelected(item, index) : false}
                >
                  {columns.map((column) => (
                    <Td
                      key={column.key}
                      align={column.align}
                      hiddenBelow={column.hiddenBelow}
                      className={column.className}
                    >
                      {column.render
                        ? column.render(item, index)
                        : getCellValue(item, column.key)}
                    </Td>
                  ))}
                </Tr>
              )
            })}
          </TableBody>
        </table>
      </TableContainer>
    </>
  )
}

function getCellValue<T>(item: T, key: string): string {
  return String(
    typeof item === 'object' &&
      item !== null &&
      (item as Record<string, unknown>)[key] !== undefined
      ? (item as Record<string, unknown>)[key]
      : '',
  )
}
