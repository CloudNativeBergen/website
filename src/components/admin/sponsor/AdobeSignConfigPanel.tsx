'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  Cog6ToothIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  LinkIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'

export function AdobeSignConfigPanel() {
  const [webhookStatus, setWebhookStatus] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)

  const statusQuery = api.sponsor.contractTemplates.getAdobeSignStatus.useQuery(
    undefined,
    { refetchOnWindowFocus: true },
  )

  const disconnectMutation =
    api.sponsor.contractTemplates.disconnectAdobeSign.useMutation({
      onSuccess: () => {
        statusQuery.refetch()
      },
    })

  const registerWebhookMutation =
    api.sponsor.contractTemplates.registerAdobeSignWebhook.useMutation({
      onSuccess: (data) => {
        setWebhookStatus({
          message: `Webhook registered (ID: ${data.webhookId})`,
          type: 'success',
        })
      },
      onError: (error) => {
        setWebhookStatus({ message: error.message, type: 'error' })
      },
    })

  const status = statusQuery.data

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : null
  const webhookUrl = siteUrl ? `${siteUrl}/api/webhooks/adobe-sign` : null

  const handleConnect = () => {
    window.location.href = '/api/adobe-sign/authorize'
  }

  const handleDisconnect = () => {
    disconnectMutation.mutate()
  }

  const handleRegisterWebhook = () => {
    if (!webhookUrl) return
    setWebhookStatus(null)
    registerWebhookMutation.mutate({ webhookUrl })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Cog6ToothIcon className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Adobe Sign Integration
          </h3>
          {status && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                status.connected
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              }`}
            >
              {status.connected ? 'Connected' : 'Not Connected'}
            </span>
          )}
        </div>
        <button
          onClick={() => statusQuery.refetch()}
          disabled={statusQuery.isFetching}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ArrowPathIcon
            className={`h-3.5 w-3.5 ${statusQuery.isFetching ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      <div className="space-y-4 px-6 py-4">
        {status?.connected ? (
          <>
            <div className="flex items-start gap-2 rounded-md bg-green-50 p-3 dark:bg-green-900/10">
              <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              <div className="text-sm text-green-800 dark:text-green-300">
                <p className="font-medium">Connected to Adobe Sign</p>
                {status.apiAccessPoint && (
                  <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
                    API endpoint: {status.apiAccessPoint}
                  </p>
                )}
                {status.expiresAt && (
                  <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
                    Token expires: {new Date(status.expiresAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-md bg-gray-50 p-3 dark:bg-gray-800">
              <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div className="text-sm text-gray-600 dark:text-gray-300">
                <p className="font-medium">Not connected</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Connect your Adobe Sign account to enable contract sending and
                  digital signatures.
                </p>
              </div>
            </div>
            <button
              onClick={handleConnect}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Connect to Adobe Sign
            </button>
          </>
        )}

        {/* Webhook URL */}
        {webhookUrl && (
          <div>
            <h4 className="mb-2 text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
              Webhook URL
            </h4>
            <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
              <LinkIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <code className="truncate text-xs text-gray-700 dark:text-gray-300">
                {webhookUrl}
              </code>
            </div>
            {status?.connected && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleRegisterWebhook}
                  disabled={registerWebhookMutation.isPending}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <BoltIcon
                    className={`h-3.5 w-3.5 ${registerWebhookMutation.isPending ? 'animate-spin' : ''}`}
                  />
                  {registerWebhookMutation.isPending
                    ? 'Registering...'
                    : 'Register Webhook'}
                </button>
                {webhookStatus && (
                  <span
                    className={`text-xs ${
                      webhookStatus.type === 'success'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {webhookStatus.message}
                  </span>
                )}
              </div>
            )}
            {!status?.connected && (
              <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                Connect to Adobe Sign first, then register this webhook.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
