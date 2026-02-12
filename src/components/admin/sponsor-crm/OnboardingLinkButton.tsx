'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  LinkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'

interface OnboardingLinkButtonProps {
  sponsorForConferenceId: string
  existingToken?: string
  onboardingComplete?: boolean
}

export function OnboardingLinkButton({
  sponsorForConferenceId,
  existingToken,
  onboardingComplete,
}: OnboardingLinkButtonProps) {
  const [showLink, setShowLink] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generateMutation = api.onboarding.generateToken.useMutation({
    onSuccess: (data) => {
      setGeneratedUrl(data.url)
      setShowLink(true)
    },
  })

  const handleGenerate = () => {
    generateMutation.mutate({ sponsorForConferenceId })
  }

  const handleCopy = async () => {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the input text for manual copy
      const input = document.querySelector<HTMLInputElement>(
        'input[readonly][value="' + generatedUrl + '"]',
      )
      if (input) {
        input.select()
        input.setSelectionRange(0, input.value.length)
      }
    }
  }

  if (onboardingComplete) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 ring-1 ring-green-200 ring-inset dark:bg-green-900/20 dark:text-green-400 dark:ring-green-500/30">
        <CheckIcon className="h-3.5 w-3.5" />
        Onboarded
      </span>
    )
  }

  if (showLink && generatedUrl) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={generatedUrl}
          readOnly
          className="w-48 rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowLink(false)}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          &times;
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={
        existingToken
          ? () => {
              const baseUrl = window.location.origin
              setGeneratedUrl(`${baseUrl}/sponsor/onboarding/${existingToken}`)
              setShowLink(true)
            }
          : handleGenerate
      }
      disabled={generateMutation.isPending}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
      title={
        existingToken ? 'Show onboarding link' : 'Generate onboarding link'
      }
    >
      <LinkIcon className="h-4 w-4" />
      <span className="hidden sm:inline">
        {generateMutation.isPending ? 'Generating\u2026' : 'Onboard'}
      </span>
    </button>
  )
}
