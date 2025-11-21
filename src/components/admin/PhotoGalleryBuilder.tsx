'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  PhotoIcon,
  ArrowPathIcon,
  QrCodeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline'
import QRCodeStyling from 'qr-code-styling'
import { Logo } from '../Logo'
import { sanityImage } from '@/lib/sanity/client'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

interface PhotoGalleryBuilderProps {
  photos: GalleryImageWithSpeakers[]
  qrCodeUrl?: string
  conferenceTitle: string
  wrapPreview?: (node: React.ReactNode) => React.ReactNode
}

type LayoutType = 'mosaic-6' | 'grid-8' | 'asymmetric-7'

interface LayoutConfig {
  id: LayoutType
  name: string
  photoCount: number
  description: string
}

const LAYOUTS: LayoutConfig[] = [
  {
    id: 'mosaic-6',
    name: 'Side Panel',
    photoCount: 7,
    description: 'Vertical emphasis with sidebar accent',
  },
  {
    id: 'grid-8',
    name: 'Center Stage',
    photoCount: 7,
    description: 'Hero focus with vertical framing',
  },
  {
    id: 'asymmetric-7',
    name: 'Dynamic Flow',
    photoCount: 9,
    description: 'Balanced asymmetry with varied sizing',
  },
]

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 400

const styles = {
  panel:
    'rounded-lg border border-brand-frosted-steel bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800',
  label:
    'mb-2 block text-sm font-medium text-brand-slate-gray dark:text-gray-300',
  input:
    'w-full rounded border border-brand-frosted-steel bg-brand-glacier-white px-3 py-2 text-brand-slate-gray focus:border-brand-cloud-blue focus:outline-none focus:ring-2 focus:ring-brand-cloud-blue/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:focus:border-blue-500',
  buttonActive:
    'border-brand-cloud-blue bg-brand-cloud-blue/10 text-brand-cloud-blue dark:border-blue-500 dark:bg-blue-500/20 dark:text-blue-400',
  buttonInactive:
    'border-brand-frosted-steel bg-white text-brand-slate-gray hover:border-brand-cloud-blue/50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500/50',
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function getOptimizedImageUrl(
  imageUrl: string,
  width: number,
  height: number,
  scale: number = 1,
): string {
  try {
    return sanityImage(imageUrl)
      .width(Math.round(width * scale))
      .height(Math.round(height * scale))
      .fit('crop')
      .quality(95)
      .auto('format')
      .url()
  } catch {
    return imageUrl
  }
}

interface LayoutRendererProps {
  photos: GalleryImageWithSpeakers[]
  scale?: number
}

const MosaicLayout = ({ photos, scale = 1 }: LayoutRendererProps) => {
  const selectedPhotos = photos.slice(0, 7)
  const gap = 4 * scale

  return (
    <div
      className="grid h-full w-full grid-cols-4 grid-rows-3"
      style={{ gap: `${gap}px` }}
    >
      {/* Top left - wide header */}
      <div className="col-span-2 row-span-1">
        {selectedPhotos[0] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[0].imageUrl || '',
              500,
              150,
            )}
            alt={selectedPhotos[0].imageAlt || selectedPhotos[0].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Top right - small */}
      <div className="col-span-1 row-span-1">
        {selectedPhotos[1] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[1].imageUrl || '',
              200,
              150,
            )}
            alt={selectedPhotos[1].imageAlt || selectedPhotos[1].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Far right - tall spanning 3 rows */}
      <div className="col-span-1 row-span-3">
        {selectedPhotos[2] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[2].imageUrl || '',
              200,
              450,
            )}
            alt={selectedPhotos[2].imageAlt || selectedPhotos[2].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Middle left - small */}
      <div className="col-span-1 row-span-1">
        {selectedPhotos[3] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[3].imageUrl || '',
              200,
              150,
            )}
            alt={selectedPhotos[3].imageAlt || selectedPhotos[3].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Middle center - medium */}
      <div className="col-span-1 row-span-1">
        {selectedPhotos[4] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[4].imageUrl || '',
              200,
              150,
            )}
            alt={selectedPhotos[4].imageAlt || selectedPhotos[4].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Middle right - small */}
      <div className="col-span-1 row-span-1">
        {selectedPhotos[5] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[5].imageUrl || '',
              200,
              150,
            )}
            alt={selectedPhotos[5].imageAlt || selectedPhotos[5].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Bottom left - spanning 3 columns */}
      <div className="col-span-3 row-span-1">
        {selectedPhotos[6] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[6].imageUrl || '',
              600,
              150,
            )}
            alt={selectedPhotos[6].imageAlt || selectedPhotos[6].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
    </div>
  )
}

