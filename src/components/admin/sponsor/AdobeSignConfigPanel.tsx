'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  Cog6ToothIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  LinkIcon,
} from '@heroicons/react/24/outline'

interface ConnectionResult {
  configured: boolean
  connected: boolean
  baseUrl: string
  applicationIdSet: boolean
  applicationSecretSet: boolean
  clientIdSet: boolean
  webhookUrl: string | null
  error?: string
  userEmail?: string
  userAccount?: string
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
    />
  )
}

export function AdobeSignConfigPanel() {
  const [result, setResult] = useState<ConnectionResult | null>(null)
  const [copied, setCopied] = useState(false)

  const testMutation =
    api.sponsor.contractTemplates.testAdobeSignConnection.useMutation({
      onSuccess: (data) => setResult(data),
      onError: (error) => {
        setResult({
          configured: false,
          connected: false,
          baseUrl: '',
          applicationIdSet: false,
          applicationSecretSet: false,
          clientIdSet: false,
          webhookUrl: null,
          error: error.message,
        })
      },
    })

  const handleCopyWebhookUrl = () => {
    if (result?.webhookUrl) {
      navigator.clipboard?.writeText(result.webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Cog6ToothIcon className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Adobe Sign Integration
          </h3>
          {result && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${result.connected
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : result.configured
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                }`}
            >
              {result.connected
                ? 'Connected'
                : result.configured
                  ? 'Not Connected'
                  : 'Not Configured'}
            </span>
          )}
        </div>
        <button
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ArrowPathIcon
            className={`h-3.5 w-3.5 ${testMutation.isPending ? 'animate-spin' : ''}`}
          />
          {testMutation.isPending ? 'Testing...' : 'Test Connection'}
        </button>
      </div>

      {result && (
        <div className="space-y-4 px-6 py-4">
          {/* Connection Status */}
          {result.connected ? (
            <div className="flex items-start gap-2 rounded-md bg-green-50 p-3 dark:bg-green-900/10">
              <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              <div className="text-sm text-green-800 dark:text-green-300">
                <p className="font-medium">
                  Successfully connected to Adobe Sign
                </p>
                {result.userAccount && (
                  <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
                    API endpoint: {result.userAccount}
                  </p>
                )}
              </div>
            </div>
          ) : result.error ? (
            <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 dark:bg-red-900/10">
              {result.configured ? (
                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              ) : (
                <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              )}
              <div className="text-sm text-red-800 dark:text-red-300">
                <p className="font-medium">
                  {result.configured ? 'Connection failed' : 'Not configured'}
                </p>
                <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
                  {result.error}
                </p>
              </div>
            </div>
          ) : null}

          {/* Environment Variables */}
          <div>
            <h4 className="mb-2 text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
              Environment Variables
            </h4>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                  ADOBE_SIGN_APPLICATION_ID
                </span>
                <StatusDot ok={result.applicationIdSet} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                  ADOBE_SIGN_APPLICATION_SECRET
                </span>
                <StatusDot ok={result.applicationSecretSet} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                  ADOBE_SIGN_CLIENT_ID
                </span>
                <span className="flex items-center gap-1">
                  <StatusDot ok={result.clientIdSet} />
                  {!result.clientIdSet && (
                    <span className="text-xs text-gray-400">
                      (webhook auth)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                  ADOBE_SIGN_BASE_URL
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {result.baseUrl || 'default'}
                </span>
              </div>
            </div>
          </div>

          {/* Webhook URL */}
          <div>
            <h4 className="mb-2 text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
              Webhook Configuration
            </h4>
            {result.webhookUrl ? (
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
                  <LinkIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <code className="truncate text-xs text-gray-700 dark:text-gray-300">
                    {result.webhookUrl}
                  </code>
                </div>
                <button
                  onClick={handleCopyWebhookUrl}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                  title="Copy webhook URL"
                >
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Set NEXTAUTH_URL or VERCEL_URL to generate the webhook endpoint
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              Register this URL in your Adobe Sign application settings to
              receive signature status updates automatically.
            </p>
          </div>
        </div>
      )}

      {!result && !testMutation.isPending && (
        <div className="px-6 py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Click &quot;Test Connection&quot; to verify your Adobe Sign API
            configuration and credentials.
          </p>
        </div>
      )}
    </div>
  )
}
