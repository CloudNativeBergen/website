'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  ArrowDownTrayIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  PhotoIcon,
  PresentationChartBarIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline'
import type { FeedbackWindow } from '@/lib/feedback'
import {
  feedbackCodeDisplayUrl,
  feedbackCodeFileName,
  renderFeedbackQrPng,
  renderFeedbackQrSvg,
} from '@/lib/feedback/code-assets'
import { formatRegistrationInstant } from '@/lib/time'
import { FeedbackPresentView } from './FeedbackPresentView'
import { FeedbackPrintSheetPortal } from './FeedbackPrintSheet'
import { useFeedbackQrPng } from './useFeedbackQrPng'

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-white dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:aria-disabled:hover:bg-gray-800'

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
  // Drawn exactly as the downloads are, quiet zone and all, so the speaker
  // sees what they will get.
  const { src, failed } = useFeedbackQrPng(url, 352)
  return (
    <div className="size-44 shrink-0 rounded-md bg-white ring-1 ring-gray-200 dark:ring-gray-700">
      {src ? (
        <img
          src={src}
          alt="QR code for the feedback link"
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
  // "Copied" fades; the failure stays, since it tells the speaker what to do.
  useEffect(() => {
    if (result !== 'copied') return
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
        className={BUTTON}
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
 * The URL as the room reads it, without the scheme, and never broken inside
 * the code: a phone may wrap it, but only after a `/`, so `k7m2qx` stays one
 * piece. `overflow-wrap: anywhere` is the last resort for a host too long
 * for any line. Copy link still copies the full `https://` URL.
 */
function DisplayUrl({ url }: { url: string }) {
  const parts = feedbackCodeDisplayUrl(url).split('/')
  return (
    <p className="font-mono text-xs [overflow-wrap:anywhere] text-gray-700 sm:text-sm dark:text-gray-300">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              /<wbr />
            </>
          )}
          {part}
        </Fragment>
      ))}
    </p>
  )
}

/** Hand the browser a file to save. */
function saveFile(name: string, href: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * PNG for slides, SVG, Print sheet and Present (speaker feedback spec §9.2).
 * The files are drawn on the spot from the URL; nothing is fetched. A URL
 * no QR can hold fails every one of them the same way, and says so.
 */
function CodeActions({ url, title }: { url: string; title: string }) {
  const [failed, setFailed] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const fail = useCallback(() => {
    setFailed(true)
    setPrinting(false)
  }, [])
  const stopPresenting = useCallback(() => setPresenting(false), [])
  const stopPrinting = useCallback(() => setPrinting(false), [])

  const save = (ext: 'png' | 'svg', href: string) => {
    setFailed(false)
    saveFile(feedbackCodeFileName(url, title, ext), href)
  }
  const downloadPng = () =>
    renderFeedbackQrPng(url)
      .then((dataUrl) => save('png', dataUrl))
      .catch(fail)
  const downloadSvg = () =>
    renderFeedbackQrSvg(url)
      .then((svg) => {
        const href = URL.createObjectURL(
          new Blob([svg], { type: 'image/svg+xml' }),
        )
        save('svg', href)
        // Safari reads the blob after the click returns: revoke it later.
        setTimeout(() => URL.revokeObjectURL(href), 1000)
      })
      .catch(fail)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={downloadPng}>
          <PhotoIcon className="size-4" aria-hidden="true" />
          PNG for slides
        </button>
        <button type="button" className={BUTTON} onClick={downloadSvg}>
          <ArrowDownTrayIcon className="size-4" aria-hidden="true" />
          SVG
        </button>
        <button
          type="button"
          className={BUTTON}
          // Not `disabled`: that would drop focus from the button that was
          // just pressed. It just refuses a second press while printing.
          aria-disabled={printing}
          onClick={() => {
            if (printing) return
            setFailed(false)
            setPrinting(true)
          }}
        >
          <PrinterIcon className="size-4" aria-hidden="true" />
          Print sheet
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => setPresenting(true)}
        >
          <PresentationChartBarIcon className="size-4" aria-hidden="true" />
          Present
        </button>
        <CopyLinkButton url={url} />
      </div>
      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          The QR code could not be drawn. Share the link instead.
        </p>
      )}
      {presenting && <FeedbackPresentView url={url} onClose={stopPresenting} />}
      {printing && (
        <FeedbackPrintSheetPortal
          url={url}
          title={title}
          onDone={stopPrinting}
          onFailed={fail}
        />
      )}
    </>
  )
}

/**
 * The Feedback Code tab (speaker feedback spec §9.2): the QR code for the
 * attendee URL, its state, the downloads, Print sheet, Present and Copy link.
 */
export function FeedbackCodePanel({
  url,
  title,
  window,
}: {
  url: string
  /** The talk's title, for the print sheet and the file names. */
  title: string
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
        <DisplayUrl url={url} />
        <CodeActions url={url} title={title} />
      </div>
    </div>
  )
}
