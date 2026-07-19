'use client'

import { useState } from 'react'
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@heroicons/react/24/outline'
import { ExpenseReceipt } from '@/lib/travel-support/types'
import { ModalShell } from '@/components/ModalShell'

// Shared classes for the toolbar controls — 44×44 minimum tap target.
const controlButton =
  'inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800'

interface ReceiptViewerProps {
  receipt: ExpenseReceipt
  receiptIndex: number
  onClose: () => void
}

export function ReceiptViewer({
  receipt,
  receiptIndex,
  onClose,
}: ReceiptViewerProps) {
  const [zoom, setZoom] = useState(100)

  const fileUrl = receipt.url
  if (!fileUrl) {
    return null
  }

  // Check if it's an image based on file extension or MIME type
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(receipt.filename)

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50))

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = receipt.filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const label = receipt.filename || `Receipt ${receiptIndex + 1}`

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      size="4xl"
      // A document/image viewer wants the same full-height centered card at every
      // width — a bottom-sheet would crop the receipt and fight the zoom/scroll —
      // so it opts out of the default mobile sheet presentation.
      presentation="centered"
      padded={false}
      ariaLabel={`Receipt: ${label}`}
      className="overflow-hidden"
    >
      <div className="flex h-[85vh] flex-col">
        {/* Custom 5-control toolbar (title + zoom out/in + download + close) — too
          many actions for the shell's standard single-close header, so the
          dialog takes its accessible name from `ariaLabel` above instead. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="min-w-0 truncate text-lg font-semibold text-gray-900 dark:text-white">
            {label}
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            {isImage && (
              <>
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                  className={controlButton}
                  aria-label="Zoom out"
                  title="Zoom out"
                >
                  <MagnifyingGlassMinusIcon className="h-5 w-5" />
                </button>
                <span className="min-w-14 text-center text-sm text-gray-600 dark:text-gray-300">
                  {zoom}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= 200}
                  className={controlButton}
                  aria-label="Zoom in"
                  title="Zoom in"
                >
                  <MagnifyingGlassPlusIcon className="h-5 w-5" />
                </button>
                <div className="mx-1 h-6 w-px bg-gray-300 dark:bg-gray-600" />
              </>
            )}
            <button
              onClick={handleDownload}
              className={controlButton}
              aria-label="Download receipt"
              title="Download receipt"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className={controlButton}
              aria-label="Close"
              title="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-auto bg-gray-50 p-4 dark:bg-gray-800">
          {isImage ? (
            <div className="flex min-h-full items-center justify-center">
              <img
                src={fileUrl}
                alt={label}
                className="max-h-full max-w-full rounded-lg shadow-lg transition-transform duration-200"
                style={{ transform: `scale(${zoom / 100})` }}
              />
            </div>
          ) : (
            <iframe
              src={fileUrl}
              title={label}
              className="h-full w-full rounded-lg shadow-lg"
            />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Uploaded on {new Date(receipt.uploadedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </ModalShell>
  )
}
