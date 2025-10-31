import Link from 'next/link'
import type { WorkshopStats } from '@/components/cfp/WorkshopStatistics'
import { CheckCircleIcon, UsersIcon } from '@heroicons/react/24/outline'

interface CompactWorkshopStatsProps {
  stats: WorkshopStats[]
}

export function CompactWorkshopStats({ stats }: CompactWorkshopStatsProps) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Workshop Attendance
      </h4>
      <div className="space-y-1.5">
        {stats.map((stat) => (
          <Link
            key={stat.workshopId}
            href={`/cfp/workshop/${stat.workshopId}`}
            className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2 text-sm transition-colors hover:bg-gray-100 dark:bg-gray-900/50 dark:hover:bg-gray-800"
          >
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
              <span className="truncate font-medium text-gray-900 dark:text-white">
                {stat.workshopTitle}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
              <UsersIcon className="h-3.5 w-3.5" />
              <span className="font-medium">
                {stat.confirmedCount}/{stat.capacity}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
