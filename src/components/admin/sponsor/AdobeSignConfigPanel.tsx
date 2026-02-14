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
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'

export function AdobeSignConfigPanel() {
  const [expanded, setExpanded] = useState(false)
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
          message: data.existing
            ? `Webhook already active (ID: ${data.webhookId})`
            : `Webhook registered (ID: ${data.webhookId})`,
          type: 'success',
        })
        statusQuery.refetch()
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
      {/* Header — always visible */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <Cog6ToothIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Adobe Sign Integration
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Digital contract signing &amp; tracking
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <>
              {status.connected && status.webhookActive && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-500/30">
                  <BoltIcon className="h-3 w-3" />
                  Webhook
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  status.connected
                    ? 'bg-green-50 text-green-700 ring-1 ring-green-600/20 dark:bg-green-900/20 dark:text-green-300 dark:ring-green-500/30'
                    : 'bg-red-50 text-red-700 ring-1 ring-red-600/20 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-500/30'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    status.connected
                      ? 'bg-green-500 dark:bg-green-400'
                      : 'bg-red-500 dark:bg-red-400'
                  }`}
                />
                {status.connected ? 'Connected' : 'Not Connected'}
              </span>
            </>
          )}
          <button
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isFetching}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ArrowPathIcon
              className={`h-3.5 w-3.5 ${statusQuery.isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {expanded ? (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="border-t border-gray-200 px-6 py-5 dark:border-gray-700">
          {status?.connected ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-800/50 dark:bg-green-900/10">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      Connected to Adobe Sign
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
                      {status.apiAccessPoint && (
                        <div>
                          <dt className="text-xs text-green-600/70 dark:text-green-400/70">
                            API Endpoint
                          </dt>
                          <dd className="text-xs font-medium text-green-700 dark:text-green-300">
                            {status.apiAccessPoint}
                          </dd>
                        </div>
                      )}
                      {status.expiresAt && (
                        <div>
                          <dt className="text-xs text-green-600/70 dark:text-green-400/70">
                            Token Expires
                          </dt>
                          <dd className="text-xs font-medium text-green-700 dark:text-green-300">
                            {new Date(status.expiresAt).toLocaleString()}
                          </dd>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Webhook Section */}
              {webhookUrl && (
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                      Webhook Configuration
                    </h4>
                    {status.webhookActive && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900">
                    <LinkIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <code className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
                      {webhookUrl}
                    </code>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={handleRegisterWebhook}
                      disabled={registerWebhookMutation.isPending}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <BoltIcon
                        className={`h-3.5 w-3.5 ${registerWebhookMutation.isPending ? 'animate-spin' : ''}`}
                      />
                      {registerWebhookMutation.isPending
                        ? 'Registering...'
                        : status.webhookActive
                          ? 'Re-register Webhook'
                          : 'Register Webhook'}
                    </button>
                    {webhookStatus && (
                      <span
                        className={`text-xs font-medium ${
                          webhookStatus.type === 'success'
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {webhookStatus.message}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Disconnect to revoke access and clear stored tokens.
                </p>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  {disconnectMutation.isPending
                    ? 'Disconnecting...'
                    : 'Disconnect'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-start gap-3">
                  <XCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Not connected
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Connect your Adobe Sign account to enable contract sending
                      and digital signatures.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConnect}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
              >
                Connect to Adobe Sign
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
