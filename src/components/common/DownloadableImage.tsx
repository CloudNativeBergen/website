'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline'
import {
  captureImage,
  useGallerySave,
  useImageAttachment,
  useStudioFormat,
  type StudioCard,
} from './image-capture'
import { STUDIO_FORMATS } from '@/lib/marketing-asset'

interface DownloadableImageProps {
  filename?: string
  /**
   * The studio card this is, for "Save to gallery". Shown only inside the
   * studio's gallery provider.
   */
  studio?: StudioCard
  children: React.ReactNode
}

export function DownloadableImage({
  filename = 'speaker-image',
  studio,
  children,
}: DownloadableImageProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const componentRef = useRef<HTMLDivElement>(null)

  const attachment = useImageAttachment()
  const gallery = useGallerySave()
  const busy = isDownloading || Boolean(attachment?.busy || gallery?.busy)
  // On a tab with a Format switch, every capture is the Format shown, at
  // exactly its pixels (docs/MARKETING_STUDIO_FORMATS_SPEC.md §4); elsewhere
  // a capture is 4× the CSS box, as it always was.
  const format = useStudioFormat()
  const size = format ? STUDIO_FORMATS[format] : undefined
  // The switch stays live while a capture waits for images: a card that
  // changed shape underneath the render would be stretched to the old
  // Format and saved under its name. Refuse it instead.
  const shown = useRef(format)
  useEffect(() => {
    shown.current = format
  }, [format])
  const capture = async (element: HTMLElement) => {
    const blob = await captureImage(element, size)
    if (shown.current !== format)
      throw new Error(
        'The Format changed while the image was being made. Try again.',
      )
    return blob
  }
  const card: StudioCard | undefined =
    studio && format ? { ...studio, format } : studio
  // The same name for a download, a Task attachment and a gallery save.
  const name = format ? `${filename}-${format}` : filename

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
      const blob = await capture(element)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      try {
        link.href = url
        link.download = `${name}-${Date.now()}.png`
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
          disabled={busy}
          className="font-inter inline-flex items-center space-x-2 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-md disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          <span>{isDownloading ? 'Generating...' : 'Download as PNG'}</span>
        </button>
        {attachment && (
          <button
            onClick={() =>
              attachment.attach(() => capture(componentRef.current!), name)
            }
            disabled={busy}
            className="inline-flex items-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50 dark:text-blue-300"
          >
            {attachment.busy ? 'Attaching…' : 'Attach to Task'}
          </button>
        )}
        {gallery && card && (
          <button
            onClick={() =>
              gallery.save(() => capture(componentRef.current!), name, card)
            }
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <RectangleStackIcon className="size-4" aria-hidden />
            <span>Save to gallery</span>
          </button>
        )}
      </div>
    </div>
  )
}
