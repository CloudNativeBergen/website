'use client'

import { useState, useRef } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { LinkedInIcon, BlueskyIcon } from '@/components/SocialIcons'
import html2canvas from 'html2canvas-pro'

interface SpeakerSharingActionsProps {
  filename?: string
  speakerUrl: string
  talkTitle: string
  eventName: string
  children: React.ReactNode
}

/**
 * Component that wraps speaker promotion cards with download and social sharing functionality
 */
export function SpeakerSharingActions({
  filename = 'speaker-image',
  speakerUrl,
  talkTitle,
  eventName,
  children,
}: SpeakerSharingActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const componentRef = useRef<HTMLDivElement>(null)

  /**
   * Generate random share text options
   */
  const getRandomShareText = () => {
    const shareTexts = [
      `Ready to deploy my talk "${talkTitle}" to ${eventName}! 🚀 No rollbacks needed - this one's production-ready`,
      `Git commit -m "Speaking at ${eventName} about ${talkTitle}" - definitely not pushing to master without testing first 😅`,
      `kubectl apply -f "${talkTitle}" at ${eventName}! Hope my demo gods are feeling merciful 🙏`,
      `Scaling up my speaking game at ${eventName} with "${talkTitle}" - auto-scaling set to 11! 📈`,
      `Debugging life one talk at a time: presenting "${talkTitle}" at ${eventName}. Stack traces welcome! 🐛`,
      `Containerizing my thoughts on "${talkTitle}" for ${eventName} - no sidecar containers needed, just coffee ☕`,
      `Pushing my "${talkTitle}" pipeline to production at ${eventName} - CI/CD approved! ✅`,
      `Creating a new namespace for "${talkTitle}" at ${eventName} - resource limits set to unlimited curiosity 🤓`,
    ]

    return shareTexts[Math.floor(Math.random() * shareTexts.length)]
  }

  /**
   * Generate LinkedIn share URL
   */
  const getLinkedInShareUrl = () => {
    const params = new URLSearchParams({
      url: speakerUrl,
    })
    return `https://www.linkedin.com/sharing/share-offsite/?${params.toString()}`
  }

  /**
   * Generate Bluesky share URL
   */
  const getBlueskyShareUrl = () => {
    const shareText = `${getRandomShareText()}\n\n${speakerUrl}`
    const params = new URLSearchParams({
      text: shareText,
    })
    return `https://bsky.app/intent/compose?${params.toString()}`
  }

  /**
   * Open share URL in new window
   */
  const handleShare = (url: string) => {
    window.open(url, '_blank', 'width=600,height=400')
  }

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
            img.onerror = () => resolve() // Continue even if image fails
            // Timeout after 3 seconds per image
            setTimeout(resolve, 3000)
          }
        })
      }),
    )
  }

  /**
   * Convert external images to data URLs to avoid CORS issues
   */
  const convertImagesToDataUrls = async (
    element: HTMLElement,
  ): Promise<void> => {
    const images = element.querySelectorAll('img')
    const externalImages = Array.from(images).filter(
      (img) =>
        !img.src.startsWith('data:') &&
        !img.src.includes(window.location.hostname),
    )

    if (externalImages.length === 0) return

    // Process images in parallel for better performance
    await Promise.all(
      externalImages.map(async (img) => {
        try {
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(img.src)}`

          const response = await fetch(proxyUrl, {
            signal: AbortSignal.timeout(8000), // 8 second timeout
          })

          if (!response.ok) {
            console.warn(
              `Failed to proxy image: ${response.status} ${response.statusText}`,
            )
            return
          }

          const blob = await response.blob()

          // Verify it's actually an image
          if (!blob.type.startsWith('image/')) {
            console.warn('Proxied resource is not an image:', blob.type)
            return
          }

          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })

          img.src = dataUrl
        } catch (error) {
          console.warn('Failed to convert image to data URL:', img.src, error)
        }
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
      imageTimeout: 8000, // Reduced timeout for better UX
      width: element.offsetWidth,
      height: element.offsetHeight,
      logging: false, // Disable logging in production
      onclone: (clonedDoc: Document) => {
        // Ensure QR code elements are visible in the cloned document
        const qrElements = clonedDoc.querySelectorAll('[data-qr-code]')
        qrElements.forEach((el: Element) => {
          if (el instanceof HTMLElement) {
            el.style.opacity = '1'
            el.style.visibility = 'visible'
            el.style.display = 'block'
          }
        })

        // Ensure all text is visible and properly styled
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

  /**
   * Convert canvas to blob and trigger download
   */
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
            // Create download link
            url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            const fileName = `${filename}-${Date.now()}.png`

            link.href = url
            link.download = fileName
            link.style.display = 'none'

            // Trigger download
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)

            // Clean up memory
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
        0.95, // Slightly compress for smaller file size
      )
    })
  }

  /**
   * Main download handler with comprehensive error handling and optimization
   */
  const downloadAsImage = async () => {
    if (!componentRef.current) {
      alert('Component not ready. Please try again.')
      return
    }

    const element = componentRef.current

    // Validate element has dimensions
    if (element.offsetWidth === 0 || element.offsetHeight === 0) {
      alert(
        'Cannot capture invisible element. Please ensure the component is visible.',
      )
      return
    }

    setIsDownloading(true)

    try {
      // Wait for all content to load
      await waitForImages(element)

      // Convert external images to data URLs to avoid CORS issues
      await convertImagesToDataUrls(element)

      // Brief pause to ensure DOM updates are complete
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Generate the canvas
      const canvas = await generateCanvas(element)

      // Download the image
      await downloadCanvas(canvas)

      // Clean up canvas to free memory
      canvas.width = 0
      canvas.height = 0
    } catch (error) {
      console.error('Download failed:', error)

      // More user-friendly error messages
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
        }
      }

      alert(message)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="relative">
      <div ref={componentRef} className="inline-block">
        {children}
      </div>

      {/* Action buttons container */}
      <div className="mt-4 flex flex-col space-y-2">
        {/* Download Button */}
        <button
          onClick={downloadAsImage}
          disabled={isDownloading}
          className="font-inter inline-flex items-center justify-center space-x-2 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-md disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          <span>{isDownloading ? 'Generating...' : 'Download as PNG'}</span>
        </button>

        {/* Social Share Buttons - Side by side */}
        <div className="flex space-x-2">
          {/* LinkedIn Share Button */}
          <button
            onClick={() => handleShare(getLinkedInShareUrl())}
            className="font-inter inline-flex flex-1 items-center justify-center space-x-2 rounded-lg bg-[#0077B5] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#0077B5]/90 hover:shadow-md"
          >
            <LinkedInIcon className="h-4 w-4" />
            <span>LinkedIn</span>
          </button>

          {/* Bluesky Share Button */}
          <button
            onClick={() => handleShare(getBlueskyShareUrl())}
            className="font-inter inline-flex flex-1 items-center justify-center space-x-2 rounded-lg bg-[#00A8E8] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#00A8E8]/90 hover:shadow-md"
          >
            <BlueskyIcon className="h-4 w-4" />
            <span>Bluesky</span>
          </button>
        </div>
      </div>
    </div>
  )
}
