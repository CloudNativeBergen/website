'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getWorkshopCapacityData,
  type WorkshopCapacityData,
} from '@/hooks/dashboard/useDashboardData'

export function WorkshopCapacityWidget() {
  const [data, setData] = useState<WorkshopCapacityData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getWorkshopCapacityData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  if (!data || data.workshops.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No workshop data available
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Workshop Capacity
        </h3>
        <Link
          href="/admin/workshops"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Manage →
        </Link>
      </div>

      <div className="@container:grid-cols-1 mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-blue-50 p-2 text-center dark:bg-blue-900/20">
          <div className="text-[11px] text-blue-600 dark:text-blue-400">
            Avg Fill
          </div>
          <div className="mt-1 text-lg font-bold text-blue-900 dark:text-blue-100">
            {data.averageFillRate.toFixed(0)}%
          </div>
        </div>
        <div className="rounded-lg bg-green-50 p-2 text-center dark:bg-green-900/20">
          <div className="text-[11px] text-green-600 dark:text-green-400">
            Full
          </div>
          <div className="mt-1 text-lg font-bold text-green-900 dark:text-green-100">
            {data.atCapacity}
          </div>
        </div>
        <div className="rounded-lg bg-amber-50 p-2 text-center dark:bg-amber-900/20">
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            Waitlist
          </div>
          <div className="mt-1 text-lg font-bold text-amber-900 dark:text-amber-100">
            {data.totalWaitlist}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 [&>*:nth-child(n+4)]:hidden @[300px]:[&>*:nth-child(n+5)]:block @[300px]:[&>*:nth-child(n+6)]:hidden @[400px]:[&>*:nth-child(n+6)]:block @[600px]:[&>*:nth-child(n+7)]:block">
        {data.workshops.map((workshop) => {
          const fillColor =
            workshop.fillRate === 100
              ? 'bg-green-600 dark:bg-green-500'
              : workshop.fillRate >= 80
                ? 'bg-blue-600 dark:bg-blue-500'
                : workshop.fillRate >= 50
                  ? 'bg-amber-600 dark:bg-amber-500'
                  : 'bg-gray-600 dark:bg-gray-500'

          return (
            <div
              key={workshop.id}
              className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="mb-1.5 flex items-start justify-between">
                <h4 className="flex-1 truncate text-[11px] leading-tight font-semibold text-gray-900 dark:text-gray-100">
                  {workshop.title}
                </h4>
                <span className="ml-2 text-[11px] font-bold text-gray-700 dark:text-gray-200">
                  {workshop.fillRate.toFixed(0)}%
                </span>
              </div>

              <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={`h-full transition-all ${fillColor}`}
                  style={{ width: `${workshop.fillRate}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                {/* Compact mode: just show ratio on small, full details on larger */}
                <span className="block @[250px]:hidden">
                  {workshop.confirmed}/{workshop.capacity}
                </span>
                <span className="hidden @[250px]:block">
                  {workshop.confirmed}/{workshop.capacity} confirmed
                </span>
                {workshop.waitlist > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {workshop.waitlist}
                    <span className="hidden @[250px]:inline"> waiting</span>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
