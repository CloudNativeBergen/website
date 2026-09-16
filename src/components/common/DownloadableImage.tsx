'use client'

import { useState, useRef } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { captureImage, useImageAttachment } from './image-capture'

interface DownloadableImageProps {
  filename?: string
  children: React.ReactNode
}

export function DownloadableImage({
  filename = 'speaker-image',
  children,
}: DownloadableImageProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const componentRef = useRef<HTMLDivElement>(null)

  const attachment = useImageAttachment()

  const downloadAsImage = async () => {
    if (!componentRef.current) {
      console.error('Component ref not available')
      alert('Component not ready. Please try again.')
      return
    }

    const element = componentRef.current

    if (element.offsetWidth === 0 || element.offsetHeight === 0) {
      console.error('Element has zero dimensions')
      alert(
        'Cannot capture invisible element. Please ensure the component is visible.',
      )
      return
    }

    setIsDownloading(true)

    try {
      const blob = await captureImage(element)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      try {
        link.href = url
        link.download = `${filename}-${Date.now()}.png`
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        await new Promise((resolve) => setTimeout(resolve, 100))
      } finally {
        link.remove()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Download failed:', error)

      let message = 'Failed to generate image. Please try again.'

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          message =
            'Image generation timed out. Please check your connection and try again.'
        } else if (error.message.includes('dimensions')) {
          message =
            'Unable to capture the image. Please ensure the content is visible.'
        } else if (error.message.includes('network')) {
          message =
            'Network error occurred. Please check your connection and try again.'
        } else if (
          error.message.includes('401') ||
          error.message.includes('Authentication')
        ) {
          message =
            'Authentication required. Please sign in again and try downloading your speaker card.'
        }
      }

      alert(message)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div ref={componentRef} className="inline-block">
        {children}
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          onClick={downloadAsImage}
          disabled={isDownloading || attachment?.busy}
          className="font-inter inline-flex items-center space-x-2 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-md disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          <span>{isDownloading ? 'Generating...' : 'Download as PNG'}</span>
        </button>
        {attachment && (
          <button
            onClick={() =>
              attachment.attach(
                () => captureImage(componentRef.current!),
                filename,
              )
            }
            disabled={isDownloading || attachment.busy}
            className="inline-flex items-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50 dark:text-blue-300"
          >
            {attachment.busy ? 'Attaching…' : 'Attach to Task'}
          </button>
        )}
      </div>
    </div>
  )
}
