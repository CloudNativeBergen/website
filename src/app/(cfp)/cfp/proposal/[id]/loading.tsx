export default function ProposalViewLoading() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="animate-pulse">
        {/* Back link */}
        <div className="mb-6">
          <div className="h-4 w-36 rounded bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="h-8 w-44 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-4 w-56 rounded bg-gray-200 dark:bg-gray-700" />
        </div>

        <div className="flex gap-6">
          {/* Main content */}
          <div className="flex-1">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="space-y-6">
                {/* Title */}
                <div className="h-7 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />

                {/* Status badge */}
                <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />

                {/* Description */}
                <div className="space-y-2">
                  <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-4/5 rounded bg-gray-200 dark:bg-gray-700" />
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 border-t border-gray-200 pt-6 dark:border-gray-700">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i}>
                      <div className="mb-1 h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-5 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="hidden w-80 shrink-0 lg:block">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="h-5 w-28 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-4 space-y-3">
                <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
