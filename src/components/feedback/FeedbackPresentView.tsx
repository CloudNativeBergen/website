'use client'

import { useEffect, useRef } from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import {
  FEEDBACK_PROMPT,
  feedbackCodeDisplayUrl,
} from '@/lib/feedback/code-assets'
import { useFeedbackQrPng } from './useFeedbackQrPng'

/**
 * The Feedback Code on a projector (speaker feedback spec §9.2): the QR as
 * large as the screen allows, the short URL and the question, black on white
 * whatever the page's theme. A Headless UI dialog, so Tab stays inside, the
 * page behind does not scroll, and focus goes back to the Present button on
 * close. It fills the window on its own, and asks for full screen on top
 * where the browser allows it (iPhone Safari does not). Esc or the close
 * control ends it; so does leaving full screen, since the browser swallows
 * that Esc.
 */
export function FeedbackPresentView({
  url,
  onClose,
}: {
  url: string
  onClose: () => void
}) {
  const { src, failed } = useFeedbackQrPng(url, 1024)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    // The request settles after this effect; keep the promise so a close
    // before it settles still leaves full screen once it is entered.
    const entering =
      panel?.requestFullscreen?.().catch(() => {}) ?? Promise.resolve()
    const onFullscreen = () => {
      if (!document.fullscreenElement) onClose()
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      void entering.then(() => {
        if (panel && document.fullscreenElement === panel) {
          document.exitFullscreen().catch(() => {})
        }
      })
    }
  }, [onClose])

  return (
    <Dialog
      open
      onClose={onClose}
      initialFocus={closeButtonRef}
      aria-label="Feedback Code on screen"
      className="fixed inset-0 z-[100] bg-white text-black"
    >
      <DialogPanel
        ref={panelRef}
        className="flex size-full flex-col items-center justify-center gap-[4vmin] bg-white p-[4vmin] text-black"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-base font-medium text-gray-600 hover:bg-gray-100 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue"
        >
          <XMarkIcon className="size-6" aria-hidden="true" />
          Close
          <kbd className="ml-1 rounded border border-gray-300 px-1.5 font-mono text-sm">
            Esc
          </kbd>
        </button>
        <h1 className="text-center text-[clamp(1.75rem,6vmin,5rem)] leading-tight font-bold">
          {FEEDBACK_PROMPT}
        </h1>
        <div className="flex size-[min(62vh,86vw)] shrink-0 items-center justify-center">
          {src ? (
            <img
              src={src}
              alt="QR code for the feedback link"
              className="size-full [image-rendering:pixelated]"
            />
          ) : failed ? (
            <p className="text-center text-[clamp(1rem,3vmin,2rem)] text-gray-700">
              The QR code could not be drawn. Share the link instead.
            </p>
          ) : null}
        </div>
        <p className="max-w-full font-mono text-[clamp(1rem,4.5vmin,3.5rem)] leading-tight break-all">
          {feedbackCodeDisplayUrl(url)}
        </p>
      </DialogPanel>
    </Dialog>
  )
}