const GridLayout = ({ photos, scale = 1 }: LayoutRendererProps) => {
  const selectedPhotos = photos.slice(0, 8)
  const gap = 4 * scale

  return (
    <div
      className="grid h-full w-full grid-cols-6 grid-rows-2"
      style={{ gap: `${gap}px` }}
    >
      {/* Left column - tall vertical */}
      <div className="col-span-1 row-span-2">
        {selectedPhotos[0] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[0].imageUrl || '',
              160,
              400,
            )}
            alt={selectedPhotos[0].imageAlt || selectedPhotos[0].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Top center-left - medium square */}
      <div className="col-span-1 row-span-1">
        {selectedPhotos[1] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[1].imageUrl || '',
              160,
              200,
            )}
            alt={selectedPhotos[1].imageAlt || selectedPhotos[1].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Center - large hero spanning 2 cols x 2 rows */}
      <div className="col-span-2 row-span-2">
        {selectedPhotos[2] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[2].imageUrl || '',
              320,
              400,
            )}
            alt={selectedPhotos[2].imageAlt || selectedPhotos[2].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Top center-right - medium square */}
      <div className="col-span-1 row-span-1">
        {selectedPhotos[3] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[3].imageUrl || '',
              160,
              200,
            )}
            alt={selectedPhotos[3].imageAlt || selectedPhotos[3].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Right column - tall vertical */}
      <div className="col-span-1 row-span-2">
        {selectedPhotos[4] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[4].imageUrl || '',
              160,
              400,
            )}
            alt={selectedPhotos[4].imageAlt || selectedPhotos[4].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Bottom left - medium square */}
      <div className="col-span-1 row-span-1">
        {selectedPhotos[5] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[5].imageUrl || '',
              160,
              200,
            )}
            alt={selectedPhotos[5].imageAlt || selectedPhotos[5].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Bottom center-right - medium square */}
      <div className="col-span-1 row-span-1">
        {selectedPhotos[6] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[6].imageUrl || '',
              160,
              200,
            )}
            alt={selectedPhotos[6].imageAlt || selectedPhotos[6].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
    </div>
  )
}

const AsymmetricLayout = ({ photos, scale = 1 }: LayoutRendererProps) => {
  const selectedPhotos = photos.slice(0, 9)
  const gap = 4 * scale

  return (
    <div
      className="grid h-full w-full grid-cols-5 grid-rows-3"
      style={{ gap: `${gap}px` }}
    >
      {/* Top row - left medium, small, right medium */}
      <div className="col-span-2 row-span-1">
        {selectedPhotos[0] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[0].imageUrl || '',
              320,
              150,
            )}
            alt={selectedPhotos[0].imageAlt || selectedPhotos[0].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="col-span-1 row-span-1">
        {selectedPhotos[1] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[1].imageUrl || '',
              160,
              150,
            )}
            alt={selectedPhotos[1].imageAlt || selectedPhotos[1].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="col-span-2 row-span-1">
        {selectedPhotos[2] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[2].imageUrl || '',
              320,
              150,
            )}
            alt={selectedPhotos[2].imageAlt || selectedPhotos[2].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Middle row - one small left, one large spanning 3 cols, one small right */}
      <div className="col-span-1 row-span-1">
        {selectedPhotos[3] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[3].imageUrl || '',
              160,
              150,
            )}
            alt={selectedPhotos[3].imageAlt || selectedPhotos[3].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="col-span-3 row-span-1">
        {selectedPhotos[4] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[4].imageUrl || '',
              480,
              150,
            )}
            alt={selectedPhotos[4].imageAlt || selectedPhotos[4].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="col-span-1 row-span-1">
        {selectedPhotos[5] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[5].imageUrl || '',
              160,
              150,
            )}
            alt={selectedPhotos[5].imageAlt || selectedPhotos[5].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Bottom row - three photos filling the width */}
      <div className="col-span-2 row-span-1">
        {selectedPhotos[6] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[6].imageUrl || '',
              320,
              150,
            )}
            alt={selectedPhotos[6].imageAlt || selectedPhotos[6].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="col-span-1 row-span-1">
        {selectedPhotos[7] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[7].imageUrl || '',
              160,
              150,
            )}
            alt={selectedPhotos[7].imageAlt || selectedPhotos[7].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="col-span-2 row-span-1">
        {selectedPhotos[8] && (
          <img
            src={getOptimizedImageUrl(
              selectedPhotos[8].imageUrl || '',
              320,
              150,
            )}
            alt={selectedPhotos[8].imageAlt || selectedPhotos[8].location}
            className="h-full w-full object-cover"
          />
        )}
      </div>
    </div>
  )
}

