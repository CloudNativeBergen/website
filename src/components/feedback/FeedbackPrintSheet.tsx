'use client'

import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  FEEDBACK_PROMPT,
  feedbackCodeDisplayUrl,
} from '@/lib/feedback/code-assets'
import { useFeedbackQrPng } from './useFeedbackQrPng'

/**
 * The sheet for the room (speaker feedback spec §9.2): the question, the
 * talk title, a large QR and the short URL. Black on white with no `dark:`
 * variant on purpose: it prints from whatever page it was opened on, in
 * either theme. The global print stylesheet hides inline SVG, so the QR is
 * an `<img>`. Sized to stay on ONE page of A4 or US Letter with a title of
 * up to four lines (clamped) even under a browser's default 10 mm margins:
 * 12 mm padding, a 140 mm QR and 6 mm gaps come to about 255 mm.
 */
export function FeedbackPrintSheet({
  title,
  url,
  qrSrc,
  onQrLoad,
}: {
  title: string
  url: string
  qrSrc: string
  onQrLoad?: () => void
}) {
  return (
    <div className="flex w-full break-inside-avoid flex-col items-center gap-[6mm] bg-white p-[12mm] text-center font-sans text-black">
      <h1 className="text-[36pt] leading-[1.15] font-bold">
        {FEEDBACK_PROMPT}
      </h1>
      <h2 className="line-clamp-4 text-[18pt] leading-[1.3] font-medium [overflow-wrap:anywhere]">
        {title}
      </h2>
      <img
        src={qrSrc}
        onLoad={onQrLoad}
        alt="QR code for the feedback link"
        className="h-auto w-[140mm] max-w-full [image-rendering:pixelated]"
      />
      <p className="font-mono text-[20pt] [overflow-wrap:anywhere]">
        {feedbackCodeDisplayUrl(url)}
      </p>
      <p className="text-[13pt] text-gray-600">
        Scan to answer in one tap. It&apos;s anonymous.
      </p>
    </div>
  )
}

const AFTERPRINT_FALLBACK_MS = 2 * 60_000

/**
 * Prints the sheet from the page the speaker is on. It is mounted into
 * `<body>` hidden on screen, and the print stylesheet (`tailwind.css`) shows
 * it alone while it is there. `window.print()` runs once the QR has loaded,
 * and the sheet leaves with `afterprint`, or after two minutes where that
 * never fires (iOS Safari), so a later Cmd+P prints the page again. The
 * `@page` rule travels with the sheet: no browser header or footer, and the
 * sheet's own padding is the margin.
 */
export function FeedbackPrintSheetPortal({
  title,
  url,
  onDone,
  onFailed,
}: {
  title: string
  url: string
  onDone: () => void
  onFailed: () => void
}) {
  const { src, failed } = useFeedbackQrPng(url, 1024)
  const printed = useRef(false)
  useEffect(() => {
    if (failed) onFailed()
  }, [failed, onFailed])
  useEffect(() => {
    window.addEventListener('afterprint', onDone)
    return () => window.removeEventListener('afterprint', onDone)
  }, [onDone])
  const sheet = useRef<HTMLDivElement>(null)
  const print = useCallback(() => {
    if (printed.current) return
    printed.current = true
    window.print()
  }, [])
  // iOS Safari may never fire `afterprint`: let go of the sheet eventually.
  useEffect(() => {
    const timer = setTimeout(onDone, AFTERPRINT_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [onDone])
  // A data URL can be complete before React wires `onLoad`.
  useEffect(() => {
    const img = sheet.current?.querySelector('img')
    if (img?.complete && img.naturalWidth > 0) print()
  }, [src, print])
  if (!src) return null
  return createPortal(
    <div ref={sheet} data-feedback-print="" className="hidden print:block">
      <style>{'@page { size: auto; margin: 0; }'}</style>
      <FeedbackPrintSheet
        title={title}
        url={url}
        qrSrc={src}
        onQrLoad={print}
      />
    </div>,
    document.body,
  )
}
