'use client'

import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  FEEDBACK_PROMPT,
  feedbackCodeDisplayUrl,
} from '@/lib/feedback/code-assets'
import { useFeedbackQrPng } from './useFeedbackQrPng'

/**
 * The A4 sheet for the room (speaker feedback spec §9.2): the question, the
 * talk title, a large QR and the short URL. Styled inline and black on
 * white on purpose: it prints from whatever page it was opened on, in either
 * theme, and the global print stylesheet forces text black and hides inline
 * SVG, so the QR is an `<img>`.
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
  const text: CSSProperties = {
    color: '#000',
    fontFamily: 'system-ui, sans-serif',
    margin: 0,
    textAlign: 'center',
  }
  return (
    <div
      style={{
        background: '#fff',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8mm',
        padding: '12mm',
        width: '100%',
        minHeight: '100%',
        breakInside: 'avoid',
      }}
    >
      <h1 style={{ ...text, fontSize: '36pt', lineHeight: 1.15 }}>
        {FEEDBACK_PROMPT}
      </h1>
      <h2
        style={{
          ...text,
          fontSize: '18pt',
          fontWeight: 500,
          lineHeight: 1.3,
          overflowWrap: 'anywhere',
        }}
      >
        {title}
      </h2>
      <img
        src={qrSrc}
        onLoad={onQrLoad}
        alt="QR code for the feedback link"
        style={{
          width: '150mm',
          maxWidth: '100%',
          height: 'auto',
          imageRendering: 'pixelated',
        }}
      />
      <p
        style={{
          ...text,
          fontFamily: 'ui-monospace, monospace',
          fontSize: '20pt',
          overflowWrap: 'anywhere',
        }}
      >
        {feedbackCodeDisplayUrl(url)}
      </p>
      <p style={{ ...text, fontSize: '13pt', color: '#444' }}>
        Scan to answer in one tap. It&apos;s anonymous.
      </p>
    </div>
  )
}

/**
 * Prints the sheet from the page the speaker is on. It is mounted into
 * `<body>` hidden on screen, and the print stylesheet (`tailwind.css`) shows
 * it alone while it is there. `window.print()` runs once the QR has loaded,
 * and the sheet leaves with `afterprint`.
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
  // A data URL can be complete before React wires `onLoad`.
  useEffect(() => {
    const img = sheet.current?.querySelector('img')
    if (img?.complete && img.naturalWidth > 0) print()
  }, [src, print])
  if (!src) return null
  return createPortal(
    <div ref={sheet} data-feedback-print="" className="hidden print:block">
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
