'use client'

import { useState, useRef } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import html2canvas from 'html2canvas-pro'

interface DownloadSpeakerImageProps {
  filename?: string
  children: React.ReactNode
}

/**
 * Component that wraps speaker promotion cards with download functionality
 * Uses html2canvas-pro for better CSS and modern web feature support
 */
export function DownloadSpeakerImage({
  filename = 'speaker-image',
  children,
}: DownloadSpeakerImageProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const componentRef = useRef<HTMLDivElement>(null)

  /**
   * Wait for all images in the component to load
   */
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
              resolve() // Continue even if image fails
            }
            // Timeout after 3 seconds per image
            setTimeout(resolve, 3000)
          }
        })
      }),
    )
  }

  /**
   * Generate canvas from element using html2canvas-pro
   */
  const generateCanvas = async (
    element: HTMLElement,
  ): Promise<HTMLCanvasElement> => {
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: false,
      removeContainer: false,
      imageTimeout: 10000,
      onclone: (clonedDoc: Document) => {
        // Ensure QR code elements are visible
        const qrElements = clonedDoc.querySelectorAll('[data-qr-code]')
        qrElements.forEach((el: Element) => {
          if (el instanceof HTMLElement) {
            el.style.opacity = '1'
            el.style.visibility = 'visible'
          }
        })

        // Set CORS for external images
        const images = clonedDoc.querySelectorAll('img')
        images.forEach((img: HTMLImageElement) => {
          if (!img.src.startsWith('data:')) {
            img.crossOrigin = 'anonymous'
          }
        })
      },
    })

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Generated canvas has zero dimensions')
    }

    return canvas
  }

  /**
   * Convert canvas to blob and trigger download
   */
  const downloadCanvas = async (canvas: HTMLCanvasElement): Promise<void> => {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob: Blob | null) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to create blob from canvas'))
          }
        },
        'image/png',
        1.0,
      )
    })

    // Create and trigger download
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const fileName = `${filename}.png`

    link.href = url
    link.download = fileName
    link.style.display = 'none'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  /**
   * Main download handler
   */
  const downloadAsImage = async () => {
    if (!componentRef.current) {
      console.error('Component ref not available')
      alert('Component not ready. Please try again.')
      return
    }

    const element = componentRef.current

    // Validate element has dimensions
    if (element.offsetWidth === 0 || element.offsetHeight === 0) {
      console.error('Element has zero dimensions')
      alert(
        'Cannot capture invisible element. Please ensure the component is visible.',
      )
      return
    }

    setIsDownloading(true)

    try {
      // Wait for all content to load (especially QR codes)
      await waitForImages(element)

      // Generate the canvas
      const canvas = await generateCanvas(element)

      // Download the image
      await downloadCanvas(canvas)
    } catch (error) {
      console.error('Download failed:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to generate image: ${message}`)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="relative">
      <div ref={componentRef} className="inline-block">
        {children}
      </div>

      {/* Download Button */}
      <div className="mt-4 flex justify-center">
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
