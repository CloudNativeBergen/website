'use client'

import { QrCodeIcon } from '@heroicons/react/24/outline'
import { MicrophoneIcon, StarIcon } from '@heroicons/react/24/solid'
import { speakerImageUrl } from '@/lib/sanity/client'
import { Format } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import { SpeakerAvatarImage } from '@/components/common/SpeakerAvatarImage'
import { useStudioFormat } from '@/components/common/image-capture'
import { DEFAULT_STUDIO_FORMAT, type StudioFormat } from '@/lib/marketing-asset'
import { CardFrame, QrBadge } from './CardFrame'

export type SpeakerCardVariant = 'speaker-share' | 'speaker-spotlight'

const variantConfig: Record<
  SpeakerCardVariant,
  {
    gradient: string
    icon: React.ComponentType<{ className?: string }>
    headerText: (isFeatured: boolean) => string
  }
> = {
  'speaker-share': {
    gradient: 'from-brand-cloud-blue to-brand-fresh-green',
    icon: MicrophoneIcon,
    headerText: () => "I'm speaking at",
  },
  'speaker-spotlight': {
    gradient: 'from-brand-fresh-green to-brand-cloud-blue',
    icon: StarIcon,
    headerText: (isFeatured) =>
      isFeatured ? 'Featured Speaker' : 'Speaker Spotlight',
  },
}

const QR_ALT = 'QR Code - Scan to view speaker profile'

/**
 * The elements a speaker card keeps in every Format (docs/MARKETING_STUDIO_
 * FORMATS_SPEC.md §3), as `data-card-element` values: only their place and
 * size change between Formats. Nothing is dropped.
 */
export const SPEAKER_CARD_ELEMENTS = [
  'header',
  'event',
  'photo',
  'name',
  'talk',
  'qr',
] as const

/**
 * What the card shows of a speaker: only this crosses to the client, never the
 * whole speaker with their email and every proposal body.
 */
export interface SpeakerCardSpeaker {
  name: string
  title?: string
  /** A Sanity image reference or a plain URL. */
  image?: string
  talks?: { title?: string; format?: string }[]
}

export interface SpeakerCardProps {
  speaker: SpeakerCardSpeaker
  /** A data URL; empty leaves the QR out (it would point nowhere). */
  qrCodeUrl: string
  variant?: SpeakerCardVariant
  isFeatured?: boolean
  eventName?: string
  showCloudNativePattern?: boolean
  /** Fixed; otherwise the studio tab's Format switch, otherwise square. */
  format?: StudioFormat
  className?: string
}

function Photo({
  speaker,
  className,
}: {
  speaker: SpeakerCardSpeaker
  className: string
}) {
  const { image, name } = speaker
  return (
    <div
      data-card-element="photo"
      className={`relative shrink-0 overflow-hidden shadow-lg ${className}`}
    >
      {image ? (
        <SpeakerAvatarImage
          src={speakerImageUrl(image, { width: 800, height: 800, fit: 'crop' })}
          name={name}
          size={400}
        />
      ) : (
        <MissingAvatar
          name={name}
          size={400}
          className="absolute inset-0 flex items-center justify-center rounded-[inherit]"
          textSizeClass="text-2xl font-bold text-white z-10"
        />
      )}
    </div>
  )
}

function Talk({
  talk,
  size,
}: {
  talk: { format?: string; title?: string }
  size: { box: string; icon: string; label: string; title: string }
}) {
  const talkConfig = formatConfig[talk.format as Format]
  const TalkIcon = talkConfig?.icon || MicrophoneIcon
  return (
    <div
      data-card-element="talk"
      className={`rounded-[1.5cqw] bg-white/20 backdrop-blur-sm ${size.box}`}
    >
      <div className="flex items-center justify-center gap-[1.5cqw]">
        <TalkIcon
          className={`${size.icon} ${talkConfig?.color || 'text-brand-cloud-blue'}`}
        />
        <span className={`font-inter font-semibold ${size.label}`}>
          {talkConfig?.label || 'Talk'}
        </span>
      </div>
      {talk.title && (
        <h3
          className={`font-space-grotesk mt-[1cqw] leading-tight font-bold ${size.title}`}
        >
          {talk.title}
        </h3>
      )}
    </div>
  )
}

/**
 * A speaker's share card in a Format (spec §3). Square is the layout the card
 * always had, at 1080; landscape puts the photo left at full height and stacks
 * the words on the right with the QR in the lower right; portrait keeps the
 * square's stack, spends the extra height on the talk title and puts the QR
 * below. A QR code is a prop: this is a client component, and the code is
 * generated on the server by `SpeakerShare`.
 */
