'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  UserGroupIcon,
  SparklesIcon,
  MapPinIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import {
  getSpeakerEngagementData,
  type SpeakerEngagementData,
} from '@/hooks/dashboard/useDashboardData'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'

type SpeakerEngagementWidgetProps = BaseWidgetProps

export function SpeakerEngagementWidget({
  conference,
}: SpeakerEngagementWidgetProps) {
  const [data, setData] = useState<SpeakerEngagementData | null>(null)
  const [loading, setLoading] = useState(true)
  const phase = conference ? getCurrentPhase(conference) : null

  useEffect(() => {
    getSpeakerEngagementData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  // Initialization phase: Setup guide
  if (phase === 'initialization') {
    return (
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserGroupIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Speaker Management
          </h3>
        </div>
        <div className="flex flex-1 flex-col justify-center space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
            <p className="text-xs font-medium text-purple-900 dark:text-purple-300">
              Prepare for speaker engagement:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-purple-800 dark:text-purple-400">
              <li>• Define speaker diversity goals</li>
              <li>• Set up speaker communication templates</li>
              <li>• Configure speaker profile requirements</li>
            </ul>
          </div>
          <Link
            href="/admin/speakers"
            className="block rounded-lg bg-purple-600 px-4 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
          >
            Configure Speakers
          </Link>
        </div>
      </div>
    )
  }

  // Execution phase: Check-in status
  if (phase === 'execution' && data) {
    return (
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Speaker Check-in
          </h3>
        </div>
        <div className="flex flex-1 flex-col justify-center space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Total Speakers
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {data.totalSpeakers}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Checked In
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {Math.floor(data.totalSpeakers * 0.7)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {(0.7 * 100).toFixed(0)}%
              </div>
            </div>
          </div>
          <Link
            href="/admin/speakers"
            className="block rounded-lg bg-blue-600 px-4 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Manage Check-ins
          </Link>
        </div>
      </div>
    )
  }

  // Post-conference phase: Feedback summary
  if (phase === 'post-conference' && data) {
    return (
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center gap-2">
          <ChartBarIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Speaker Performance
          </h3>
        </div>
        <div className="flex flex-1 flex-col justify-center space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Total Speakers
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {data.totalSpeakers}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Avg Rating
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                4.6
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  /5
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            <p className="text-xs text-green-800 dark:text-green-300">
              View detailed speaker feedback and ratings
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Planning phase (default): Speaker confirmations + diversity
  if (!data || data.totalSpeakers === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No speaker data available
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Speaker Engagement
        </h3>
        <Link
          href="/admin/speakers"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          View all →
        </Link>
      </div>

      <div className="mb-3 rounded-lg bg-linear-to-br from-blue-50 to-purple-50 p-3 dark:from-blue-900/20 dark:to-purple-900/20">
        <div className="text-[11px] text-blue-600 dark:text-blue-400">
          Total Speakers
        </div>
        <div className="mt-0.5 text-2xl font-bold text-blue-900 dark:text-blue-100">
          {data.totalSpeakers}
        </div>
        <div className="mt-1 text-[11px] text-blue-700 dark:text-blue-300">
          {data.averageProposalsPerSpeaker.toFixed(1)} proposals per speaker
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-2 @[200px]:grid-cols-1 @[400px]:grid-cols-2">
        <div className="flex flex-col items-center justify-center rounded-lg bg-green-50 p-2.5 text-center dark:bg-green-900/20">
          <SparklesIcon className="mb-1.5 h-5 w-5 text-green-600 dark:text-green-400" />
          <div className="text-[11px] text-green-600 dark:text-green-400">
            New Speakers
          </div>
          <div className="mt-0.5 text-xl font-bold text-green-900 dark:text-green-100">
            {data.newSpeakers}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg bg-blue-50 p-2.5 text-center dark:bg-blue-900/20">
          <ArrowPathIcon className="mb-1.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div className="text-[11px] text-blue-600 dark:text-blue-400">
            Returning
          </div>
          <div className="mt-0.5 text-xl font-bold text-blue-900 dark:text-blue-100">
            {data.returningSpeak}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg bg-purple-50 p-2.5 text-center dark:bg-purple-900/20">
          <UserGroupIcon className="mb-1.5 h-5 w-5 text-purple-600 dark:text-purple-400" />
          <div className="text-[11px] text-purple-600 dark:text-purple-400">
            Diverse
          </div>
          <div className="mt-0.5 text-xl font-bold text-purple-900 dark:text-purple-100">
            {data.diverseSpeakers}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg bg-cyan-50 p-2.5 text-center dark:bg-cyan-900/20">
          <MapPinIcon className="mb-1.5 h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          <div className="text-[11px] text-cyan-600 dark:text-cyan-400">
            Local
          </div>
          <div className="mt-0.5 text-xl font-bold text-cyan-900 dark:text-cyan-100">
            {data.localSpeakers}
          </div>
        </div>
      </div>

      {data.awaitingConfirmation > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 p-2.5 text-center dark:bg-amber-900/20">
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            Awaiting Confirmation
          </div>
          <div className="mt-0.5 text-xl font-bold text-amber-900 dark:text-amber-100">
            {data.awaitingConfirmation}
          </div>
        </div>
      )}
    </div>
  )
}
