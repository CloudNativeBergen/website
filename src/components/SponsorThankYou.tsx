import { QrCodeIcon } from '@heroicons/react/24/outline'
import {
  StarIcon,
  RocketLaunchIcon,
  CpuChipIcon,
  CodeBracketIcon,
  CommandLineIcon,
  BoltIcon,
} from '@heroicons/react/24/solid'
import { CloudNativePattern } from '@/components/CloudNativePattern'
import { InlineSvg } from './InlineSvg'

interface SponsorData {
  _id: string
  name: string
  website?: string
  logo?: string
  logo_bright?: string
}

interface SponsorTierData {
  title: string
  tagline?: string
  tier_type: 'standard' | 'special'
}

type SponsorVariant =
  | 'code-heroes'
  | 'cloud-wizards'
  | 'tech-ninjas'
  | 'deploy-legends'
  | 'kubernetes-masters'
  | 'devops-rockstars'

interface SponsorThankYouProps {
  sponsor: SponsorData
  tier: SponsorTierData
  variant?: SponsorVariant
  className?: string
  eventName?: string
  eventDate?: string
  showCloudNativePattern?: boolean
  ctaUrl?: string
}

interface VariantConfig {
  gradient: string
  accentColor: string
  icon: React.ComponentType<{ className?: string }>
  headerText: string
  footerText: string
}

const qrCodeCache = new Map<string, string>()
const FALLBACK_QR_CODE =
  "data:image/svg+xml,%3csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='120' height='120' fill='white'/%3e%3cpath d='M10,10 L20,10 L20,20 L10,20 Z M30,10 L40,10 L40,20 L30,20 Z M50,10 L60,10 L60,20 L50,20 Z M70,10 L80,10 L80,20 L70,20 Z M10,30 L20,30 L20,40 L10,40 Z M50,30 L60,30 L60,40 L50,40 Z M70,30 L80,30 L80,40 L70,40 Z M10,50 L20,50 L20,60 L10,60 Z M30,50 L40,50 L40,60 L30,60 Z M50,50 L60,50 L60,60 L50,60 Z M70,50 L80,50 L80,60 L70,60 Z M30,70 L40,70 L40,80 L30,80 Z M50,70 L60,70 L60,80 L50,80 Z' fill='black'/%3e%3c/svg%3e"

const variantConfig: Record<SponsorVariant, VariantConfig> = {
  'code-heroes': {
    gradient: 'from-brand-fresh-green to-brand-cloud-blue',
    accentColor: 'text-white',
    icon: CodeBracketIcon,
    headerText: 'Code Heroes',
    footerText:
      'Your support powers our community of cloud native developers and innovators',
  },
  'cloud-wizards': {
    gradient: 'from-brand-cloud-blue to-brand-sunbeam-yellow',
    accentColor: 'text-white',
    icon: RocketLaunchIcon,
    headerText: 'Cloud Wizards',
    footerText:
      'Casting spells in the cloud and making distributed systems magic happen',
  },
  'tech-ninjas': {
    gradient: 'from-purple-600 to-brand-fresh-green',
    accentColor: 'text-white',
    icon: CommandLineIcon,
    headerText: 'Tech Ninjas',
    footerText:
      'Stealthily deploying awesome tech and enabling developer superpowers',
  },
  'deploy-legends': {
    gradient: 'from-brand-sunbeam-yellow to-brand-fresh-green',
    accentColor: 'text-white',
    icon: BoltIcon,
    headerText: 'Deploy Legends',
    footerText:
      'Epic deployments require epic partners - thanks for being legendary',
  },
  'kubernetes-masters': {
    gradient: 'from-indigo-600 to-brand-cloud-blue',
    accentColor: 'text-white',
    icon: CpuChipIcon,
    headerText: 'K8s Masters',
    footerText:
      'Orchestrating containers and communities with style and precision',
  },
  'devops-rockstars': {
    gradient: 'from-brand-fresh-green to-emerald-600',
    accentColor: 'text-white',
    icon: StarIcon,
    headerText: 'DevOps Rockstars',
    footerText:
      'Rocking the infrastructure stage and making CI/CD dreams come true',
  },
}

