import { MissingAvatar } from '@/components/common/MissingAvatar'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { MicrophoneIcon, StarIcon } from '@heroicons/react/24/solid'
import { sanityImage } from '@/lib/sanity/client'
import { Format } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal'
import { SpeakerWithTalks } from '@/lib/speaker/types'

// QR code cache to avoid regenerating the same codes
const qrCodeCache = new Map<string, string>()

// Fallback QR code pattern as a constant
const FALLBACK_QR_CODE =
  "data:image/svg+xml,%3csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='120' height='120' fill='white'/%3e%3cpath d='M10,10 L20,10 L20,20 L10,20 Z M30,10 L40,10 L40,20 L30,20 Z M50,10 L60,10 L60,20 L50,20 Z M70,10 L80,10 L80,20 L70,20 Z M10,30 L20,30 L20,40 L10,40 Z M50,30 L60,30 L60,40 L50,40 Z M70,30 L80,30 L80,40 L70,40 Z M10,50 L20,50 L20,60 L10,60 Z M30,50 L40,50 L40,60 L30,60 Z M50,50 L60,50 L60,60 L50,60 Z M70,50 L80,50 L80,60 L70,60 Z M30,70 L40,70 L40,80 L30,80 Z M50,70 L60,70 L60,80 L50,80 Z' fill='black'/%3e%3c/svg%3e"

/**
 * Props for the SpeakerShare component
 */
interface SpeakerShareProps {
  /** Speaker data including talks and personal information */
  speaker: SpeakerWithTalks
  /** Visual variant for sharing */
  variant?: 'speaker-share' | 'speaker-spotlight'
  /** Additional CSS classes */
  className?: string
  /** Whether to show as a featured speaker */
  isFeatured?: boolean
  /** Custom call-to-action URL (used for QR code generation) */
  ctaUrl?: string
  /** Conference/event name for social variants */
  eventName?: string
}

/**
 * Variant configuration for sharing modes
 */
type VariantConfig = {
  gradient: string
  accentColor: string
  icon: React.ComponentType<{ className?: string }>
  headerText: (isFeatured: boolean) => string
}

const variantConfig: Record<
  NonNullable<SpeakerShareProps['variant']>,
  VariantConfig
> = {
  'speaker-share': {
    gradient: 'from-brand-cloud-blue to-brand-fresh-green',
    accentColor: 'text-white',
    icon: MicrophoneIcon,
    headerText: () => "I'm speaking at",
  },
  'speaker-spotlight': {
    gradient: 'from-brand-fresh-green to-brand-cloud-blue',
    accentColor: 'text-white',
    icon: StarIcon,
    headerText: (isFeatured) =>
      isFeatured ? 'Featured Speaker' : 'Speaker Spotlight',
  },
}

/**
 * Generate QR code data URL for the given URL with caching
 */
async function generateQRCode(url: string): Promise<string> {
  const fullUrl = url.startsWith('http')
    ? url
    : `https://cloudnativebergen.dev${url}`

  // Check cache first
  if (qrCodeCache.has(fullUrl)) {
    return qrCodeCache.get(fullUrl)!
  }

  try {
    // Dynamic import to reduce bundle size
    const QRCode = (await import('qrcode')).default
    const qrCodeDataUrl = await QRCode.toDataURL(fullUrl, {
      width: 120,
      margin: 1,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff',
      },
    })

    // Cache the result
    qrCodeCache.set(fullUrl, qrCodeDataUrl)
    return qrCodeDataUrl
  } catch (error) {
    console.error('Failed to generate QR code:', error)
    // Cache the fallback as well
    qrCodeCache.set(fullUrl, FALLBACK_QR_CODE)
    return FALLBACK_QR_CODE
  }
}

interface SpeakerImageProps {
  image?: SpeakerWithTalks['image']
  name: string
  size: number
  className?: string
}

const SpeakerImage = ({
  image,
  name,
  size,
  className = '',
}: SpeakerImageProps) => {
  if (image) {
    return (
      <img
        src={sanityImage(image)
          .width(size * 2) // 2x for high-DPI
          .height(size * 2)
          .fit('crop')
          .url()}
        alt={name}
        width={size}
        height={size}
        className={`object-cover ${className}`}
      />
    )
  }

  return <MissingAvatar name={name} size={size} className={className} />
}

interface QRCodeDisplayProps {
  qrCodeUrl?: string
  size: number
  className?: string
}

