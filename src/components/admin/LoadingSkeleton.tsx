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

export function SkeletonSearchResult({
  className = '',
  items = 3,
}: {
  className?: string
  items?: number
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <ul className="-mx-4 mt-2 space-y-0">
          {[...Array(items)].map((_, i) => (
            <li key={i} className="flex animate-pulse items-center px-4 py-2">
              <div className="shrink-0">
                <div className="size-6 rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="ml-3 flex-auto space-y-2">
                <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="flex items-center justify-between">
                  <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-5 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function SkeletonProposalDetail({
  className = '',
}: {
  className?: string
}) {
  return (
    <div
      className={`flex h-full min-h-screen flex-col lg:flex-row ${className}`}
    >
      {/* Main content area */}
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-4xl p-4 lg:p-0">
          <div className="mb-8 animate-pulse">
            {/* Back button and metadata row */}
            <div className="mb-4 flex items-center justify-between">
              <div className="h-9 w-36 rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center space-x-3">
                <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-9 w-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="h-9 w-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="h-9 w-28 rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="h-9 w-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>

          {/* Title section */}
          <div className="animate-pulse border-b border-gray-200 py-5 dark:border-gray-700">
            <div className="space-y-3">
              <div className="h-8 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center space-x-4">
                <div className="h-6 w-24 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>

          {/* Content sections */}
          <div className="py-5">
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
              <div className="animate-pulse space-y-8 lg:col-span-2">
                {/* Description */}
                <div>
                  <div className="mb-4 h-6 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-4/5 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>

                {/* Outline */}
                <div>
                  <div className="mb-4 h-6 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>

                {/* Topics */}
                <div>
                  <div className="mb-4 h-6 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="flex flex-wrap gap-2">
                    <div className="h-6 w-24 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="h-6 w-32 rounded-full bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              </div>

              {/* Sidebar - hidden on mobile, shown on xl screens */}
              <div className="hidden animate-pulse xl:block">
                <div className="space-y-6">
                  {/* Details card */}
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                        <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                        <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                        <div className="h-4 w-36 rounded bg-gray-200 dark:bg-gray-700" />
                      </div>
                    </div>
                  </div>

                  {/* Speaker card */}
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                    <div className="mb-3 h-5 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="flex items-center space-x-3">
                      <div className="size-12 rounded-full bg-gray-200 dark:bg-gray-700" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                        <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Review panel - responsive sizing */}
      <div className="w-full border-t border-gray-200 bg-gray-50 lg:w-96 lg:border-t-0 lg:border-l dark:border-gray-700 dark:bg-gray-800">
        <div className="animate-pulse p-6">
          {/* Review Summary */}
          <div className="mb-6">
            <div className="mb-4 h-6 w-40 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="rounded-lg bg-white p-4 dark:bg-gray-900">
              <div className="mb-4 space-y-2">
                <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="flex items-center space-x-2">
                  <div className="h-6 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            </div>
          </div>

          {/* Review Form */}
          <div className="mb-6">
            <div className="mb-4 h-6 w-36 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="rounded-lg bg-white p-4 dark:bg-gray-900">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-8 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-8 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-8 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-24 w-full rounded bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>

          {/* Reviews List */}
          <div>
            <div className="mb-4 h-6 w-28 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-white p-4 dark:bg-gray-900"
                >
                  <div className="mb-3 flex items-center space-x-3">
                    <div className="size-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
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
