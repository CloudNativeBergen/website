import { CloudNativePattern } from '@/components/CloudNativePattern'
import {
  ArrowRightIcon,
  BuildingOfficeIcon,
  SpeakerWaveIcon,
  StarIcon,
  PresentationChartBarIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline'
import {
  UserIcon,
  MicrophoneIcon,
  TrophyIcon,
  LightBulbIcon,
} from '@heroicons/react/24/solid'
import Image from 'next/image'
import { sanityImage } from '@/lib/sanity/client'
import { Format } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal/formatConfig'
import { SpeakerWithTalks } from '@/lib/speaker/types'

// QR code cache to avoid regenerating the same codes
const qrCodeCache = new Map<string, string>()

// Fallback QR code pattern as a constant
const FALLBACK_QR_CODE =
  "data:image/svg+xml,%3csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='120' height='120' fill='white'/%3e%3cpath d='M10,10 L20,10 L20,20 L10,20 Z M30,10 L40,10 L40,20 L30,20 Z M50,10 L60,10 L60,20 L50,20 Z M70,10 L80,10 L80,20 L70,20 Z M10,30 L20,30 L20,40 L10,40 Z M50,30 L60,30 L60,40 L50,40 Z M70,30 L80,30 L80,40 L70,40 Z M10,50 L20,50 L20,60 L10,60 Z M30,50 L40,50 L40,60 L30,60 Z M50,50 L60,50 L60,60 L50,60 Z M70,50 L80,50 L80,60 L70,60 Z M30,70 L40,70 L40,80 L30,80 Z M50,70 L60,70 L60,80 L50,80 Z' fill='black'/%3e%3c/svg%3e"

// Shared styling constants for consistency
const COMMON_STYLES = {
  gradientBg:
    'relative overflow-hidden rounded-2xl border border-gray-200 transition-all duration-300',
  backgroundPattern: 'absolute inset-0 opacity-10',
  contentWrapper: 'relative',
  socialCard: 'aspect-[4/5] max-w-lg p-8 hover:shadow-xl',
  textTruncate: 'line-clamp-2 px-2',
  iconBase: 'flex-shrink-0',
} as const

/**
 * Extended props interface with better type safety
 */
interface SpeakerPromotionProps {
  /** Speaker data including talks and personal information */
  speaker: SpeakerWithTalks
  /** Visual variant of the component */
  variant?:
    | 'featured'
    | 'card'
    | 'compact'
    | 'minimal'
    | 'speaker-share'
    | 'speaker-spotlight'
  /** Additional CSS classes */
  className?: string
  /** Whether to show as a featured speaker */
  isFeatured?: boolean
  /** Custom call-to-action text */
  ctaText?: string
  /** Custom call-to-action URL (used for both CTA link and QR code generation) */
  ctaUrl?: string
  /** Conference/event name for social variants */
  eventName?: string
}

/**
 * Variant configuration type for better type safety
 */
type VariantConfig = {
  gradient: string
  accentColor: string
  icon: React.ComponentType<{ className?: string }>
}

/**
 * Computed speaker data interface
 */
interface ComputedSpeakerData {
  talks: SpeakerWithTalks['talks']
  primaryTalk: NonNullable<SpeakerWithTalks['talks']>[0] | null
  expertise: string[]
  company: string | undefined
  talkCount: number
}

const variantConfig: Record<
  NonNullable<SpeakerPromotionProps['variant']>,
  VariantConfig
> = {
  featured: {
    gradient: 'from-brand-cloud-blue/20 to-brand-fresh-green/10',
    accentColor: 'text-brand-cloud-blue',
    icon: StarIcon,
  },
  card: {
    gradient: 'from-brand-sky-mist/30 to-brand-glacier-white/20',
    accentColor: 'text-brand-slate-gray',
    icon: UserIcon,
  },
  compact: {
    gradient: 'from-brand-glacier-white/50 to-white',
    accentColor: 'text-brand-cloud-blue',
    icon: MicrophoneIcon,
  },
  minimal: {
    gradient: 'from-white to-brand-glacier-white/50',
    accentColor: 'text-brand-cloud-blue',
    icon: StarIcon,
  },
  'speaker-share': {
    gradient: 'from-brand-cloud-blue to-brand-fresh-green',
    accentColor: 'text-white',
    icon: MicrophoneIcon,
  },
  'speaker-spotlight': {
    gradient: 'from-brand-fresh-green to-brand-cloud-blue',
    accentColor: 'text-white',
    icon: StarIcon,
  },
}

/**
 * Generate QR code data URL for the given URL with caching
 */
async function generateQRCode(url: string): Promise<string> {
  const fullUrl = url.startsWith('http')
    ? url
    : `https://cloudnativebergen.no${url}`

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

/**
 * Memoized helper function to derive expertise areas from speaker talks
 */
const deriveExpertise = (talks: SpeakerWithTalks['talks']): string[] => {
  if (!talks?.length) return []

  const expertise = new Set<string>()
  talks.forEach((talk) => {
    if (talk.format) {
      const formatLabel = formatConfig[talk.format as Format]?.label
      if (formatLabel) {
        expertise.add(formatLabel)
      }
    }
  })
  return Array.from(expertise)
}

/**
 * Memoized helper function to derive company name from speaker title
 */
const deriveCompany = (title: string | undefined): string | undefined => {
  if (!title) return undefined

  // Check for " at " pattern first (more specific)
  if (title.includes(' at ')) {
    return title.split(' at ')[1].trim()
  }

  // Check for "@" pattern
  if (title.includes('@')) {
    return title.split('@')[1].trim()
  }

  return undefined
}

/**
 * Compute all derived speaker data in one function for better performance
 */
function computeSpeakerData(speaker: SpeakerWithTalks): ComputedSpeakerData {
  const talks = speaker.talks || []
  const primaryTalk = talks.length > 0 ? talks[0] : null
  const expertise = deriveExpertise(talks)
  const company = deriveCompany(speaker.title)
  const talkCount = talks.length

  return {
    talks,
    primaryTalk,
    expertise,
    company,
    talkCount,
  }
}

/**
 * Reusable components for SpeakerPromotion variants
 */

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
      <Image
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

  const iconSize = Math.round(size * 0.4)
  return (
    <div
      className={`flex items-center justify-center bg-white/20 ${className}`}
      style={{ width: size, height: size }}
    >
      <UserIcon
        className="text-white/80"
        style={{ width: iconSize, height: iconSize }}
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
      className={`rounded-lg bg-white shadow-lg ${className}`}
      style={{ padding: size * 0.1 }}
      data-qr-code="true"
    >
      <Image
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
  talk: { format?: string }
  size?: 'sm' | 'md' | 'lg'
}

const TalkFormatDisplay = ({ talk, size = 'md' }: TalkFormatDisplayProps) => {
  const talkConfig = formatConfig[talk.format as Format]
  const TalkIcon = talkConfig?.icon || PresentationChartBarIcon

  const sizeClasses = {
    sm: { icon: 'h-3 w-3', text: 'text-xs' },
    md: { icon: 'h-4 w-4', text: 'text-sm' },
    lg: { icon: 'h-5 w-5', text: 'text-base' },
  }

  const classes = sizeClasses[size]

  return (
    <div className="flex items-center justify-center space-x-2">
      <TalkIcon
        className={`${classes.icon} ${talkConfig?.color || 'text-brand-cloud-blue'}`}
      />
      <span className={`font-inter font-semibold ${classes.text}`}>
        {talkConfig?.label || 'Talk'}
      </span>
    </div>
  )
}

// ...existing code...

/**
 * Server-rendered SpeakerPromotion component with multiple visual variants.
 *
 * Features:
 * - Single speaker prop interface with derived fields
 * - High-DPI image support (2x resolution)
 * - Support for featured speakers with badges
 * - Multiple variants: featured, card, compact, minimal, speaker-share, speaker-spotlight
 * - Automatic expertise derivation from talks
 * - Company extraction from title
 * - Server-side QR code generation for social variants
 */
export async function SpeakerPromotion({
  speaker,
  variant = 'card',
  className = '',
  isFeatured = false,
  ctaText,
  ctaUrl,
  eventName = 'Cloud Native Bergen',
}: SpeakerPromotionProps) {
  // Derive computed values
  const { primaryTalk, expertise, company, talkCount } =
    computeSpeakerData(speaker)

  // Get variant config
  const config = variantConfig[variant]
  const Icon = config.icon

  // CTA values
  const finalCtaText = ctaText || (isFeatured ? 'View Speaker' : 'View Profile')
  const finalCtaUrl = ctaUrl || `/speaker/${speaker.slug || speaker._id}`

  // Generate QR code for social variants using server-side generation
  const qrCodeUrl =
    variant === 'speaker-share' || variant === 'speaker-spotlight'
      ? await generateQRCode(finalCtaUrl)
      : undefined

  // Extract speaker properties for cleaner code
  const { name, title, bio, image } = speaker

  if (variant === 'featured') {
    return (
      <div
        className={`group relative overflow-hidden rounded-2xl bg-gradient-to-r ${config.gradient} border border-gray-200 p-6 transition-all duration-300 hover:border-brand-cloud-blue/30 hover:shadow-lg md:p-8 ${className}`}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <CloudNativePattern
            opacity={0.3}
            iconCount={30}
            baseSize={60}
            variant="light"
            className="h-full w-full"
          />
        </div>

        <div className="relative">
          <div className="flex flex-col md:flex-row md:items-center md:space-x-8">
            {/* Speaker Image & Badge */}
            <div className="mb-6 md:mb-0 md:flex-shrink-0">
              <div className="relative">
                <SpeakerImage
                  image={image}
                  name={name}
                  size={120}
                  className="rounded-xl object-cover shadow-lg"
                />
                {isFeatured && (
                  <div className="absolute -top-1 -right-1 rounded-full bg-accent-yellow p-1.5 shadow-lg">
                    <TrophyIcon className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
            </div>

            {/* Speaker Content */}
            <div className="min-w-0 flex-1">
              {/* Speaker Badge */}
              <div className="mb-3 flex items-center space-x-2">
                <Icon className={`h-5 w-5 ${config.accentColor}`} />
                <span
                  className={`font-inter text-sm font-semibold ${config.accentColor}`}
                >
                  Featured Speaker
                </span>
              </div>

              {/* Title & Company */}
              <div className="mb-4">
                <h2 className="font-space-grotesk mb-2 text-2xl font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue md:text-3xl">
                  {name}
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-700">
                  {title && (
                    <span className="font-inter font-semibold">{title}</span>
                  )}
                </div>
              </div>

              {/* Condensed Bio */}
              {bio && (
                <p className="font-inter mb-4 line-clamp-2 leading-relaxed text-gray-600">
                  {bio}
                </p>
              )}

              {/* Talk & Stats Row */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Primary Talk */}
                {primaryTalk && (
                  <div className="rounded-lg border border-white/80 bg-white/60 px-3 py-2">
                    <TalkFormatDisplay talk={primaryTalk} size="sm" />
                  </div>
                )}

                {/* Quick Stats */}
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  {talkCount > 0 && (
                    <div className="flex items-center space-x-1">
                      <SpeakerWaveIcon className="h-4 w-4" />
                      <span className="font-inter">
                        {talkCount} {talkCount === 1 ? 'Talk' : 'Talks'}
                      </span>
                    </div>
                  )}
                  {expertise.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <LightBulbIcon className="h-4 w-4" />
                      <span className="font-inter">
                        {expertise.slice(0, 2).join(', ')}
                        {expertise.length > 2 && ` +${expertise.length - 2}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-6 md:mt-0 md:flex-shrink-0">
              <a
                href={finalCtaUrl}
                className="group font-inter inline-flex items-center space-x-2 rounded-lg bg-brand-cloud-blue px-6 py-3 font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-lg"
              >
                <span>{finalCtaText}</span>
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'speaker-share' || variant === 'speaker-spotlight') {
    return (
      <div
        className={`group relative ${COMMON_STYLES.socialCard} overflow-hidden rounded-2xl bg-gradient-to-br ${config.gradient} border border-gray-200 p-8 transition-all duration-300 hover:shadow-xl ${className}`}
      >
        <div className="relative flex h-full flex-col text-center text-white">
          {/* Header */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-center space-x-2">
              <Icon className="h-5 w-5" />
              <span className="font-inter text-base font-bold">
                {variant === 'speaker-spotlight'
                  ? isFeatured
                    ? 'Featured Speaker'
                    : 'Speaker Spotlight'
                  : "I'm speaking at"}
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
                <h3 className="font-space-grotesk line-clamp-3 text-base leading-tight font-bold">
                  {primaryTalk.title}
                </h3>
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

  if (variant === 'minimal') {
    return (
      <div
        className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${config.gradient} border border-gray-100 p-6 transition-all duration-300 hover:border-brand-cloud-blue/30 hover:shadow-lg ${className}`}
      >
        <div className="relative flex h-full flex-col text-center">
          {/* Speaker Image */}
          <div className="mb-4 flex justify-center">
            <SpeakerImage
              image={image}
              name={name}
              size={100}
              className="rounded-2xl object-cover shadow-md transition-colors duration-300"
            />
          </div>

          {/* Content Area - Flexible */}
          <div className="flex flex-1 flex-col">
            {/* Speaker Name - Large and Bold */}
            <h3 className="font-space-grotesk mb-2 text-xl font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue">
              {name}
            </h3>

            {/* Title - Clean and Prominent */}
            {title && (
              <p className="font-inter mb-3 text-sm leading-relaxed font-semibold text-brand-slate-gray/80">
                {title}
              </p>
            )}

            {/* Company Badge */}
            {company && (
              <div className="mb-4 inline-flex items-center justify-center">
                <div className="inline-flex items-center rounded-full bg-brand-sky-mist px-3 py-1">
                  <BuildingOfficeIcon className="mr-1.5 h-3 w-3 text-brand-cloud-blue" />
                  <span className="font-inter text-xs font-medium text-brand-cloud-blue">
                    {company}
                  </span>
                </div>
              </div>
            )}

            {/* Primary Talk - Minimal Display */}
            {primaryTalk && (
              <div className="mb-4 flex-1">
                <div className="inline-flex items-center rounded-lg bg-white/80 px-3 py-2 shadow-sm">
                  <TalkFormatDisplay talk={primaryTalk} size="sm" />
                </div>
              </div>
            )}
          </div>

          {/* View Profile Button - Always at bottom */}
          <div className="mt-auto">
            <a
              href={finalCtaUrl}
              className="group/btn font-inter inline-flex items-center space-x-2 rounded-xl bg-brand-cloud-blue px-6 py-3 font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-md"
            >
              <span>{finalCtaText}</span>
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div
        className={`group relative overflow-hidden rounded-lg bg-gradient-to-r ${config.gradient} border border-gray-200 p-4 transition-all duration-300 hover:border-gray-300 hover:shadow-md ${className}`}
      >
        <div className="flex items-center space-x-4">
          {/* Speaker Image */}
          <div className="flex-shrink-0">
            <SpeakerImage
              image={image}
              name={name}
              size={60}
              className="rounded-full object-cover"
            />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center space-x-2">
              <h3 className="font-space-grotesk truncate text-lg font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue">
                {name}
              </h3>
              {isFeatured && (
                <TrophyIcon className="h-4 w-4 flex-shrink-0 text-accent-yellow" />
              )}
            </div>
            {title && (
              <p className="font-inter truncate text-sm text-gray-700">
                {title}
              </p>
            )}
            {company && (
              <p className="font-inter truncate text-xs text-gray-600">
                {company}
              </p>
            )}
          </div>

          {/* CTA Arrow */}
          <div className="flex-shrink-0">
            <ArrowRightIcon className="h-5 w-5 text-gray-400 transition-all group-hover:translate-x-1 group-hover:text-brand-cloud-blue" />
          </div>
        </div>
      </div>
    )
  }

  // Default card variant
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all duration-300 hover:border-gray-300 hover:shadow-lg ${className}`}
    >
      <div className="relative flex h-full flex-col">
        {/* Featured Badge (only if featured) */}
        {isFeatured && (
          <div className="mb-3 flex justify-end">
            <TrophyIcon className="h-5 w-5 text-accent-yellow" />
          </div>
        )}

        {/* Horizontal Header: Image + Name + Title */}
        <div className="mb-4 flex items-start space-x-3">
          {/* Speaker Image */}
          <div className="flex-shrink-0">
            <SpeakerImage
              image={image}
              name={name}
              size={60}
              className="rounded-full object-cover shadow-md"
            />
          </div>

          {/* Name, Title & Company */}
          <div className="min-w-0 flex-1">
            {/* Name */}
            <h3 className="font-space-grotesk mb-1 text-lg font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue">
              {name}
            </h3>

            {/* Title */}
            {title && (
              <p className="font-inter mb-1 line-clamp-1 text-sm font-semibold text-gray-700">
                {title}
              </p>
            )}

            {/* Company */}
            {company && (
              <div className="flex items-center space-x-1">
                <BuildingOfficeIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="font-inter line-clamp-1 text-xs text-gray-600">
                  {company}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content Area - Flexible */}
        <div className="flex-1">
          {/* Bio */}
          {bio && (
            <div className="mb-3 rounded-lg bg-white/50 p-2">
              <p className="font-inter line-clamp-2 text-xs text-gray-600">
                {bio}
              </p>
            </div>
          )}

          {/* Primary Talk */}
          {primaryTalk && (
            <div className="mb-3 rounded-lg border border-gray-100 bg-white/80 p-2">
              <div className="flex items-center space-x-2">
                <TalkFormatDisplay talk={primaryTalk} size="sm" />
                <div className="min-w-0 flex-1">
                  <h4 className="font-space-grotesk line-clamp-1 text-xs font-semibold text-brand-slate-gray">
                    {primaryTalk.title}
                  </h4>
                </div>
              </div>
            </div>
          )}

          {/* Expertise Tags */}
          {expertise.length > 0 && (
            <div className="mb-3">
              <div className="flex flex-wrap gap-1">
                {expertise.slice(0, 3).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-brand-cloud-blue/10 px-2 py-0.5 text-xs font-medium text-brand-cloud-blue"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: Talk Count + CTA - Always at bottom */}
        <div className="mt-auto flex items-center justify-between pt-2">
          {/* Talk Count */}
          {talkCount > 0 ? (
            <div className="flex items-center space-x-1">
              <SpeakerWaveIcon className="h-4 w-4 text-gray-400" />
              <span className="font-inter text-xs text-gray-700">
                {talkCount} {talkCount === 1 ? 'Talk' : 'Talks'}
              </span>
            </div>
          ) : (
            <div></div> // Empty div to maintain layout when no talks
          )}

          {/* CTA */}
          <a
            href={finalCtaUrl}
            className="group/cta font-inter inline-flex items-center space-x-1 text-xs font-semibold text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80"
          >
            <span>{finalCtaText}</span>
            <ArrowRightIcon className="h-3 w-3 transition-transform group-hover/cta:translate-x-1" />
          </a>
        </div>
      </div>
    </div>
  )
}
