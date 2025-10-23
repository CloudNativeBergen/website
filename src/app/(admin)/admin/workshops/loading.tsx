export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header with icon, title, and description */}
      <div className="pb-6">
        <div className="animate-pulse">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-6 w-6 rounded bg-gray-200 sm:h-8 sm:w-8 dark:bg-gray-700" />
            <div>
              <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-4 w-96 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        </div>

        {/* Stats Grid - 5 stat cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 md:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
            >
              <div className="animate-pulse">
                <div className="h-5 w-12 rounded bg-gray-200 sm:h-6 sm:w-16 dark:bg-gray-700" />
                <div className="mt-2 h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workshop Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {[...Array(9)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800"
          >
            <div className="animate-pulse space-y-4">
              {/* Workshop title */}
              <div className="h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />

              {/* Duration */}
              <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />

              {/* Capacity label and bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3 w-12 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>

              {/* Confirmed/Waitlist counts */}
              <div className="flex gap-4">
                <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <div className="h-9 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-9 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