export function PhotoGalleryBuilder({
  photos: initialPhotos,
  qrCodeUrl,
  wrapPreview,
}: PhotoGalleryBuilderProps) {
  const [layout, setLayout] = useState<LayoutType>('mosaic-6')
  const [photos, setPhotos] = useState<GalleryImageWithSpeakers[]>([])
  const [showLogo, setShowLogo] = useState(true)
  const [showQR, setShowQR] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [logoSize, setLogoSize] = useState(120)
  const [qrSize, setQrSize] = useState(100)
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null)
  const qrImageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    setPhotos(shuffleArray(initialPhotos))
  }, [initialPhotos])

  const handleRefresh = useCallback(() => {
    setPhotos(shuffleArray(initialPhotos))
  }, [initialPhotos])

  // Generate styled QR code
  useEffect(() => {
    if (qrCodeUrl) {
      const qrCode = new QRCodeStyling({
        width: qrSize * 2,
        height: qrSize * 2,
        type: 'canvas',
        data: qrCodeUrl,
        dotsOptions: {
          color: '#1e293b',
          type: 'dots',
        },
        backgroundOptions: {
          color: '#ffffff',
        },
        cornersSquareOptions: {
          type: 'extra-rounded',
        },
        cornersDotOptions: {
          type: 'dot',
        },
        qrOptions: {
          errorCorrectionLevel: 'M',
        },
      })

      qrCode.getRawData('png').then((blob) => {
        if (blob && blob instanceof Blob) {
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            setQrCodeImage(dataUrl)
            const img = new window.Image()
            img.onload = () => {
              qrImageRef.current = img
            }
            img.src = dataUrl
          }
          reader.readAsDataURL(blob)
        }
      })
    } else {
      setQrCodeImage(null)
    }
  }, [qrCodeUrl, qrSize])

  const renderLayout = (scale: number = 1) => {
    const LayoutComponent =
      layout === 'mosaic-6'
        ? MosaicLayout
        : layout === 'grid-8'
          ? GridLayout
          : AsymmetricLayout

    return <LayoutComponent photos={photos} scale={scale} />
  }

  const renderOverlays = () => (
    <>
      {showLogo && (
        <div
          className="pointer-events-none absolute"
          style={{
            top: `${(20 / CANVAS_HEIGHT) * 100}%`,
            left: `${(20 / CANVAS_WIDTH) * 100}%`,
            width: `${(logoSize / CANVAS_WIDTH) * 100}%`,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
          }}
        >
          <Logo
            variant="monochrome"
            className="h-auto w-full"
            style={{ color: '#FFFFFF' }}
          />
        </div>
      )}
      {showQR && qrCodeImage && (
        <div
          className="pointer-events-none absolute rounded-lg shadow-lg"
          style={{
            bottom: `${(20 / CANVAS_HEIGHT) * 100}%`,
            right: `${(20 / CANVAS_WIDTH) * 100}%`,
            width: `${(qrSize / CANVAS_WIDTH) * 100}%`,
            height: `${(qrSize / CANVAS_HEIGHT) * 100}%`,
          }}
        >
          <img
            src={qrCodeImage}
            alt="QR Code"
            className="h-full w-full rounded-lg object-cover"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>
      )}
    </>
  )

  const previewNode = (
    <div
      className="relative w-full overflow-hidden rounded-lg shadow-lg"
      style={{
        aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
      }}
    >
      <div className="relative h-full w-full">
        {renderLayout(1)}
        {renderOverlays()}
      </div>
    </div>
  )

  const exportNode = wrapPreview && (
    <div className="hidden">
      {wrapPreview(
        <div
          className="relative overflow-hidden"
          style={{
            width: `${CANVAS_WIDTH * 2}px`,
            height: `${CANVAS_HEIGHT * 2}px`,
          }}
        >
          {renderLayout(2)}
          {renderOverlays()}
        </div>,
      )}
    </div>
  )

  const currentLayout = LAYOUTS.find((l) => l.id === layout)!

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:sticky lg:top-20 lg:col-span-2 lg:self-start">
        {wrapPreview ? wrapPreview(previewNode) : previewNode}
        {exportNode}
      </div>

      <div className="space-y-3 lg:col-span-1">
        {/* Layout Selection */}
        {/* Layout Selection */}
        <div className={styles.panel}>
          <div className="mb-4 flex items-center gap-2">
            <PhotoIcon className="h-5 w-5 text-brand-slate-gray dark:text-gray-300" />
            <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
              Layout & Photos
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className={styles.label}>Layout Style</label>
              <div className="grid grid-cols-1 gap-2">
                {LAYOUTS.map((layoutOption) => (
                  <button
                    key={layoutOption.id}
                    onClick={() => setLayout(layoutOption.id)}
                    disabled={initialPhotos.length < layoutOption.photoCount}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border-2 p-3 transition-all ${layout === layoutOption.id
                        ? styles.buttonActive
                        : styles.buttonInactive
                      } ${initialPhotos.length < layoutOption.photoCount
                        ? 'cursor-not-allowed opacity-50'
                        : ''
                      }`}
                  >
                    <div className="text-left">
                      <div className="font-medium">{layoutOption.name}</div>
                      <div className="text-xs opacity-75">
                        {layoutOption.description} • {layoutOption.photoCount}{' '}
                        photos
                      </div>
                    </div>
                    {layout === layoutOption.id && (
                      <div className="h-3 w-3 rounded-full bg-brand-cloud-blue dark:bg-blue-400" />
                    )}
                  </button>
                ))}
              </div>
              {initialPhotos.length < currentLayout.photoCount && (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                  Need {currentLayout.photoCount - initialPhotos.length} more
                  featured photo
                  {currentLayout.photoCount - initialPhotos.length > 1
                    ? 's'
                    : ''}{' '}
                  for this layout
                </p>
              )}
            </div>

            <button
              onClick={handleRefresh}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-brand-frosted-steel bg-white px-4 py-2 font-medium text-brand-slate-gray transition-colors hover:border-brand-cloud-blue hover:bg-brand-cloud-blue/5 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:bg-blue-500/10"
            >
              <ArrowPathIcon className="h-5 w-5" />
              Shuffle Photos
            </button>
          </div>
        </div>

        {/* Overlays */}
        <div className={styles.panel}>
          <div className="mb-4 flex items-center gap-2">
            <QrCodeIcon className="h-5 w-5 text-brand-slate-gray dark:text-gray-300" />
            <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
              Branding Overlays
            </h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label
                htmlFor="show-logo"
                className="cursor-pointer text-sm font-medium text-brand-slate-gray dark:text-gray-300"
              >
                Conference Logo
              </label>
              <input
                type="checkbox"
                id="show-logo"
                checked={showLogo}
                onChange={(e) => setShowLogo(e.target.checked)}
                className="h-5 w-5 cursor-pointer rounded border-brand-frosted-steel bg-brand-glacier-white text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-700 dark:text-blue-400 dark:focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <label
                htmlFor="show-qr"
                className="cursor-pointer text-sm font-medium text-brand-slate-gray dark:text-gray-300"
              >
                QR Code
              </label>
              <input
                type="checkbox"
                id="show-qr"
                checked={showQR}
                onChange={(e) => setShowQR(e.target.checked)}
                className="h-5 w-5 cursor-pointer rounded border-brand-frosted-steel bg-brand-glacier-white text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-700 dark:text-blue-400 dark:focus:ring-blue-500"
              />
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full cursor-pointer items-center justify-between text-sm text-brand-slate-gray hover:text-brand-cloud-blue dark:text-gray-400 dark:hover:text-blue-400"
            >
              <span>Advanced Options</span>
              {showAdvanced ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-4 pt-2">
                <div>
                  <label htmlFor="logo-size" className={styles.label}>
                    <AdjustmentsHorizontalIcon className="mr-1 inline h-4 w-4" />
                    Logo Size: {logoSize}px
                  </label>
                  <input
                    type="range"
                    id="logo-size"
                    min={80}
                    max={200}
                    value={logoSize}
                    onChange={(e) => setLogoSize(Number(e.target.value))}
                    className="slider w-full cursor-pointer"
                  />
                </div>

                <div>
                  <label htmlFor="qr-size" className={styles.label}>
                    <AdjustmentsHorizontalIcon className="mr-1 inline h-4 w-4" />
                    QR Code Size: {qrSize}px
                  </label>
                  <input
                    type="range"
                    id="qr-size"
                    min={60}
                    max={150}
                    value={qrSize}
                    onChange={(e) => setQrSize(Number(e.target.value))}
                    className="slider w-full cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <strong>Tip:</strong> Photos are randomly shuffled. Click
            &quot;Shuffle Photos&quot; to see different combinations. Download
            multiple variations for your social media posts!
          </p>
        </div>
      </div>
    </div>
  )
}
