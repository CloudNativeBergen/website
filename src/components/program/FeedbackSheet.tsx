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

/**
 * The programme's feedback sheet (speaker feedback spec §7.5): a bottom sheet
 * that FRAMES the attendee page rather than rendering it, so the code stays
 * out of the programme's document, URL and history, and the page keeps its
 * own cookie path, actions and analytics exclusions (§7.1).
 *
 * The frame is mounted per open: a reused iframe given a new `src` would add a
 * history entry, and Back would step the frame instead of leaving the page.
 * Same origin, so the sheet sizes the frame to the page's content and hears
 * Escape pressed inside it.
 */
export function FeedbackSheet({
  open,
  onClose,
  src,
  title,
}: {
  open: boolean
  onClose: () => void
  src: string
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
            <FeedbackFrame src={src} title={title} onEscape={onClose} />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

/** Until the page has loaded and been measured. */
const LOADING_HEIGHT = 320

function FeedbackFrame({
  src,
  title,
  onEscape,
}: {
  src: string
  title: string
  onEscape: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(0)
  // Read at keypress: a new `onEscape` each render must not re-attach.
  const escape = useRef(onEscape)
  useEffect(() => {
    escape.current = onEscape
  })

  useEffect(() => {
    const win = frame.current?.contentWindow
    const doc = frame.current?.contentDocument
    if (!loaded || !win || !doc) return
    // The page's own root when it rendered; the body for anything else (the
    // route's plain-text 503).
    const root = doc.querySelector(`[${FEEDBACK_EMBED_ROOT}]`) ?? doc.body
    if (!root) return
    const measure = () => setHeight(Math.ceil(root.scrollHeight))
    measure()
    // The frame's own constructor: it observes the frame's document.
    const observer = new (win as Window & typeof globalThis).ResizeObserver(
      measure,
    )
    observer.observe(root)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') escape.current()
    }
    win.addEventListener('keydown', onKey)
    return () => {
      observer.disconnect()
      win.removeEventListener('keydown', onKey)
    }
  }, [loaded])

  return (
    <div className="relative">
      {height === null && (
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
        className={clsx(
          'block w-full border-0',
          height === null && 'opacity-0',
        )}
      />
    </div>
  )
}
