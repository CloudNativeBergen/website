'use client'

import { QrCodeIcon } from '@heroicons/react/24/outline'
import {
  StarIcon,
  RocketLaunchIcon,
  CpuChipIcon,
  CodeBracketIcon,
  CommandLineIcon,
  BoltIcon,
} from '@heroicons/react/24/solid'
import { InlineSvg } from '@/components/InlineSvg'
import type { StudioFormat } from '@/lib/marketing-asset'
import {
  CardFrame,
  QrBadge,
  useCardFormat,
  type IconLineSizes,
} from './CardFrame'

export interface SponsorCardSponsor {
  _id: string
  name: string
  website?: string
  logo?: string
  logoBright?: string
}

export interface SponsorCardTier {
  title: string
  tagline?: string
  tierType: 'standard' | 'special'
}

import type { SponsorCardVariant } from './variants'
export type { SponsorCardVariant } from './variants'

const variantConfig: Record<
  SponsorCardVariant,
  {
    gradient: string
    icon: React.ComponentType<{ className?: string }>
    headerText: string
    footerText: string
  }
> = {
  'code-heroes': {
    gradient: 'from-brand-fresh-green to-brand-cloud-blue',
    icon: CodeBracketIcon,
    headerText: 'Code Heroes',
    footerText:
      'Your support powers our community of developers and innovators',
  },
  'cloud-wizards': {
    gradient: 'from-brand-cloud-blue to-brand-sunbeam-yellow',
    icon: RocketLaunchIcon,
    headerText: 'Cloud Wizards',
    footerText:
      'Casting spells in the cloud and making distributed systems magic happen',
  },
  'tech-ninjas': {
    gradient: 'from-purple-600 to-brand-fresh-green',
    icon: CommandLineIcon,
    headerText: 'Tech Ninjas',
    footerText:
      'Stealthily deploying awesome tech and enabling developer superpowers',
  },
  'deploy-legends': {
    gradient: 'from-brand-sunbeam-yellow to-brand-fresh-green',
    icon: BoltIcon,
    headerText: 'Deploy Legends',
    footerText:
      'Epic deployments require epic partners - thanks for being legendary',
  },
  'kubernetes-masters': {
    gradient: 'from-indigo-600 to-brand-cloud-blue',
    icon: CpuChipIcon,
    headerText: 'K8s Masters',
    footerText:
      'Orchestrating containers and communities with style and precision',
  },
  'devops-rockstars': {
    gradient: 'from-brand-fresh-green to-emerald-600',
    icon: StarIcon,
    headerText: 'DevOps Rockstars',
    footerText:
      'Rocking the infrastructure stage and making CI/CD dreams come true',
  },
}

const QR_ALT = 'QR Code - Learn more about our partnership'

/**
 * The elements a sponsor card keeps in every Format (docs/MARKETING_STUDIO_
 * FORMATS_SPEC.md §3), as `data-card-element` values. Nothing is dropped by
 * a Format; `qr` is present when there is a code to show.
 */
export const SPONSOR_CARD_ELEMENTS = [
  'header',
  'event',
  'logo',
  'tier',
  'tagline',
  'qr',
] as const

export interface SponsorCardProps {
  sponsor: SponsorCardSponsor
  tier: SponsorCardTier
  /** A data URL; empty leaves the QR out (it would point nowhere). */
  qrCodeUrl: string
  variant?: SponsorCardVariant
  eventName: string
  eventDate?: string
  showCloudNativePattern?: boolean
  /** Fixed; otherwise the studio tab's Format switch, otherwise square. */
  format?: StudioFormat
  className?: string
}

/** The logo, `size` hundredths of the card's width wide and 2:5 as tall. */
function Logo({
  sponsor,
  size,
}: {
  sponsor: SponsorCardSponsor
  size: number
}) {
  const logoSrc = sponsor.logoBright || sponsor.logo
  const dimensions = { width: `${size}cqw`, height: `${size * 0.4}cqw` }
  if (logoSrc) {
    return (
      <div
        data-card-element="logo"
        className="flex shrink-0 items-center justify-center"
        style={dimensions}
      >
        <InlineSvg
          value={logoSrc}
          className="flex size-full items-center justify-center [&>svg]:h-full [&>svg]:max-h-full [&>svg]:w-full [&>svg]:max-w-full [&>svg]:object-contain"
        />
      </div>
    )
  }
  // No logo: the name, sized to the box so a long one wraps inside it.
  return (
    <div
      data-card-element="logo"
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[1cqw] bg-white/10 p-[1.5cqw] backdrop-blur-sm"
      style={dimensions}
    >
      <span
        className="line-clamp-2 text-center leading-tight font-bold"
        style={{ fontSize: `${size * 0.1}cqw` }}
      >
        {sponsor.name}
      </span>
    </div>
  )
}

/**
 * A sponsor's thank-you card in a Format (spec §3). Square stacks header,
 * event line, tagline, logo, tier and QR; landscape is the old 16:9 card
 * widened to 1.91:1 with the logo left and the words right; portrait stacks
 * with the logo given the middle third. The QR code is generated on the
 * server by `SponsorThankYou`.
 */
