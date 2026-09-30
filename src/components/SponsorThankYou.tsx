import { PLATFORM_NAME } from '@/lib/branding/platform'
import type { StudioFormat } from '@/lib/marketing-asset'
import {
  SponsorCard,
  type SponsorCardSponsor,
  type SponsorCardTier,
  type SponsorCardVariant,
} from './studio-cards'

interface SponsorThankYouProps {
  sponsor: SponsorCardSponsor
  tier: SponsorCardTier
  variant?: SponsorCardVariant
  className?: string
  eventName?: string
  eventDate?: string
  showCloudNativePattern?: boolean
  ctaUrl?: string
  /** Conference origin (e.g. `https://2026.example.dev`) used to absolutize a
   * relative `ctaUrl` for the QR code. Falls back to `NEXT_PUBLIC_BASE_URL`. */
  baseUrl?: string
  /**
   * A fixed Format (docs/MARKETING_STUDIO_FORMATS_SPEC.md §2). Left out, the
   * card follows the studio tab's Format switch, or is square outside one.
   */
  format?: StudioFormat
}

const qrCodeCache = new Map<string, string>()
const FALLBACK_QR_CODE =
  "data:image/svg+xml,%3csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='120' height='120' fill='white'/%3e%3cpath d='M10,10 L20,10 L20,20 L10,20 Z M30,10 L40,10 L40,20 L30,20 Z M50,10 L60,10 L60,20 L50,20 Z M70,10 L80,10 L80,20 L70,20 Z M10,30 L20,30 L20,40 L10,40 Z M50,30 L60,30 L60,40 L50,40 Z M70,30 L80,30 L80,40 L70,40 Z M10,50 L20,50 L20,60 L10,60 Z M30,50 L40,50 L40,60 L30,60 Z M50,50 L60,50 L60,60 L50,60 Z M70,50 L80,50 L80,60 L70,60 Z M30,70 L40,70 L40,80 L30,80 Z M50,70 L60,70 L60,80 L50,80 Z' fill='black'/%3e%3c/svg%3e"

async function generateQRCode(
  url: string,
  size = 256,
  baseUrl?: string,
): Promise<string> {
  // For a relative CTA, prefix the conference's own origin (passed in) or the
  // platform base URL — never a hardcoded brand host.
  const origin = (baseUrl || process.env.NEXT_PUBLIC_BASE_URL || '').replace(
    /\/$/,
    '',
  )
  // A relative CTA with NO resolvable origin would encode a relative URL —
  // scanning that QR resolves nowhere. Skip QR generation instead.
  if (!url.startsWith('http') && !origin) return ''
  const fullUrl = url.startsWith('http') ? url : `${origin}${url}`
  const cacheKey = `${fullUrl}_${size}`

  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)!
  }

  try {
    const QRCode = (await import('qrcode')).default
    const qrCodeDataUrl = await QRCode.toDataURL(fullUrl, {
      width: size,
      margin: 0,
      color: { dark: '#1a1a1a', light: '#ffffff' },
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
 * A sponsor's thank-you card. Generates the QR code on the server, then
 * renders the card as a client component (`SponsorCard`) so it can follow the
 * studio tab's Format switch: square, landscape or portrait.
 */
export async function SponsorThankYou({
  sponsor,
  tier,
  variant = 'code-heroes',
  className = '',
  eventName = PLATFORM_NAME,
  eventDate,
  showCloudNativePattern = false,
  ctaUrl,
  baseUrl,
  format,
}: SponsorThankYouProps) {
  const finalCtaUrl = ctaUrl || '/'
  const qrCodeUrl = await generateQRCode(finalCtaUrl, 512, baseUrl)

  return (
    <SponsorCard
      sponsor={sponsor}
      tier={tier}
      qrCodeUrl={qrCodeUrl}
      variant={variant}
      eventName={eventName}
      eventDate={eventDate}
      showCloudNativePattern={showCloudNativePattern}
      format={format}
      className={className}
    />
  )
}
