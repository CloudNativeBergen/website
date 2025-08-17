import { MissingAvatar } from '@/components/common/MissingAvatar'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { MicrophoneIcon, StarIcon } from '@heroicons/react/24/solid'
import { sanityImage } from '@/lib/sanity/client'
import { Format } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import { CloudNativePattern } from '@/components/CloudNativePattern'

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
  /** Whether to show Cloud Native pattern background */
  showCloudNativePattern?: boolean
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
async function generateQRCode(
  url: string,
  size: number = 256,
): Promise<string> {
  const fullUrl = url.startsWith('http')
    ? url
    : `https://cloudnativebergen.dev${url}`

  // Check cache first with size included in key
  const cacheKey = `${fullUrl}_${size}`
  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)!
  }

  try {
    // Dynamic import to reduce bundle size
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

    // Cache the result
    qrCodeCache.set(cacheKey, qrCodeDataUrl)
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

  // For missing avatars in the container query context, we need to ensure proper sizing
  return (
    <div className={`${className} relative overflow-hidden`}>
      <MissingAvatar
        name={name}
        size={size}
        className="absolute inset-0 flex items-center justify-center rounded-[inherit]"
        textSizeClass="text-2xl font-bold text-white z-10"
      />
    </div>
  )
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
      className={`rounded-[1.5cqw] bg-white shadow-lg ${className}`}
      style={{
        padding: `${Math.max(0.3, size * 0.04)}cqw`,
      }}
      data-qr-code="true"
    >
      <img
        src={qrCodeUrl}
        alt="QR Code - Scan to view speaker profile"
        className="h-full w-full object-cover"
        style={{
          imageRendering: 'crisp-edges',
        }}
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
    sm: { icon: 'h-3 w-3', text: 'text-xs', title: 'text-sm' },
    md: { icon: 'h-4 w-4', text: 'text-sm', title: 'text-base' },
    lg: {
      icon: 'h-[4cqw] w-[4cqw] @xs:h-[4.5cqw] @xs:w-[4.5cqw] @md:h-[5cqw] @md:w-[5cqw] @xl:h-[5.5cqw] @xl:w-[5.5cqw]',
      text: 'text-[3.5cqw] @xs:text-[4cqw] @md:text-[4.5cqw] @xl:text-[5cqw]',
      title: 'text-[4cqw] @xs:text-[4.5cqw] @md:text-[5.5cqw] @xl:text-[6cqw]',
    },
  }

  const classes = sizeClasses[size]

  return (
    <div className="flex flex-col space-y-[1cqw] @xs:space-y-[1.5cqw] @md:space-y-[2cqw]">
      <div className="flex items-center justify-center space-x-[1.5cqw] @xs:space-x-[2cqw] @md:space-x-[2.5cqw]">
        <TalkIcon
          className={`${classes.icon} ${talkConfig?.color || 'text-brand-cloud-blue'}`}
        />
        <span className={`font-inter font-semibold ${classes.text}`}>
          {talkConfig?.label || 'Talk'}
        </span>
      </div>
      {talk.title && (
        <h3
          className={`font-space-grotesk line-clamp-2 @lg:line-clamp-3 ${classes.title || 'text-base'} leading-tight font-bold`}
        >
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
  showCloudNativePattern = false,
}: SpeakerShareProps) {
  // Get variant config
  const config = variantConfig[variant]
  const Icon = config.icon

  // CTA URL for QR code
  const finalCtaUrl = ctaUrl || `/speaker/${speaker.slug || speaker._id}`

  // Generate QR code for sharing with appropriate size
  const qrCodeUrl = await generateQRCode(finalCtaUrl, 512)

  // Get primary talk
  const primaryTalk =
    speaker.talks && speaker.talks.length > 0 ? speaker.talks[0] : null

  // Extract speaker properties
  const { name, title, image } = speaker

  // Determine background style based on showCloudNativePattern
  const backgroundStyle = showCloudNativePattern
    ? 'from-slate-900 via-blue-900 to-slate-900'
    : config.gradient

  return (
    <div
      className={`group @container relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br ${backgroundStyle} border border-gray-200 transition-all duration-300 hover:shadow-xl ${className}`}
    >
      {/* Cloud Native Pattern Background - Only when showCloudNativePattern is true */}
      {showCloudNativePattern && (
        <CloudNativePattern
          className="absolute inset-0"
          variant="dark"
          opacity={0.25}
          animated={true}
          baseSize={35}
          iconCount={45}
          seed={42}
        />
      )}

      {/* Enhanced responsive layout with container query units */}
      <div className="relative flex h-full flex-col p-[3cqw] text-center text-white @xs:p-[4cqw] @md:p-[5cqw] @xl:p-[6cqw]">
        {/* Header Section */}
        <header className="mb-[3cqw] shrink-0 @xs:mb-[4cqw] @md:mb-[6cqw] @xl:mb-[8cqw]">
          <div className="mb-[1cqw] flex items-center justify-center gap-[2cqw] @xs:mb-[1.5cqw] @xs:gap-[2.5cqw] @md:mb-[2cqw] @md:gap-[3cqw]">
            <Icon className="h-[6cqw] w-[6cqw] @xs:h-[6.5cqw] @xs:w-[6.5cqw] @md:h-[7cqw] @md:w-[7cqw] @xl:h-[8cqw] @xl:w-[8cqw]" />
            <span className="font-inter text-[4.5cqw] leading-tight font-bold @xs:text-[5cqw] @md:text-[5.5cqw] @xl:text-[6cqw]">
              {config.headerText(isFeatured)}
            </span>
          </div>
          <h1 className="font-space-grotesk px-[1cqw] text-[6cqw] leading-tight font-bold @xs:text-[7cqw] @md:text-[8cqw] @xl:text-[9cqw]">
            {eventName}
          </h1>
        </header>

        {/* Images Section - Much bigger for large containers */}
        <section className="mb-[2cqw] shrink-0 @xs:mb-[3cqw] @md:mb-[4cqw]">
          <div className="flex items-center justify-center gap-[7cqw] @xs:gap-[8cqw] @md:gap-[12cqw] @xl:gap-[15cqw]">
            {/* Speaker Image - Much larger across all sizes */}
            <div className="flex-shrink-0">
              <SpeakerImage
                image={image}
                name={name}
                size={400}
                className="h-[25cqw] w-[25cqw] rounded-[2cqw] object-cover shadow-lg @xs:h-[28cqw] @xs:w-[28cqw] @md:h-[35cqw] @md:w-[35cqw] @md:rounded-[2.5cqw] @xl:h-[40cqw] @xl:w-[40cqw] @xl:rounded-[3cqw]"
              />
            </div>

            {/* QR Code - Matching speaker image size */}
            <QRCodeDisplay
              qrCodeUrl={qrCodeUrl}
              size={55}
              className="h-[25cqw] w-[25cqw] flex-shrink-0 @xs:h-[28cqw] @xs:w-[28cqw] @md:h-[35cqw] @md:w-[35cqw] @xl:h-[40cqw] @xl:w-[40cqw]"
            />
          </div>
        </section>

        {/* Content Section */}
        <main className="flex flex-1 flex-col justify-center px-[1cqw] @md:px-[2cqw]">
          <h2 className="font-space-grotesk mb-[1cqw] text-[6cqw] leading-tight font-bold @xs:mb-[1.5cqw] @xs:text-[6cqw] @md:mb-[2cqw] @md:text-[7.5cqw] @xl:text-[8.5cqw]">
            {name}
          </h2>

          {title && (
            <p className="font-inter mb-[2cqw] text-[4.5cqw] leading-tight font-semibold text-white/90 @xs:mb-[2.5cqw] @xs:text-[5cqw] @md:mb-[3cqw] @md:text-[5.5cqw] @xl:text-[6cqw]">
              {title}
            </p>
          )}

          {/* Primary Talk */}
          {primaryTalk && (
            <div className="mx-[1cqw] rounded-[1.5cqw] bg-white/20 p-[2cqw] backdrop-blur-sm @xs:p-[2.5cqw] @md:mx-[2cqw] @md:rounded-[2cqw] @md:p-[3cqw] @xl:rounded-[2.5cqw] @xl:p-[3.5cqw]">
              <TalkFormatDisplay talk={primaryTalk} size="lg" />
            </div>
          )}
        </main>

        {/* Footer Section */}
        <footer className="mt-[1cqw] shrink-0 @xs:mt-[1.5cqw] @md:mt-[2cqw]">
          <div className="flex items-center justify-center gap-[1.5cqw] @xs:gap-[2cqw] @md:gap-[2.5cqw]">
            <QrCodeIcon className="h-[4cqw] w-[4cqw] @xs:h-[4.5cqw] @xs:w-[4.5cqw] @md:h-[5cqw] @md:w-[5cqw]" />
            <p className="font-inter text-[3.5cqw] leading-tight @xs:text-[4cqw] @md:text-[4.5cqw] @xl:text-[5cqw]">
              Scan QR code to view full profile
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
