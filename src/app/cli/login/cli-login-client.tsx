'use client'

import { useState, useCallback } from 'react'
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

type Status = 'confirm' | 'loading' | 'redirecting' | 'display-token' | 'error'

const MIN_PORT = 1024
const MAX_PORT = 65535

function isValidPort(port: string): boolean {
  const n = Number(port)
  return Number.isInteger(n) && n >= MIN_PORT && n <= MAX_PORT
}

function isLocalhostOrigin(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
}

export function buildCallbackUrl(
  port: string,
  token: string,
  state: string,
  name: string,
): URL {
  const url = new URL(`http://localhost:${port}/callback`)
  url.searchParams.set('token', token)
  url.searchParams.set('state', state)
  url.searchParams.set('name', name)
  if (!isLocalhostOrigin(url)) {
    throw new Error('Redirect target must be localhost')
  }
  return url
}

interface CLILoginClientProps {
  port?: string
  state?: string
  userName: string
  userEmail: string
}

export default function CLILoginClient({
  port,
  state,
  userName,
  userEmail,
}: CLILoginClientProps) {
  const [status, setStatus] = useState<Status>('confirm')
  const [token, setToken] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const fetchTokenAndRedirect = useCallback(async () => {
    if (port) {
      if (!isValidPort(port)) {
        setError(`Invalid port: must be between ${MIN_PORT} and ${MAX_PORT}`)
        setStatus('error')
        return
      }
      if (!state) {
        setError('Missing state parameter')
        setStatus('error')
        return
      }
    }

    setStatus('loading')

    try {
      const res = await fetch('/api/auth/cli/token', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Token request failed (${res.status})`)
        setStatus('error')
        return
      }

      const { token: jwt } = (await res.json()) as { token: string }

      if (port && state) {
        setStatus('redirecting')
        const callbackUrl = buildCallbackUrl(port, jwt, state, userName)
        window.location.href = callbackUrl.toString()
      } else {
        setToken(jwt)
        setStatus('display-token')
      }
    } catch {
      setError('Failed to connect to authentication service')
      setStatus('error')
    }
  }, [port, state, userName])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        CLI Authentication
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Signing in as{' '}
        <span className="font-medium">
          {userName} ({userEmail})
        </span>
      </p>

      {status === 'confirm' && (
        <div className="mt-8">
          <CommandLineIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            The <span className="font-mono font-medium">cnctl</span> CLI is
            requesting access to your account.
          </p>
          <button
            type="button"
            onClick={fetchTokenAndRedirect}
            className="mt-6 rounded-lg bg-brand-cloud-blue px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-cloud-blue-hover"
          >
            Authorize CLI
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="mt-8">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-cloud-blue" />
          <p className="mt-4 text-sm text-gray-500">Generating token&hellip;</p>
        </div>
      )}

      {status === 'redirecting' && (
        <div className="mt-8">
          <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Authentication successful. Redirecting to CLI&hellip;
          </p>
        </div>
      )}

      {status === 'display-token' && (
        <div className="mt-8">
          <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Copy this token and paste it into your CLI:
          </p>
          <div className="mt-4 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-gray-100 px-4 py-3 text-left text-xs break-all text-gray-800 dark:bg-gray-800 dark:text-gray-200">
              {token}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-lg bg-brand-cloud-blue p-3 text-white hover:bg-brand-cloud-blue-hover"
              aria-label="Copy token"
            >
              <ClipboardDocumentIcon className="h-5 w-5" />
            </button>
          </div>
          {copied && (
            <p className="mt-2 text-sm text-green-600">Copied to clipboard!</p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="mt-8">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500" />
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => {
              setStatus('loading')
              setError('')
              fetchTokenAndRedirect()
            }}
            className="mt-4 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-cloud-blue-hover"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
