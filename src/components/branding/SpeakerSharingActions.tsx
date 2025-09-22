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

export function SpeakerSharingActions({
  filename = 'speaker-image',
  speakerUrl,
  talkTitle,
  eventName,
  children,
}: SpeakerSharingActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const componentRef = useRef<HTMLDivElement>(null)

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

  const getLinkedInShareUrl = () => {
    const params = new URLSearchParams({
      url: speakerUrl,
    })
    return `https://www.linkedin.com/sharing/share-offsite/?${params.toString()}`
  }

  const getBlueskyShareUrl = () => {
    const shareText = `${getRandomShareText()}\n\n${speakerUrl}`
    const params = new URLSearchParams({
      text: shareText,
    })
    return `https://bsky.app/intent/compose?${params.toString()}`
  }

  const handleShare = (url: string) => {
    window.open(url, '_blank', 'width=600,height=400')
  }

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
            img.onerror = () => resolve()

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
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: false,
      removeContainer: false,
      imageTimeout: 8000,
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
        0.95,
      )
    })
  }

  const downloadAsImage = async () => {
    if (!componentRef.current) {
      alert('Component not ready. Please try again.')
      return
    }

    const element = componentRef.current

    if (element.offsetWidth === 0 || element.offsetHeight === 0) {
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
    <div className="relative">
      <div ref={componentRef} className="inline-block">
        {children}
      </div>

      <div className="mt-4 flex flex-col space-y-2">
        <button
          onClick={downloadAsImage}
          disabled={isDownloading}
          className="font-inter inline-flex items-center justify-center space-x-2 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-md disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          <span>{isDownloading ? 'Generating...' : 'Download as PNG'}</span>
        </button>

        <div className="flex space-x-2">
          <button
            onClick={() => handleShare(getLinkedInShareUrl())}
            className="font-inter inline-flex flex-1 items-center justify-center space-x-2 rounded-lg bg-[#0077B5] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#0077B5]/90 hover:shadow-md"
          >
            <LinkedInIcon className="h-4 w-4" />
            <span>LinkedIn</span>
          </button>

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
