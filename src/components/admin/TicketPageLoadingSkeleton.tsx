import { SkeletonCard, SkeletonTable } from './LoadingSkeleton'

export function TicketPageLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="pb-6">
        <div className="animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-gray-200 dark:bg-gray-700" />
              <div>
                <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-2 h-4 w-80 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
            <div className="h-10 w-40 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="animate-pulse">
                <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-1 h-5 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-1 h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="animate-pulse">
            <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200 sm:h-10 sm:w-10 dark:bg-gray-700" />
                <div>
                  <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-1 h-3 w-56 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white/50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="text-right">
                    <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="mt-1 h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="h-5 w-9 rounded-full bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            </div>

            <div className="relative h-80 w-full rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>

      <div>
        <SkeletonCard
          showHeader={true}
          rows={3}
          headerWidth="w-48"
          className="border border-gray-200 dark:border-gray-700"
        />
      </div>

      <div className="space-y-8">
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="p-4">
            <div className="animate-pulse">
              <div className="mb-4 flex items-center justify-between">
                <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="overflow-x-auto">
                <SkeletonTable rows={4} columns={5} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="p-4">
            <div className="animate-pulse">
              <div className="mb-4 flex items-center justify-between">
                <div className="h-5 w-44 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="overflow-x-auto">
                <SkeletonTable rows={3} columns={5} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="rounded-lg bg-white shadow dark:bg-gray-800">
          <div className="p-6">
            <SkeletonTable rows={8} columns={6} />
          </div>
        </div>
      </div>
    </div>
  )
}
