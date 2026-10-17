'use client'

import { useEffect, useState } from 'react'
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import type { FeedbackWindow } from '@/lib/feedback'
import { formatDateTimeSafe } from '@/lib/time'

/** The code's state line (speaker feedback spec §9.2). */
function codeState(window: FeedbackWindow): { text: string; live: boolean } {
  switch (window.state) {
    case 'unscheduled':
      return { text: 'Opens once your session is scheduled', live: false }
    case 'before':
      return {
        text: `Opens when your session starts (${formatDateTimeSafe(window.opensAt ?? '')})`,
        live: false,
      }
    case 'open':
      return {
        text: `Open until ${formatDateTimeSafe(window.closesAt ?? '')}`,
        live: true,
      }
    case 'closed':
      return { text: 'Closed', live: false }
  }
}

function QrCode({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, { width: 352, margin: 1 }),
      )
      .then((dataUrl) => !cancelled && setSrc(dataUrl))
      .catch(() => !cancelled && setSrc(null))
    return () => {
      cancelled = true
    }
  }, [url])
  return (
    <div className="size-44 shrink-0 rounded-md bg-white p-1 ring-1 ring-gray-200 dark:ring-gray-700">
      {src ? (
        <img
          src={src}
          alt={`QR code for ${url}`}
          className="size-full [image-rendering:pixelated]"
        />
      ) : (
        <div className="size-full animate-pulse rounded bg-gray-100" />
      )}
    </div>
  )
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          .writeText(url)
          .then(() => setCopied(true))
          .catch(() => setCopied(false))
      }
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      {copied ? (
        <CheckIcon className="size-4 text-green-600 dark:text-green-400" />
      ) : (
        <ClipboardDocumentIcon className="size-4" />
      )}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
    </button>
  )
}

/**
 * The Feedback Code tab (speaker feedback spec §9.2): the QR code for the
 * attendee URL, its state, and Copy link. Downloads, Print sheet and Present
 * come later (F4).
 */
export function FeedbackCodePanel({
  url,
  window,
}: {
  url: string
  window: FeedbackWindow
}) {
  const state = codeState(window)
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <QrCode url={url} />
      <div className="min-w-0 space-y-3">
        <p className="flex items-start gap-2 text-sm font-medium text-gray-900 dark:text-white">
          <span
            aria-hidden="true"
            className={`mt-1.5 size-2 shrink-0 rounded-full ${state.live ? 'animate-pulse bg-green-500' : 'bg-gray-400'}`}
          />
          {state.text}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Put this on your last slide or print the sheet for the room. Attendees
          scan it and answer in one tap; it&apos;s anonymous.
        </p>
        <p className="font-mono text-sm break-all text-gray-700 dark:text-gray-300">
          {url}
        </p>
        <CopyLinkButton url={url} />
      </div>
    </div>
  )
}