export function SpeakerCard({
  speaker,
  qrCodeUrl,
  variant = 'speaker-share',
  isFeatured = false,
  eventName,
  showCloudNativePattern = false,
  format: fixedFormat,
  className = '',
}: SpeakerCardProps) {
  const tabFormat = useStudioFormat()
  const format = fixedFormat ?? tabFormat ?? DEFAULT_STUDIO_FORMAT
  const config = variantConfig[variant]
  const Icon = config.icon
  const talk = speaker.talks?.[0] ?? null
  const { name, title } = speaker

  const header = (size: { row: string; icon: string; kicker: string }) => (
    <div
      data-card-element="header"
      className={`flex items-center gap-[2cqw] ${size.row}`}
    >
      <Icon className={size.icon} />
      <span className={`font-inter leading-tight font-bold ${size.kicker}`}>
        {config.headerText(isFeatured)}
      </span>
    </div>
  )
  const event = (size: string) => (
    <h1
      data-card-element="event"
      className={`font-space-grotesk leading-tight font-bold ${size}`}
    >
      {eventName}
    </h1>
  )
  const speakerName = (size: string) => (
    <h2
      data-card-element="name"
      className={`font-space-grotesk leading-tight font-bold ${size}`}
    >
      {name}
    </h2>
  )
  const jobTitle = (size: string) =>
    title ? (
      <p
        className={`font-inter leading-tight font-semibold text-white/90 ${size}`}
      >
        {title}
      </p>
    ) : null
  const scanLine = (size: { icon: string; text: string; row: string }) => (
    <div className={`flex items-center gap-[1.5cqw] ${size.row}`}>
      <QrCodeIcon className={`shrink-0 ${size.icon}`} />
      <p className={`font-inter leading-tight ${size.text}`}>
        Scan QR code to view full profile
      </p>
    </div>
  )

  const frame = {
    kind: 'speaker' as const,
    format,
    gradient: config.gradient,
    pattern: showCloudNativePattern,
    seed: 42,
    className,
  }

  if (format === 'landscape') {
    return (
      <CardFrame {...frame}>
        <div className="flex h-full gap-[3cqw] p-[3cqw] text-left">
          <Photo
            speaker={speaker}
            className="aspect-square h-full rounded-[2cqw]"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="shrink-0">
              {header({
                row: 'mb-[0.5cqw]',
                icon: 'h-[2.8cqw] w-[2.8cqw]',
                kicker: 'text-[2.4cqw]',
              })}
              {event('line-clamp-2 text-[3.4cqw]')}
            </header>
            <main className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
              {speakerName('text-[4cqw]')}
              {jobTitle('mt-[0.4cqw] line-clamp-1 text-[2.4cqw]')}
              {talk && (
                <div className="mt-[1.2cqw] [&>[data-card-element=talk]>div]:justify-start">
                  <Talk
                    talk={talk}
                    size={{
                      box: 'p-[1.2cqw]',
                      icon: 'h-[2.2cqw] w-[2.2cqw]',
                      label: 'text-[2.2cqw]',
                      title: 'line-clamp-2 text-[2.8cqw]',
                    }}
                  />
                </div>
              )}
            </main>
            <footer className="mt-[1cqw] flex shrink-0 items-end justify-between gap-[2cqw]">
              {scanLine({
                row: 'pb-[0.4cqw]',
                icon: 'h-[2cqw] w-[2cqw]',
                text: 'text-[2cqw]',
              })}
              <QrBadge url={qrCodeUrl} alt={QR_ALT} size={9} />
            </footer>
          </div>
        </div>
      </CardFrame>
    )
  }

  if (format === 'portrait') {
    return (
      <CardFrame {...frame}>
        <div className="flex h-full flex-col items-center p-[4cqw] text-center">
          <header className="mb-[3cqw] shrink-0">
            {header({
              row: 'mb-[1cqw] justify-center',
              icon: 'h-[6cqw] w-[6cqw]',
              kicker: 'text-[4.5cqw]',
            })}
            {event('line-clamp-2 px-[1cqw] text-[6cqw]')}
          </header>
          <Photo
            speaker={speaker}
            className="mb-[3cqw] h-[30cqw] w-[30cqw] rounded-[2.5cqw]"
          />
          <main className="flex w-full flex-1 flex-col justify-center px-[1cqw]">
            {speakerName('text-[6.5cqw]')}
            {jobTitle('mt-[1cqw] line-clamp-2 text-[4.5cqw]')}
            {talk && (
              <div className="mx-[1cqw] mt-[2.5cqw]">
                <Talk
                  talk={talk}
                  size={{
                    box: 'p-[2.5cqw]',
                    icon: 'h-[4cqw] w-[4cqw]',
                    label: 'text-[3.5cqw]',
                    title: 'line-clamp-3 text-[5cqw]',
                  }}
                />
              </div>
            )}
          </main>
          <footer className="mt-[3cqw] flex shrink-0 flex-col items-center">
            <QrBadge url={qrCodeUrl} alt={QR_ALT} size={18} />
            {scanLine({
              row: 'mt-[1.5cqw] justify-center',
              icon: 'h-[4cqw] w-[4cqw]',
              text: 'text-[3.5cqw]',
            })}
          </footer>
        </div>
      </CardFrame>
    )
  }

  return (
    <CardFrame {...frame}>
      <div className="flex h-full flex-col p-[3cqw] text-center">
        <header className="mb-[3cqw] shrink-0">
          {header({
            row: 'mb-[1cqw] justify-center',
            icon: 'h-[6cqw] w-[6cqw]',
            kicker: 'text-[4.5cqw]',
          })}
          {event('line-clamp-2 px-[1cqw] text-[6cqw]')}
        </header>
        <section className="mb-[2cqw] flex shrink-0 items-center justify-center gap-[7cqw]">
          <Photo
            speaker={speaker}
            className="h-[25cqw] w-[25cqw] rounded-[2cqw]"
          />
          <QrBadge url={qrCodeUrl} alt={QR_ALT} size={25} />
        </section>
        <main className="flex flex-1 flex-col justify-center px-[1cqw]">
          {speakerName('text-[6cqw]')}
          {jobTitle('mt-[1cqw] line-clamp-2 text-[4.5cqw]')}
          {talk && (
            <div className="mx-[1cqw] mt-[2cqw]">
              <Talk
                talk={talk}
                size={{
                  box: 'p-[2cqw]',
                  icon: 'h-[4cqw] w-[4cqw]',
                  label: 'text-[3.5cqw]',
                  title: 'line-clamp-2 text-[4cqw]',
                }}
              />
            </div>
          )}
        </main>
        <footer className="mt-[1cqw] shrink-0">
          {scanLine({
            row: 'justify-center',
            icon: 'h-[4cqw] w-[4cqw]',
            text: 'text-[3.5cqw]',
          })}
        </footer>
      </div>
    </CardFrame>
  )
}
