export function DummyStatsWidget() {
  return (
    <div className="flex h-full flex-col rounded-lg bg-linear-to-br from-blue-50 to-blue-100 p-3 dark:from-blue-900/20 dark:to-blue-800/20">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          Stats Widget
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center space-y-2">
        <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
          127
        </div>
        <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Total Count
        </div>
      </div>
    </div>
  )
}