async function generateQRCode(url: string, size = 256): Promise<string> {
  const fullUrl = url.startsWith('http')
    ? url
    : `https://cloudnativedays.no${url}`
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

const SponsorLogo = ({
  sponsor,
  size,
  className = '',
}: {
  sponsor: SponsorData
  size: number
  className?: string
}) => {
  const logoSrc = sponsor.logo_bright || sponsor.logo
  const dimensions = { width: `${size}cqw`, height: `${size * 0.4}cqw` }

  if (logoSrc) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={dimensions}
      >
        <InlineSvg
          value={logoSrc}
          className="flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:max-h-full [&>svg]:w-full [&>svg]:max-w-full [&>svg]:object-contain"
        />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-[1cqw] bg-white/10 p-[2cqw] backdrop-blur-sm ${className}`}
      style={dimensions}
    >
      <span className="text-center text-[4cqw] font-bold text-white @xs:text-[4.5cqw] @md:text-[5cqw]">
        {sponsor.name}
      </span>
    </div>
  )
}

const QRCodeDisplay = ({
  qrCodeUrl,
  size,
  className = '',
}: {
  qrCodeUrl?: string
  size: number
  className?: string
}) => {
  if (!qrCodeUrl) return null

  return (
    <div
      className={`rounded-[1.5cqw] bg-white shadow-lg ${className}`}
      style={{
        padding: `${Math.max(0.3, size * 0.04)}cqw`,
        width: `${size}cqw`,
        height: `${size}cqw`,
      }}
    >
      <img
        src={qrCodeUrl}
        alt="QR Code - Learn more about our partnership"
        className="h-full w-full object-cover"
        style={{ imageRendering: 'crisp-edges' }}
      />
    </div>
  )
}

export async function SponsorThankYou({
  sponsor,
  variant = 'code-heroes',
  className = '',
  eventName = 'Cloud Native Days',
  eventDate,
  showCloudNativePattern = false,
  ctaUrl,
}: SponsorThankYouProps) {
  const config = variantConfig[variant]
  const Icon = config.icon
  const finalCtaUrl = ctaUrl || '/'
  const qrCodeUrl = await generateQRCode(finalCtaUrl, 512)
  const backgroundStyle = showCloudNativePattern
    ? 'from-slate-900 via-blue-900 to-slate-900'
    : config.gradient

  return (
    <div
      className={`group @container relative overflow-hidden rounded-2xl bg-linear-to-br ${backgroundStyle} border border-gray-200 transition-all duration-300 hover:shadow-xl ${className}`}
      style={{ aspectRatio: '16/9' }}
    >
      {showCloudNativePattern && (
        <CloudNativePattern
          className="absolute inset-0"
          variant="dark"
          opacity={0.25}
          animated
          baseSize={35}
          iconCount={45}
          seed={sponsor._id.length}
        />
      )}

      <div className="relative flex h-full text-white">
        <div className="flex flex-1 flex-col justify-between p-[3cqw] pr-[1cqw] @xs:p-[4cqw] @xs:pr-[1.5cqw] @md:p-[5cqw] @md:pr-[2cqw] @xl:p-[6cqw] @xl:pr-[2.5cqw]">
          <header className="shrink-0">
            <div className="mb-[1cqw] flex items-center gap-[2cqw] @xs:mb-[1.5cqw] @xs:gap-[2.5cqw] @md:mb-[2cqw] @md:gap-[3cqw]">
              <Icon className="h-[5cqw] w-[5cqw] @xs:h-[5.5cqw] @xs:w-[5.5cqw] @md:h-[6cqw] @md:w-[6cqw] @xl:h-[7cqw] @xl:w-[7cqw]" />
              <span className="font-inter text-[3.5cqw] leading-tight font-bold @xs:text-[4cqw] @md:text-[4.5cqw] @xl:text-[5cqw]">
                {config.headerText}
              </span>
            </div>
            <h1 className="font-space-grotesk text-[5cqw] leading-tight font-bold @xs:text-[5.5cqw] @md:text-[6.5cqw] @xl:text-[7.5cqw]">
              {eventName}
            </h1>
            {eventDate && (
              <p className="font-inter mt-[1cqw] text-[2.5cqw] font-medium text-white/90 @xs:text-[3cqw] @md:text-[3.5cqw]">
                {eventDate}
              </p>
            )}
          </header>

          <footer className="shrink-0">
            <p className="font-inter text-[2.5cqw] leading-tight font-medium @xs:text-[3cqw] @md:text-[3.5cqw] @xl:text-[4cqw]">
              {config.footerText}
            </p>
          </footer>
        </div>

        <div className="flex w-[50%] flex-col justify-between p-[3cqw] @xs:p-[4cqw] @md:p-[5cqw] @xl:p-[6cqw]">
          <div className="flex-[0.8]"></div>
          <div className="flex flex-1 items-center justify-center">
            <SponsorLogo sponsor={sponsor} size={45} className="shrink-0" />
          </div>
          <div className="flex-[1.2]"></div>
          <div className="flex shrink-0 flex-col items-center gap-[2cqw]">
            <QRCodeDisplay
              qrCodeUrl={qrCodeUrl}
              size={12}
              className="shrink-0"
            />
            <div className="flex items-center justify-center gap-[1cqw] @xs:gap-[1.5cqw] @md:gap-[2cqw]">
              <QrCodeIcon className="h-[2.5cqw] w-[2.5cqw] @xs:h-[3cqw] @xs:w-[3cqw] @md:h-[3.5cqw] @md:w-[3.5cqw]" />
              <p className="font-inter text-center text-[2cqw] leading-tight @xs:text-[2.5cqw] @md:text-[3cqw] @xl:text-[3.5cqw]">
                Event info
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