const QRCodeDisplay = ({
  qrCodeUrl,
  size,
  className = '',
}: QRCodeDisplayProps) => {
  if (!qrCodeUrl) return null

  return (
    <div
      className={`rounded-lg bg-white shadow-lg ${className}`}
      style={{ padding: size * 0.1 }}
      data-qr-code="true"
    >
      <img
        src={qrCodeUrl}
        alt="QR Code - Scan to view speaker profile"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        crossOrigin="anonymous"
      />
    </div>
  )
}

interface TalkFormatDisplayProps {
  talk: { format?: string; title?: string }
  size?: 'sm' | 'md' | 'lg'
}

const TalkFormatDisplay = ({ talk, size = 'md' }: TalkFormatDisplayProps) => {
  const talkConfig = formatConfig[talk.format as Format]
  const TalkIcon = talkConfig?.icon || MicrophoneIcon

  const sizeClasses = {
    sm: { icon: 'h-3 w-3', text: 'text-xs' },
    md: { icon: 'h-4 w-4', text: 'text-sm' },
    lg: { icon: 'h-5 w-5', text: 'text-base' },
  }

  const classes = sizeClasses[size]

  return (
    <div className="flex flex-col space-y-1">
      <div className="flex items-center justify-center space-x-2">
        <TalkIcon
          className={`${classes.icon} ${talkConfig?.color || 'text-brand-cloud-blue'}`}
        />
        <span className={`font-inter font-semibold ${classes.text}`}>
          {talkConfig?.label || 'Talk'}
        </span>
      </div>
      {talk.title && (
        <h3 className="font-space-grotesk line-clamp-3 text-base leading-tight font-bold">
          {talk.title}
        </h3>
      )}
    </div>
  )
}

/**
 * SpeakerShare component for social media sharing with QR codes
 *
 * Specialized component for generating speaker sharing cards with:
 * - QR codes for easy profile access
 * - Social media optimized layouts
 * - Conference branding
 * - Speaker spotlight variants
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
  eventName = 'Cloud Native Bergen',
}: SpeakerShareProps) {
  // Get variant config
  const config = variantConfig[variant]
  const Icon = config.icon

  // CTA URL for QR code
  const finalCtaUrl = ctaUrl || `/speaker/${speaker.slug || speaker._id}`

  // Generate QR code for sharing
  const qrCodeUrl = await generateQRCode(finalCtaUrl)

  // Get primary talk
  const primaryTalk =
    speaker.talks && speaker.talks.length > 0 ? speaker.talks[0] : null

  // Extract speaker properties
  const { name, title, image } = speaker

  return (
    <div
      className={`group relative aspect-[4/5] max-w-lg overflow-hidden rounded-2xl bg-gradient-to-br ${config.gradient} border border-gray-200 p-8 transition-all duration-300 hover:shadow-xl ${className}`}
    >
      <div className="relative flex h-full flex-col text-center text-white">
        {/* Header */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-center space-x-2">
            <Icon className="h-5 w-5" />
            <span className="font-inter text-base font-bold">
              {config.headerText(isFeatured)}
            </span>
          </div>
          <h1 className="font-space-grotesk line-clamp-2 px-2 text-2xl leading-tight font-bold">
            {eventName}
          </h1>
        </div>

        {/* Speaker Image and QR Code */}
        <div className="mb-4">
          <div className="flex items-start justify-center space-x-3">
            {/* Speaker Image */}
            <div className="flex-shrink-0">
              <SpeakerImage
                image={image}
                name={name}
                size={95}
                className="rounded-2xl object-cover shadow-lg"
              />
            </div>

            {/* QR Code */}
            <QRCodeDisplay qrCodeUrl={qrCodeUrl} size={80} />
          </div>
        </div>

        {/* Speaker Info - Flexible content area */}
        <div className="mb-4 flex-1">
          <h2 className="font-space-grotesk mb-2 line-clamp-2 px-2 text-xl font-bold">
            {name}
          </h2>
          {title && (
            <p className="font-inter mb-3 line-clamp-2 px-2 text-base font-semibold text-white/90">
              {title}
            </p>
          )}

          {/* Primary Talk */}
          {primaryTalk && (
            <div className="mx-2 mb-3 rounded-xl bg-white/20 p-3 backdrop-blur-sm">
              <TalkFormatDisplay talk={primaryTalk} />
            </div>
          )}
        </div>

        {/* Footer - Pinned to bottom */}
        <div className="mt-auto">
          <div className="flex items-center justify-center space-x-1">
            <QrCodeIcon className="h-4 w-4" />
            <p className="font-inter text-xs">
              Scan QR code to view full profile
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
