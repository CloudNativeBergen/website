'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { isLocalhostClient } from '@/lib/environment/localhost'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

export interface SponsorPortalSectionProps {
  sponsorForConferenceId: string
  existingToken?: string
  portalComplete?: boolean
  registrationSent?: boolean
  onCheckStatus?: () => void
}

export function SponsorPortalSection({
  sponsorForConferenceId,
  existingToken,
  portalComplete,
  registrationSent,
  onCheckStatus,
}: SponsorPortalSectionProps) {
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(() => {
    if (registrationSent && existingToken && typeof window !== 'undefined') {
      return `${window.location.origin}/sponsor/portal/${existingToken}`
    }
    return null
  })
  const [copied, setCopied] = useState(false)
  const [emailSent, setEmailSent] = useState(registrationSent ?? false)

  const generateMutation = api.registration.generateToken.useMutation({
    onSuccess: (data) => setGeneratedUrl(data.url),
  })

  const sendInviteMutation = api.registration.sendPortalInvite.useMutation({
    onSuccess: (data) => {
      setGeneratedUrl(data.url)
      setEmailSent(true)
    },
  })

  const handleGenerate = () => {
    if (existingToken) {
      const baseUrl = window.location.origin
      setGeneratedUrl(`${baseUrl}/sponsor/portal/${existingToken}`)
    } else {
      generateMutation.mutate({ sponsorForConferenceId })
    }
  }

  const handleSendEmail = () => {
    sendInviteMutation.mutate({ sponsorForConferenceId })
  }

  const handleCopy = async () => {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.querySelector<HTMLInputElement>(
        'input[readonly][value="' + generatedUrl + '"]',
      )
      if (input) {
        input.select()
        input.setSelectionRange(0, input.value.length)
        document.execCommand('copy')
      }
    }
  }

  const isBusy = generateMutation.isPending || sendInviteMutation.isPending
  const isLocalhost = isLocalhostClient()

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
        Sponsor registration
      </h4>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Send the sponsor a registration form to collect their company details
        (org number, address), contact persons, billing information, and logo.
      </p>

      {portalComplete ? (
        <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckIcon className="h-4 w-4" />
          Sponsor completed registration
        </div>
      ) : generatedUrl ? (
        <div className="mt-3 space-y-2">
          {emailSent && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              Registration email sent to sponsor contacts
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={generatedUrl}
              readOnly
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600"
              title="Copy to clipboard"
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {!emailSent && (
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sendInviteMutation.isPending || isLocalhost}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                title={
                  isLocalhost
                    ? 'Emails cannot be sent from localhost'
                    : 'Send registration link via email to sponsor contacts'
                }
              >
                <EnvelopeIcon className="h-3.5 w-3.5" />
                {sendInviteMutation.isPending ? 'Sending\u2026' : 'Send'}
              </button>
            )}
          </div>
          {onCheckStatus && (
            <button
              type="button"
              onClick={onCheckStatus}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-600 dark:hover:bg-gray-700"
              title="Check if sponsor completed registration"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Check status
            </button>
          )}
          {(sendInviteMutation.isError || generateMutation.isError) && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {sendInviteMutation.error?.message ||
                generateMutation.error?.message}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={isBusy || isLocalhost}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <EnvelopeIcon className="h-4 w-4" />
              {sendInviteMutation.isPending
                ? 'Sending\u2026'
                : 'Send registration email'}
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isBusy}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700"
            >
              <LinkIcon className="h-4 w-4" />
              {generateMutation.isPending
                ? 'Generating\u2026'
                : 'Copy link only'}
            </button>
          </div>
          {isLocalhost && (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
              Emails cannot be sent from localhost. Use &quot;Copy link
              only&quot; for local testing.
            </div>
          )}
          {(sendInviteMutation.isError || generateMutation.isError) && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {sendInviteMutation.error?.message ||
                generateMutation.error?.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
