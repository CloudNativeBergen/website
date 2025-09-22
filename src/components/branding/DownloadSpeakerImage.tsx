'use client'

import { useState, useRef } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import html2canvas from 'html2canvas-pro'

interface DownloadSpeakerImageProps {
  filename?: string
  children: React.ReactNode
}

export function DownloadSpeakerImage({
  filename = 'speaker-image',
  children,
}: DownloadSpeakerImageProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const componentRef = useRef<HTMLDivElement>(null)

  const waitForImages = async (element: HTMLElement): Promise<void> => {
    const images = element.querySelectorAll('img')
    if (images.length === 0) return

    await Promise.all(
      Array.from(images).map((img) => {
        return new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
          } else {
            img.onload = () => resolve()
            img.onerror = () => {
              console.warn('Image failed to load:', img.src.substring(0, 100))
              resolve()
            }

            setTimeout(resolve, 3000)
          }
        })
      }),
    )
  }

  const updateImageSources = async (element: HTMLElement): Promise<void> => {
    const images = element.querySelectorAll('img')
    const externalImages = Array.from(images).filter(
      (img) =>
        !img.src.startsWith('data:') &&
        !img.src.includes(window.location.hostname),
    )

    externalImages.forEach((img) => {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(img.src)}`
      img.src = proxyUrl
    })

    if (externalImages.length > 0) {
      await waitForImages(element)
    }
  }

  const generateCanvas = async (
    element: HTMLElement,
  ): Promise<HTMLCanvasElement> => {
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: 4,
      useCORS: true,
      allowTaint: false,
      removeContainer: false,
      imageTimeout: 12000,
      width: element.offsetWidth,
      height: element.offsetHeight,
      logging: false,
      onclone: (clonedDoc: Document) => {
        const qrElements = clonedDoc.querySelectorAll('[data-qr-code]')
        qrElements.forEach((el: Element) => {
          if (el instanceof HTMLElement) {
            el.style.opacity = '1'
            el.style.visibility = 'visible'
            el.style.display = 'block'
          }
        })

        const textElements = clonedDoc.querySelectorAll(
          'h1, h2, h3, p, span, div',
        )
        textElements.forEach((el: Element) => {
          if (el instanceof HTMLElement) {
            el.style.color = el.style.color || 'inherit'
          }
        })
      },
    })

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Generated canvas has zero dimensions')
    }

    return canvas
  }

  const downloadCanvas = async (canvas: HTMLCanvasElement): Promise<void> => {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob: Blob | null) => {
          if (!blob) {
            reject(new Error('Failed to create blob from canvas'))
            return
          }

          let url: string | null = null
          try {
            url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            const fileName = `${filename}-${Date.now()}.png`

            link.href = url
            link.download = fileName
            link.style.display = 'none'

            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)

            setTimeout(() => {
              if (url) URL.revokeObjectURL(url)
              resolve()
            }, 100)
          } catch (error) {
            if (url) URL.revokeObjectURL(url)
            reject(error)
          }
        },
        'image/png',
        1.0,
      )
    })
  }

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
      await waitForImages(element)

      await updateImageSources(element)

      await new Promise((resolve) => setTimeout(resolve, 300))

      const canvas = await generateCanvas(element)

      await downloadCanvas(canvas)

      canvas.width = 0
      canvas.height = 0
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

      <div className="mt-4">
        <button
          onClick={downloadAsImage}
          disabled={isDownloading}
          className="font-inter inline-flex items-center space-x-2 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-md disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          <span>{isDownloading ? 'Generating...' : 'Download as PNG'}</span>
        </button>
      </div>
    </div>
  )
}
