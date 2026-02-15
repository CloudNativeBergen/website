'use client'

import { api } from '@/lib/trpc/client'
import type { Conference } from '@/lib/conference/types'
import {
  ShieldCheckIcon,
  ServerIcon,
  CloudIcon,
} from '@heroicons/react/24/outline'

interface SigningProviderPanelProps {
  conference: Conference
}

const providers = [
  {
    value: 'self-hosted' as const,
    label: 'Self-Hosted',
    description:
      'Email-based signing with unique links. No external service required.',
    icon: ServerIcon,
  },
  {
    value: 'adobe-sign' as const,
    label: 'Adobe Sign',
    description: 'Enterprise digital signatures via Adobe Acrobat Sign.',
    icon: CloudIcon,
  },
]

export function SigningProviderPanel({
  conference,
}: SigningProviderPanelProps) {
  const utils = api.useUtils()
  const currentProvider = conference.signingProvider ?? 'self-hosted'

  const mutation =
    api.sponsor.contractTemplates.updateSigningProvider.useMutation({
      onSuccess: () => {
        utils.sponsor.contractTemplates.getSigningProviderStatus.invalidate()
      },
    })

  const handleChange = (value: 'self-hosted' | 'adobe-sign') => {
    if (value === currentProvider) return
    mutation.mutate({
      conferenceId: conference._id,
      signingProvider: value,
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
            <ShieldCheckIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Signing Provider
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Choose how sponsor contracts are digitally signed
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {providers.map((provider) => {
            const isSelected = currentProvider === provider.value
            const Icon = provider.icon
            return (
              <button
                key={provider.value}
                type="button"
                onClick={() => handleChange(provider.value)}
                disabled={mutation.isPending}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors disabled:opacity-50 ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/50 dark:border-indigo-400 dark:bg-indigo-900/20'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isSelected
                      ? 'bg-indigo-100 dark:bg-indigo-900/40'
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      isSelected
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        isSelected
                          ? 'text-indigo-900 dark:text-indigo-200'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {provider.label}
                    </span>
                    {isSelected && (
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        Active
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-0.5 text-xs ${
                      isSelected
                        ? 'text-indigo-700/70 dark:text-indigo-300/70'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {provider.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {mutation.isError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Failed to update signing provider. Please try again.
          </p>
        )}
      </div>
    </div>
  )
}
