'use client'

import { useRouter } from 'next/navigation'
import { UserIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { Speaker } from '@/lib/speaker/types'

interface ImpersonationBannerProps {
  impersonatedSpeaker: Speaker
  realAdmin: Speaker
}

export function ImpersonationBanner({
  impersonatedSpeaker,
  realAdmin,
}: ImpersonationBannerProps) {
  const router = useRouter()

  const handleExitImpersonation = () => {
    router.push('/speaker/list')
    router.refresh()
  }

  return (
    <div className="border-b-2 border-purple-500 bg-gradient-to-r from-purple-100 to-blue-100 dark:border-purple-600 dark:from-purple-900/30 dark:to-blue-900/30">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-purple-600 p-1.5 dark:bg-purple-500">
            <UserIcon className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="font-semibold text-purple-900 dark:text-purple-200">
              Viewing as:
            </span>
            <span className="text-purple-800 dark:text-purple-300">
              {impersonatedSpeaker.name}
            </span>
            <span className="text-xs text-purple-700 dark:text-purple-400">
              ({impersonatedSpeaker.email})
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExitImpersonation}
          className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
        >
          <XMarkIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Exit Impersonation</span>
          <span className="sm:hidden">Exit</span>
        </button>
      </div>
      <div className="bg-purple-50 px-4 py-2 text-xs text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
          Admin: {realAdmin.name} ({realAdmin.email})
        </div>
      </div>
    </div>
  )
}
