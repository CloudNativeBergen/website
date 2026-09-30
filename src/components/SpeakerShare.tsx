import { SpeakerWithTalks } from '@/lib/speaker/types'
import type { StudioFormat } from '@/lib/marketing-asset'
import { SpeakerCard, type SpeakerCardVariant } from './studio-cards'

const qrCodeCache = new Map<string, string>()

const FALLBACK_QR_CODE =
  "data:image/svg+xml,%3csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='120' height='120' fill='white'/%3e%3cpath d='M10,10 L20,10 L20,20 L10,20 Z M30,10 L40,10 L40,20 L30,20 Z M50,10 L60,10 L60,20 L50,20 Z M70,10 L80,10 L80,20 L70,20 Z M10,30 L20,30 L20,40 L10,40 Z M50,30 L60,30 L60,40 L50,40 Z M70,30 L80,30 L80,40 L70,40 Z M10,50 L20,50 L20,60 L10,60 Z M30,50 L40,50 L40,60 L30,60 Z M50,50 L60,50 L60,60 L50,60 Z M70,50 L80,50 L80,60 L70,60 Z M30,70 L40,70 L40,80 L30,80 Z M50,70 L60,70 L60,80 L50,80 Z' fill='black'/%3e%3c/svg%3e"

interface SpeakerShareProps {
  speaker: SpeakerWithTalks
  variant?: SpeakerCardVariant
  className?: string
  isFeatured?: boolean
  ctaUrl?: string
  eventName?: string
  baseDomain?: string
  showCloudNativePattern?: boolean
  /**
   * A fixed Format (docs/MARKETING_STUDIO_FORMATS_SPEC.md §2). Left out, the
   * card follows the studio tab's Format switch, or is square outside one.
   */
  format?: StudioFormat
}

export async function generateQRCode(
  url: string,
  size: number = 256,
  baseDomain?: string,
): Promise<string> {
  const fullUrl = url.startsWith('http')
    ? url
    : baseDomain
      ? `https://${baseDomain}${url}`
      : url

  const cacheKey = `${fullUrl}_${size}`
  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)!
  }

  try {
    const QRCode = (await import('qrcode')).default
    const qrCodeDataUrl = await QRCode.toDataURL(fullUrl, {
      width: size,
      margin: 0,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })

    qrCodeCache.set(cacheKey, qrCodeDataUrl)
    return qrCodeDataUrl
  } catch (error) {
    console.error('Failed to generate QR code:', error)
    qrCodeCache.set(fullUrl, FALLBACK_QR_CODE)
    return FALLBACK_QR_CODE
  }
}

/**
 * SpeakerShare component for social media sharing with QR codes
 *
 * Generates the QR code on the server, then renders the card itself as a
 * client component (`SpeakerCard`) so it can follow the studio tab's Format
 * switch: square, landscape or portrait, every element kept in each.
 *
 * @param props - SpeakerShareProps
 * @returns Server-rendered React component with QR code
 */
export async function SpeakerShare({
  speaker,
  variant = 'speaker-share',
  className = '',
  isFeatured = false,
  ctaUrl,
  eventName,
  baseDomain,
  showCloudNativePattern = false,
  format,
}: SpeakerShareProps) {
  const finalCtaUrl = ctaUrl || `/speaker/${speaker.slug}`
  const qrCodeUrl = await generateQRCode(finalCtaUrl, 512, baseDomain)

  return (
    <SpeakerCard
      speaker={speaker}
      qrCodeUrl={qrCodeUrl}
      variant={variant}
      isFeatured={isFeatured}
      eventName={eventName}
      showCloudNativePattern={showCloudNativePattern}
      format={format}
      className={className}
    />
  )
}

// Props for the client wrapper version
export interface SpeakerShareClientProps {
  speakerUrl: string
  talkTitle: string
  eventName: string
  speakerName: string
  qrCodeUrl: string
  speaker: SpeakerWithTalks
  variant?: SpeakerCardVariant
  className?: string
  isFeatured?: boolean
  showCloudNativePattern?: boolean
}
