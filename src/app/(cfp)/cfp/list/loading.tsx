export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="animate-pulse">
        {/* Header */}
        <div className="mb-6">
          <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-200 dark:bg-gray-700" />
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Main content — conference cards */}
          <div className="flex-1 space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-center justify-between">
                  <div className="h-6 w-2/5 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-5 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="mt-4 space-y-3">
                  <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="h-6 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="hidden w-80 shrink-0 lg:block">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="h-6 w-32 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-4 space-y-3">
                <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-4 h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
