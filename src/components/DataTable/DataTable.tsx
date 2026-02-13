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

  return (
    <TableContainer className={className}>
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
                      : String(
                          typeof item === 'object' &&
                            item !== null &&
                            (item as Record<string, unknown>)[column.key] !==
                              undefined
                            ? (item as Record<string, unknown>)[column.key]
                            : '',
                        )}
                  </Td>
                ))}
              </Tr>
            )
          })}
        </TableBody>
      </table>
    </TableContainer>
  )
}
