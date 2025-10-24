// Note: keep this file minimal; avoid unused types to satisfy strict lint rules

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
      <div
        className="grid gap-4 border-b border-gray-200 pb-3 dark:border-gray-700"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {[...Array(columns)].map((_, i) => (
          <div key={i} className="h-4 rounded bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>

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