export function SponsorCard({
  sponsor,
  tier,
  qrCodeUrl,
  variant = 'code-heroes',
  eventName,
  eventDate,
  showCloudNativePattern = false,
  format: fixedFormat,
  className = '',
}: SponsorCardProps) {
  const format = useCardFormat(fixedFormat)
  const config = variantConfig[variant]
  const Icon = config.icon

  const header = (size: IconLineSizes) => (
    <div
      data-card-element="header"
      className={`flex items-center gap-[2cqw] ${size.row}`}
    >
      <Icon className={`shrink-0 ${size.icon}`} />
      <span className={`font-inter leading-tight font-bold ${size.text}`}>
        {config.headerText}
      </span>
    </div>
  )
  const event = (size: { name: string; date: string }) => (
    <div data-card-element="event">
      <h1
        className={`font-space-grotesk line-clamp-2 leading-tight font-bold ${size.name}`}
      >
        {eventName}
      </h1>
      {eventDate && (
        <p className={`font-inter font-medium text-white/90 ${size.date}`}>
          {eventDate}
        </p>
      )}
    </div>
  )
  const tierLine = (size: IconLineSizes) => (
    <div
      data-card-element="tier"
      className={`flex items-center gap-[1.5cqw] ${size.row}`}
    >
      {/* The brand variable, not `text-brand-sunbeam-yellow`: its `.dark`
          override would make a downloaded card follow the admin theme. */}
      <StarIcon
        className={`shrink-0 text-[color:var(--color-brand-sunbeam-yellow)] ${size.icon}`}
      />
      <span
        className={`font-space-grotesk line-clamp-1 leading-tight font-bold ${size.text}`}
      >
        {tier.title} Sponsor
      </span>
    </div>
  )
  const tagline = (size: string) => (
    <p
      data-card-element="tagline"
      className={`font-inter leading-snug font-medium text-white/90 ${size}`}
    >
      {config.footerText}
    </p>
  )
  const eventInfo = (size: IconLineSizes) => (
    <div className={`flex items-center gap-[1cqw] ${size.row}`}>
      <QrCodeIcon className={`shrink-0 ${size.icon}`} />
      <p className={`font-inter leading-tight ${size.text}`}>Event info</p>
    </div>
  )

  const frame = {
    kind: 'sponsor' as const,
    format,
    gradient: config.gradient,
    pattern: showCloudNativePattern,
    seed: sponsor._id.length,
    className,
  }

  if (format === 'landscape') {
    return (
      <CardFrame {...frame}>
        <div
          data-layout="landscape"
          className="flex h-full gap-[3cqw] p-[3.5cqw] text-left"
        >
          <div className="flex w-[38cqw] shrink-0 items-center justify-center">
            <Logo sponsor={sponsor} size={36} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <header className="shrink-0">
              {header({
                row: 'mb-[0.5cqw]',
                icon: 'size-[4cqw]',
                text: 'text-[3cqw]',
              })}
              {event({
                name: 'text-[4.5cqw]',
                date: 'mt-[0.5cqw] text-[2.5cqw]',
              })}
            </header>
            <div className="min-h-0 shrink-0 py-[1cqw]">
              {tierLine({
                row: 'mb-[1cqw]',
                icon: 'size-[3cqw]',
                text: 'text-[3.5cqw]',
              })}
              {tagline('line-clamp-2 text-[2.4cqw]')}
            </div>
            <footer className="flex shrink-0 items-end justify-end gap-[2cqw]">
              {eventInfo({
                row: 'pb-[0.5cqw]',
                icon: 'size-[2.5cqw]',
                text: 'text-[2.5cqw]',
              })}
              <QrBadge url={qrCodeUrl} alt={QR_ALT} size={10} />
            </footer>
          </div>
        </div>
      </CardFrame>
    )
  }

  if (format === 'portrait') {
    return (
      <CardFrame {...frame}>
        <div
          data-layout="portrait"
          className="flex h-full flex-col items-center p-[5cqw] text-center"
        >
          <header className="shrink-0">
            {header({
              row: 'mb-[1cqw] justify-center',
              icon: 'size-[5cqw]',
              text: 'text-[3.5cqw]',
            })}
            {event({ name: 'text-[6cqw]', date: 'mt-[1cqw] text-[3cqw]' })}
          </header>
          <div className="flex min-h-[36cqw] flex-1 items-center justify-center">
            <Logo sponsor={sponsor} size={60} />
          </div>
          <div className="flex shrink-0 flex-col items-center">
            {tierLine({
              row: 'mb-[2cqw] justify-center',
              icon: 'size-[4.5cqw]',
              text: 'text-[4.5cqw]',
            })}
            {tagline('line-clamp-3 px-[4cqw] text-[3.2cqw]')}
          </div>
          <footer className="mt-[5cqw] flex shrink-0 flex-col items-center">
            <QrBadge url={qrCodeUrl} alt={QR_ALT} size={20} />
            {eventInfo({
              row: 'mt-[1.5cqw] justify-center',
              icon: 'size-[3cqw]',
              text: 'text-[3cqw]',
            })}
          </footer>
        </div>
      </CardFrame>
    )
  }

  return (
    <CardFrame {...frame}>
      <div
        data-layout="square"
        className="flex h-full flex-col items-center justify-between p-[5cqw] text-center"
      >
        <header className="shrink-0">
          {header({
            row: 'mb-[1cqw] justify-center',
            icon: 'size-[5cqw]',
            text: 'text-[3.5cqw]',
          })}
          {event({ name: 'text-[6cqw]', date: 'mt-[0.5cqw] text-[3cqw]' })}
        </header>
        {tagline('line-clamp-2 px-[4cqw] text-[3.2cqw]')}
        <Logo sponsor={sponsor} size={50} />
        {tierLine({
          row: 'justify-center',
          icon: 'size-[4cqw]',
          text: 'text-[4.5cqw]',
        })}
        <footer className="flex shrink-0 flex-col items-center">
          <QrBadge url={qrCodeUrl} alt={QR_ALT} size={18} />
          {eventInfo({
            row: 'mt-[1cqw] justify-center',
            icon: 'size-[2.5cqw]',
            text: 'text-[2.5cqw]',
          })}
        </footer>
      </div>
    </CardFrame>
  )
}
