import { ChartBarIcon } from '@heroicons/react/24/outline'

export function DummyChartWidget() {
  return (
    <div className="flex h-full flex-col rounded-lg bg-linear-to-br from-purple-50 to-purple-100 p-3 dark:from-purple-900/20 dark:to-purple-800/20">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          Chart Widget
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center space-y-4">
        <ChartBarIcon className="h-16 w-16 text-purple-500 dark:text-purple-400" />
        <div className="text-center">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Chart Visualization
          </div>
        </div>
      </div>
    </div>
  )
}
