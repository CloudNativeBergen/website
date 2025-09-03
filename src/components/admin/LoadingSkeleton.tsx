/**
 * Reusable loading skeleton components for admin interface
 * Provides consistent loading animations across all admin pages
 */

// Note: keep this file minimal; avoid unused types to satisfy strict lint rules

/**
 * Basic skeleton element for simple rectangular content
 */
export function SkeletonBox({
  className = 'h-4 w-full rounded bg-gray-200 dark:bg-gray-700',
}: {
  className?: string
}) {
  return <div className={`animate-pulse ${className}`} />
}

/**
 * Skeleton for card/panel content with header and body
 */
export function SkeletonCard({
  className = '',
  showHeader = true,
  rows = 3,
  headerWidth = 'w-1/3',
  rowHeight = 'h-4',
}: {
  className?: string
  showHeader?: boolean
  rows?: number
  headerWidth?: string
  rowHeight?: string
}) {
  return (
    <div
      className={`rounded-lg bg-white p-6 shadow dark:bg-gray-800 ${className}`}
    >
      <div className="animate-pulse">
        {showHeader && (
          <div
            className={`mb-4 ${rowHeight} ${headerWidth} rounded bg-gray-200 dark:bg-gray-700`}
          />
        )}
        <div className="space-y-3">
          {[...Array(rows)].map((_, i) => (
            <div
              key={i}
              className={`${rowHeight} rounded bg-gray-200 dark:bg-gray-700`}
              style={{
                width: i === rows - 1 ? '60%' : '100%',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton for table-like content
 */
export function SkeletonTable({
  className = '',
  rows = 5,
  columns = 4,
}: {
  className?: string
  rows?: number
  columns?: number
}) {
  return (
    <div className={`animate-pulse ${className}`}>
      {/* Table header */}
      <div
        className="grid gap-4 border-b border-gray-200 pb-3 dark:border-gray-700"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {[...Array(columns)].map((_, i) => (
          <div key={i} className="h-4 rounded bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>

      {/* Table rows */}
      <div className="space-y-3 pt-3">
        {[...Array(rows)].map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {[...Array(columns)].map((_, colIndex) => (
              <div
                key={colIndex}
                className="h-4 rounded bg-gray-200 dark:bg-gray-700"
                style={{
                  width: colIndex === columns - 1 ? '60%' : '100%',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Skeleton for search results or list items
 */
export function SkeletonList({
  className = '',
  items = 3,
  itemHeight = 'h-16',
}: {
  className?: string
  items?: number
  itemHeight?: string
}) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`}>
      {[...Array(items)].map((_, i) => (
        <div
          key={i}
          className={`${itemHeight} rounded bg-gray-200 dark:bg-gray-700`}
        />
      ))}
    </div>
  )
}

/**
 * Skeleton for modal content
 */
export function SkeletonModal({
  className = '',
  showHeader = true,
  showFooter = false,
  contentRows = 4,
}: {
  className?: string
  showHeader?: boolean
  showFooter?: boolean
  contentRows?: number
}) {
  return (
    <div className={`animate-pulse ${className}`}>
      {showHeader && (
        <div className="mb-6">
          <div className="h-6 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      )}

      <div className="space-y-4">
        {[...Array(contentRows)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>

      {showFooter && (
        <div className="mt-6 flex justify-end space-x-3">
          <div className="h-10 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-10 w-20 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      )}
    </div>
  )
}

/**
 * Centered loading skeleton for inline use
 */
export function SkeletonInline({
  message = 'Loading...',
  showMessage = false,
  size = 'medium',
}: {
  message?: string
  showMessage?: boolean
  size?: 'small' | 'medium' | 'large'
}) {
  const sizeClasses = {
    small: 'h-4 w-4',
    medium: 'h-6 w-6',
    large: 'h-8 w-8',
  }

  return (
    <div className="flex items-center justify-center py-4">
      <div
        className={`animate-pulse ${sizeClasses[size]} rounded bg-gray-200 dark:bg-gray-700`}
      />
      {showMessage && (
        <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">
          {message}
        </span>
      )}
    </div>
  )
}

/**
 * Grid of skeleton cards for dashboard-style layouts
 */
export function SkeletonGrid({
  className = '',
  items = 4,
  columns = 2,
  cardHeight = 'h-32',
}: {
  className?: string
  items?: number
  columns?: number
  cardHeight?: string
}) {
  return (
    <div
      className={`grid animate-pulse gap-4 ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {[...Array(items)].map((_, i) => (
        <div
          key={i}
          className={`${cardHeight} rounded bg-gray-200 dark:bg-gray-700`}
        />
      ))}
    </div>
  )
}
