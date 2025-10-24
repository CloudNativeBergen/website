import clsx from 'clsx'

interface StreamLoadingSkeletonProps {
  className?: string
}

export function StreamLoadingSkeleton({
  className,
}: StreamLoadingSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Main content box */}
      <div
        className={clsx(
          'animate-pulse rounded-lg border-2 border-gray-300 bg-white/95 p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800/95',
          className,
        )}
        role="status"
        aria-live="polite"
        aria-label="Loading schedule information"
      >
        {/* Status badge skeleton */}
        <div className="mb-6 flex items-center justify-between">
          <div className="h-9 w-32 rounded-full bg-gray-300 dark:bg-gray-700"></div>
        </div>

        {/* Title skeleton */}
        <div className="mb-6 space-y-3">
          <div className="h-9 w-3/4 rounded bg-gray-300 dark:bg-gray-700"></div>
          <div className="h-9 w-1/2 rounded bg-gray-300 dark:bg-gray-700"></div>
        </div>

        {/* Speaker avatars skeleton */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex -space-x-2">
            <div className="h-12 w-12 rounded-full border-2 border-white bg-gray-300 dark:border-gray-800 dark:bg-gray-700"></div>
            <div className="h-12 w-12 rounded-full border-2 border-white bg-gray-300 dark:border-gray-800 dark:bg-gray-700"></div>
          </div>
          <div className="h-6 w-48 rounded bg-gray-300 dark:bg-gray-700"></div>
        </div>

        {/* Time skeleton */}
        <div className="mb-4 flex items-center">
          <div className="mr-2 h-5 w-5 rounded bg-gray-300 dark:bg-gray-700"></div>
          <div className="h-6 w-40 rounded bg-gray-300 dark:bg-gray-700"></div>
        </div>

        {/* Description skeleton */}
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-gray-300 dark:bg-gray-700"></div>
          <div className="h-4 w-full rounded bg-gray-300 dark:bg-gray-700"></div>
          <div className="h-4 w-2/3 rounded bg-gray-300 dark:bg-gray-700"></div>
        </div>
      </div>

      {/* Secondary "UP NEXT" box skeleton */}
      <div
        className={clsx(
          'animate-pulse rounded-lg border-2 border-gray-300 bg-white/95 p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800/95',
          className,
        )}
      >
        {/* Badge and time skeleton */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="h-9 w-32 rounded-full bg-gray-300 dark:bg-gray-700"></div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-gray-300 dark:bg-gray-700"></div>
            <div className="h-6 w-40 rounded bg-gray-300 dark:bg-gray-700"></div>
          </div>
        </div>

        {/* Title skeleton */}
        <div className="mb-4 space-y-3">
          <div className="h-9 w-3/4 rounded bg-gray-300 dark:bg-gray-700"></div>
        </div>

        {/* Speaker info skeleton */}
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2">
            <div className="h-12 w-12 rounded-full border-2 border-white bg-gray-300 dark:border-gray-800 dark:bg-gray-700"></div>
          </div>
          <div className="h-6 w-36 rounded bg-gray-300 dark:bg-gray-700"></div>
        </div>
      </div>
    </div>
  )
}
