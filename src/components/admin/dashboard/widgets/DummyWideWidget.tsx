export function DummyWideWidget() {
  return (
    <div className="flex h-full flex-col rounded-lg bg-linear-to-r from-orange-50 to-orange-100 p-3 dark:from-orange-900/20 dark:to-orange-800/20">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          Wide Banner
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            Full Width Banner
          </div>
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Spans entire grid width
          </div>
        </div>
      </div>
    </div>
  )
}
