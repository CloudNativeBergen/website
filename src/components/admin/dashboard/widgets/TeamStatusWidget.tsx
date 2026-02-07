'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircleIcon,
  ClockIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import {
  getTeamStatusData,
  type TeamStatusData,
} from '@/hooks/dashboard/useDashboardData'
import { BaseWidgetProps } from '@/lib/dashboard/types'

type TeamStatusWidgetProps = BaseWidgetProps

export function TeamStatusWidget({}: TeamStatusWidgetProps) {
  const [data, setData] = useState<TeamStatusData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTeamStatusData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No team data available
        </p>
      </div>
    )
  }

  // All phases show operational view
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Team Status
        </h3>
        <Link
          href="/admin/team"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Manage →
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-blue-50 p-2.5 dark:bg-blue-900/20">
          <UsersIcon className="mb-1 h-5 w-5 text-blue-500" />
          <div className="text-[11px] text-blue-600 dark:text-blue-400">
            Total Team
          </div>
          <div className="mt-0.5 text-lg font-bold text-blue-900 dark:text-blue-100">
            {data.totalOrganizers}
          </div>
        </div>
        <div className="rounded-lg bg-green-50 p-2.5 dark:bg-green-900/20">
          <CheckCircleIcon className="mb-1 h-5 w-5 text-green-500" />
          <div className="text-[11px] text-green-600 dark:text-green-400">
            Active
          </div>
          <div className="mt-0.5 text-lg font-bold text-green-900 dark:text-green-100">
            {data.activeOrganizers}
          </div>
        </div>
      </div>

      <div className="flex-1">
        <h4 className="mb-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          Team Members
        </h4>
        <div className="space-y-2 [&>*:nth-child(n+4)]:hidden @[300px]:[&>*:nth-child(n+5)]:block">
          {data.teamMembers.map((member) => {
            const progress = (member.tasksCompleted / member.tasksTotal) * 100

            return (
              <div
                key={member.id}
                className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="mb-1 flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h5 className="truncate text-[11px] leading-tight font-semibold text-gray-900 dark:text-gray-100">
                      {member.name}
                    </h5>
                    <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">
                      {member.role}
                    </p>
                  </div>
                  <div className="ml-2 flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                    <ClockIcon className="h-3 w-3" />
                    <span className="hidden @[250px]:inline">
                      {member.lastActive}
                    </span>
                  </div>
                </div>

                <div className="mt-1.5">
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="text-gray-600 dark:text-gray-300">
                      Tasks
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {member.tasksCompleted}/{member.tasksTotal}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full bg-blue-600 transition-all dark:bg-blue-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
