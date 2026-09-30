'use client'

import { CloudNativePattern } from '@/components/CloudNativePattern'
import { studioFormatAspect, type StudioFormat } from '@/lib/marketing-asset'

/**
 * The frame every studio card is drawn in (docs/MARKETING_STUDIO_FORMATS_
 * SPEC.md §3): the Format's aspect, the gradient, and the brand pattern
 * filling the whole frame whatever the shape. `cqw` units inside it are
 * hundredths of the card's width, so a layout is written once per Format and
 * scales with the card's CSS size; the capture scales it to the Format's pixels.
 */
export function CardFrame({
  kind,
  format,
  gradient,
  pattern,
  seed,
  className = '',
  children,
}: {
  kind: 'speaker' | 'sponsor'
  format: StudioFormat
  /** Tailwind gradient stops, used when the pattern is off. */
  gradient: string
  pattern: boolean
  seed: number
  className?: string
  children: React.ReactNode
}) {
  const background = pattern
    ? 'from-slate-900 via-blue-900 to-slate-900'
    : gradient
  return (
    <div
      data-card={kind}
      data-format={format}
      className={`group @container relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-linear-to-br ${background} text-white transition-all duration-300 hover:shadow-xl ${className}`}
      style={{ aspectRatio: studioFormatAspect(format) }}
    >
      {pattern && (
        <CloudNativePattern
          className="absolute inset-0"
          variant="dark"
          opacity={0.25}
          animated
          baseSize={35}
          iconCount={45}
          seed={seed}
        />
      )}
      <div className="relative h-full">{children}</div>
    </div>
  )
}

/** The QR code on a card, `size` hundredths of the card's width a side. */
export function QrBadge({
  url,
  alt,
  size,
  className = '',
}: {
  url: string
  alt: string
  size: number
  className?: string
}) {
  if (!url) return null
  return (
    <div
      data-card-element="qr"
      data-qr-code="true"
      className={`shrink-0 rounded-[1.5cqw] bg-white shadow-lg ${className}`}
      style={{
        width: `${size}cqw`,
        height: `${size}cqw`,
        padding: `${Math.max(0.3, size * 0.04)}cqw`,
      }}
    >
      <img
        src={url}
        alt={alt}
        className="size-full object-cover"
        style={{ imageRendering: 'crisp-edges' }}
      />
    </div>
  )
}
