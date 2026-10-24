'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { FEEDBACK_EMBED_ROOT } from '@/lib/feedback/url'

/** Marks the history entry an open sheet added (§7.5). */
const SHEET_ENTRY = 'feedbackSheet'

/**
 * The sheet's open state, backed by one history entry so Back (and a mobile
 * swipe-back) closes it instead of leaving the programme (§7.5). The entry
 * keeps the page's URL; Next copies its own router state into it, so Back
 * lands on an entry it knows. Closing in the sheet steps back over the entry,
 * and the `popstate` that follows closes it, so no entry is left behind.
 */
export function useFeedbackSheet() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onPop = () => setOpen(false)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [open])

  return {
    open,
    show: () => {
      window.history.pushState({ [SHEET_ENTRY]: true }, '')
      setOpen(true)
    },
    close: () => {
      if (window.history.state?.[SHEET_ENTRY]) window.history.back()
      else setOpen(false)
    },
  }
}

/**
 * The programme's feedback sheet (speaker feedback spec §7.5): a bottom sheet
 * that FRAMES the attendee page rather than rendering it, so the code stays
 * out of the programme's document, URL and history, and the page keeps its
 * own cookie path, actions and analytics exclusions (§7.1).
 *
 * The frame is mounted per open: a reused iframe given a new `src` would add a
 * history entry, and Back would step the frame instead of leaving the page.
 * Same origin, so the sheet sizes the frame to the page's content and hears
 * Escape pressed inside it. A frame that is not an HTML page, or shows no
 * attendee page within `FRAME_TIMEOUT_MS`, gets a link to the full page.
 */
export function FeedbackSheet({
  open,
  onClose,
  src,
  href,
  title,
}: {
  open: boolean
  onClose: () => void
  /** The framed page: `/program/<talkId>/feedback?embed=1`. */
  src: string
  /** The full page, offered when the frame does not show it. */
  href: string
  /** The talk's title, naming the frame. */
  title: string
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/40 transition duration-300 data-closed:opacity-0"
      />
      <div className="fixed inset-x-0 bottom-0 flex justify-center">
        <DialogPanel
          transition
          className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl transition duration-300 ease-out data-closed:translate-y-full dark:bg-gray-950"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="flex shrink-0 items-center justify-between px-4 pt-1">
            <DialogTitle className="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Session feedback
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex size-11 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-brand-cloud-blue dark:hover:bg-gray-800 dark:hover:text-gray-200 dark:focus-visible:outline-blue-400"
            >
              <XMarkIcon className="size-6" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            <FeedbackFrame
              src={src}
              href={href}
              title={title}
              onEscape={onClose}
            />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

/** Until the page has loaded and been measured. */
const LOADING_HEIGHT = 320

/**
 * How long the sheet waits for the attendee page before offering the full
 * page instead: a frame that never loads (a dropped venue network) fires no
 * error event, and the browser's own error page is not ours to read.
 */
export const FRAME_TIMEOUT_MS = 15_000

function FeedbackFrame({
  src,
  href,
  title,
  onEscape,
}: {
  src: string
  href: string
  title: string
  onEscape: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(0)
  // Read at keypress: a new `onEscape` each render must not re-attach.
  const escape = useRef(onEscape)
  useEffect(() => {
    escape.current = onEscape
  })

  const shown = height !== null
  useEffect(() => {
    if (shown) return
    const timer = setTimeout(() => setFailed(true), FRAME_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [shown])

  useEffect(() => {
    if (!loaded) return
    const win = frame.current?.contentWindow
    // Null for a cross-origin document (a browser error page), whose
    // `location` would throw on read.
    const doc = frame.current?.contentDocument
    // Some engines fire a load for the frame's initial blank document.
    if (doc?.URL === 'about:blank') return
    // Not a page of ours (the route's plain-text 503, a browser error page).
    if (!win || !doc || doc.contentType !== 'text/html') {
      setFailed(true)
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') escape.current()
    }
    win.addEventListener('keydown', onKey)

    // The frame's own constructors: they observe the frame's document.
    const frameWindow = win as Window & typeof globalThis
    let observer: ResizeObserver | undefined
    const show = (root: Element) => {
      const measure = () => setHeight(Math.ceil(root.scrollHeight))
      measure()
      observer = new frameWindow.ResizeObserver(measure)
      observer.observe(root)
    }
    // Only the attendee page marks its content; any other page never shows,
    // and `FRAME_TIMEOUT_MS` offers the full page instead.
    const find = () => doc.querySelector(`[${FEEDBACK_EMBED_ROOT}]`)
    const root = find()
    const waiting = root
      ? undefined
      : new frameWindow.MutationObserver(() => {
          const found = find()
          if (!found) return
          waiting?.disconnect()
          show(found)
        })
    if (root) show(root)
    else waiting?.observe(doc, { childList: true, subtree: true })

    return () => {
      waiting?.disconnect()
      observer?.disconnect()
      win.removeEventListener('keydown', onKey)
    }
  }, [loaded])

  if (failed) {
    return (
      <div role="alert" className="px-4 pt-6 pb-10 text-center">
        <p className="font-semibold text-gray-900 dark:text-white">
          Feedback couldn&apos;t be loaded here
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Check your connection, or open the feedback page instead.
        </p>
        <a
          href={href}
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand-cloud-blue px-4 text-sm font-semibold text-white hover:bg-brand-cloud-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:bg-blue-500 dark:hover:bg-blue-400"
        >
          Open the feedback page
        </a>
      </div>
    )
  }

  return (
    <div className="relative">
      {!shown && (
        <p
          role="status"
          className="absolute inset-x-0 top-16 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          Loading&hellip;
        </p>
      )}
      <iframe
        ref={frame}
        src={src}
        title={`Feedback on ${title}`}
        onLoad={() => setLoaded((n) => n + 1)}
        style={{ height: height ?? LOADING_HEIGHT }}
        className={clsx('block w-full border-0', !shown && 'opacity-0')}
      />
    </div>
  )
}
