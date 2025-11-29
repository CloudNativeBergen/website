export function DummyListWidget() {
  return (
    <div className="flex h-full flex-col rounded-lg bg-linear-to-br from-green-50 to-green-100 p-3 dark:from-green-900/20 dark:to-green-800/20">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          Activity List
        </div>
      </div>
      <ul className="space-y-2">
        <li className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-green-500 dark:bg-green-400" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Recent Activity 1
          </span>
        </li>
        <li className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-green-500 dark:bg-green-400" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Recent Activity 2
          </span>
        </li>
        <li className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-green-500 dark:bg-green-400" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Recent Activity 3
          </span>
        </li>
      </ul>
    </div>
  )
}
