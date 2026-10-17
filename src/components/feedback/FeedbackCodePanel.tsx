'use client'

import { useEffect, useState } from 'react'
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import type { FeedbackWindow } from '@/lib/feedback'
import { formatRegistrationInstant } from '@/lib/time'

/** The code's state line (speaker feedback spec §9.2). */
function codeState(window: FeedbackWindow): { text: string; live: boolean } {
  switch (window.state) {
    case 'unscheduled':
      // Once the conference is over an unscheduled session can't open any more.
      return window.feedbackVisible
        ? { text: 'Closed', live: false }
        : { text: 'Opens once your session is scheduled', live: false }
    case 'before':
      return {
        text: `Opens when your session starts (${formatRegistrationInstant(window.opensAt ?? '')})`,
        live: false,
      }
    case 'open':
      return {
        text: `Open until ${formatRegistrationInstant(window.closesAt ?? '')}`,
        live: true,
      }
    case 'closed':
      return { text: 'Closed', live: false }
  }
}

function QrCode({ url }: { url: string }) {
  // Keyed by the URL it was drawn for, so a new URL never shows the old QR
  // or the old failure, without resetting state inside the effect.
  const [drawn, setDrawn] = useState<{ url: string; src: string | null }>()
  useEffect(() => {
    let cancelled = false
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, { width: 352, margin: 1 }),
      )
      .then((src) => !cancelled && setDrawn({ url, src }))
      .catch(() => !cancelled && setDrawn({ url, src: null }))
    return () => {
      cancelled = true
    }
  }, [url])
  const src = drawn?.url === url ? drawn.src : undefined
  const failed = src === null
  return (
    <div className="size-44 shrink-0 rounded-md bg-white p-1 ring-1 ring-gray-200 dark:ring-gray-700">
      {src ? (
        <img
          src={src}
          alt="QR code for the feedback link below"
          className="size-full [image-rendering:pixelated]"
        />
      ) : failed ? (
        <p className="flex size-full items-center p-3 text-center text-sm text-gray-600">
          The QR code could not be drawn. Share the link instead.
        </p>
      ) : (
        <div className="size-full animate-pulse rounded bg-gray-100" />
      )}
    </div>
  )
}

function CopyLinkButton({ url }: { url: string }) {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null)
  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(null), 2500)
    return () => clearTimeout(timer)
  }, [result])
  return (
    <>
      <button
        type="button"
        onClick={() =>
          // `clipboard` is absent outside a secure context, and writeText can be
          // refused; either way the URL stays visible to copy by hand.
          Promise.resolve()
            .then(() => navigator.clipboard.writeText(url))
            .then(() => setResult('copied'))
            .catch(() => setResult('failed'))
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        {result === 'copied' ? (
          <CheckIcon className="size-4 text-green-600 dark:text-green-400" />
        ) : (
          <ClipboardDocumentIcon className="size-4" />
        )}
        {result === 'copied'
          ? 'Copied'
          : result === 'failed'
            ? 'Couldn’t copy; select the link above'
            : 'Copy link'}
      </button>
      {/* Outside the button, so its name stays its label; announces the
          outcome only, not the label coming back. */}
      <span className="sr-only" aria-live="polite">
        {result === 'copied'
          ? 'Link copied'
          : result === 'failed'
            ? 'Couldn’t copy the link'
            : ''}
      </span>
    </>
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
