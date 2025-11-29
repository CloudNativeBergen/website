export function DummyTallWidget() {
  return (
    <div className="flex h-full flex-col justify-between rounded-lg bg-linear-to-b from-indigo-50 to-indigo-100 p-3 dark:from-indigo-900/20 dark:to-indigo-800/20">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          Vertical Card
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center text-gray-600 dark:text-gray-400">
          <div className="text-3xl font-bold">2x</div>
          <div className="text-xs">Height</div>
        </div>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-500">
        Bottom content
      </div>
    </div>
  )
}
