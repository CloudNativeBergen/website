'use client'

import { useState } from 'react'
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@heroicons/react/24/outline'
import { ExpenseReceipt } from '@/lib/travel-support/types'

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {receipt.filename || `Receipt ${receiptIndex + 1}`}
          </h3>
          <div className="flex items-center gap-2">
            {isImage && (
              <>
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                  className="rounded-md p-2 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
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
                  className="rounded-md p-2 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  title="Zoom in"
                >
                  <MagnifyingGlassPlusIcon className="h-5 w-5" />
                </button>
                <div className="mx-2 h-6 w-px bg-gray-300 dark:bg-gray-600" />
              </>
            )}
            <button
              onClick={handleDownload}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              title="Download receipt"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
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
                alt={receipt.filename || `Receipt ${receiptIndex + 1}`}
                className="max-h-full max-w-full rounded-lg shadow-lg transition-transform duration-200"
                style={{ transform: `scale(${zoom / 100})` }}
              />
            </div>
          ) : (
            <iframe
              src={fileUrl}
              title={receipt.filename || `Receipt ${receiptIndex + 1}`}
              className="h-full w-full rounded-lg shadow-lg"
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Uploaded on {new Date(receipt.uploadedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  )
}
