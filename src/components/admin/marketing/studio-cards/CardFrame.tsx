'use client'

import { CloudNativePattern } from '@/components/CloudNativePattern'
import { useStudioFormat } from '@/components/common/image-capture'
import {
  DEFAULT_STUDIO_FORMAT,
  studioFormatAspect,
  type StudioFormat,
} from '@/lib/marketing-asset'

/**
 * The Format a card is laid out in: fixed by its props, else the studio
 * tab's switch, else square, as every card was before Formats.
 */
export function useCardFormat(fixed: StudioFormat | undefined): StudioFormat {
  const tab = useStudioFormat()
  return fixed ?? tab ?? DEFAULT_STUDIO_FORMAT
}

/** Sizes of an icon-and-text line, as Tailwind classes. */
export interface IconLineSizes {
  row: string
  icon: string
  text: string
}

/**
 * How a card's backdrop looks. `dark` (speaker and sponsor cards) is slate
 * under the dark pattern, or the card's own gradient with the pattern off.
 * `brand` (the conference promo) is the conference's brand gradient under the
 * brand pattern and a shade, as the promo always looked — read from the
 * gradient variable, not `.bg-brand-gradient`, whose `.dark` override would
 * make the downloaded promo follow the organizer's admin theme.
 */
const TONES = {
  dark: {
    pattern: { variant: 'dark', opacity: 0.25, baseSize: 35, iconCount: 45 },
    shade: false,
  },
  brand: {
    pattern: { variant: 'brand', opacity: 0.15, baseSize: 45, iconCount: 80 },
    shade: true,
  },
} as const

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
  tone = 'dark',
  gradient = '',
  pattern,
  seed,
  className = '',
  children,
}: {
  kind: 'speaker' | 'sponsor' | 'promo'
  format: StudioFormat
  tone?: keyof typeof TONES
  /** Tailwind gradient stops, used by the dark tone when the pattern is off. */
  gradient?: string
  pattern: boolean
  seed: number
  className?: string
  children: React.ReactNode
}) {
  const look = TONES[tone]
  const brand = tone === 'brand'
  const background = brand
    ? ''
    : `bg-linear-to-br ${pattern ? 'from-slate-900 via-blue-900 to-slate-900' : gradient}`
  return (
    <div
      data-card={kind}
      data-format={format}
      className={`group @container relative w-full overflow-hidden rounded-2xl border border-gray-200 ${background} text-white transition-all duration-300 hover:shadow-xl ${className}`}
      style={{
        aspectRatio: studioFormatAspect(format),
        ...(brand && { backgroundImage: 'var(--gradient-brand)' }),
      }}
    >
      {pattern && (
        <CloudNativePattern
          className="absolute inset-0"
          {...look.pattern}
          animated
          seed={seed}
        />
      )}
      {look.shade && (
        <div aria-hidden className="absolute inset-0 bg-black/30" />
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
