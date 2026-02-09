export default function ProposalLoading() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="animate-pulse">
        {/* Header */}
        <div className="mb-6">
          <div className="h-8 w-56 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-4 w-80 rounded bg-gray-200 dark:bg-gray-700" />
        </div>

        <div className="flex gap-6">
          {/* Form card */}
          <div className="flex-1">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="space-y-6">
                {/* Title field */}
                <div>
                  <div className="mb-2 h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
                </div>

                {/* Description field */}
                <div>
                  <div className="mb-2 h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-32 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
                </div>

                {/* Dropdowns row */}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <div className="mb-2 h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
                    </div>
                  ))}
                </div>

                {/* Topics */}
                <div>
                  <div className="mb-2 h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-8 w-24 rounded-full bg-gray-200 dark:bg-gray-700"
                      />
                    ))}
                  </div>
                </div>

                {/* Outline */}
                <div>
                  <div className="mb-2 h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-20 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-end gap-x-4 border-t border-gray-200 pt-6 dark:border-gray-700">
                  <div className="h-5 w-14 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-11 w-28 rounded-xl bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="hidden w-80 shrink-0 lg:block">
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="h-5 w-28 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-4 space-y-3">
                  <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-4/5 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="h-5 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-4 space-y-3">
                  <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
