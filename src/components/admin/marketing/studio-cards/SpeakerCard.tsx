'use client'

import { QrCodeIcon } from '@heroicons/react/24/outline'
import { MicrophoneIcon, StarIcon } from '@heroicons/react/24/solid'
import { speakerImageUrl } from '@/lib/sanity/client'
import { Format } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import { SpeakerAvatarImage } from '@/components/common/SpeakerAvatarImage'
import type { StudioFormat } from '@/lib/marketing-asset'
import {
  CardFrame,
  QrBadge,
  useCardFormat,
  type IconLineSizes,
} from './CardFrame'

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
 * size change between Formats. Nothing is dropped by a Format; `talk` is
 * present when the speaker has a talk and `qr` when there is a code to show.
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
  eventName: string
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

/**
 * A talk Format's `text-*` colour class as its theme variable. The
 * `text-brand-*` classes have `.dark` overrides, which would make a
 * downloaded card follow the organizer's admin theme (as the promo's count
 * icons did, #1250); the variable is the same in both.
 */
function themeFreeColor(textClass = 'text-brand-cloud-blue'): string {
  return `var(--color-${textClass.replace(/^text-/, '')})`
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
          className={size.icon}
          style={{ color: themeFreeColor(talkConfig?.color) }}
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
  const format = useCardFormat(fixedFormat)
  const config = variantConfig[variant]
  const Icon = config.icon
  const talk = speaker.talks?.[0] ?? null
  const { name, title } = speaker

  const header = (size: IconLineSizes) => (
    <div
      data-card-element="header"
      className={`flex items-center gap-[2cqw] ${size.row}`}
    >
      <Icon className={size.icon} />
      <span className={`font-inter leading-tight font-bold ${size.text}`}>
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
        <div
          data-layout="landscape"
          className="flex h-full gap-[2.5cqw] p-[2.5cqw] text-left"
        >
          <Photo
            speaker={speaker}
            className="aspect-square h-full rounded-[2cqw]"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="shrink-0">
              {header({
                row: 'mb-[0.5cqw]',
                icon: 'size-[2.8cqw]',
                text: 'text-[2.4cqw]',
              })}
              {event('line-clamp-2 text-[3cqw]')}
            </header>
            {/* Top-anchored: the name and title keep their clamped lines and
                only the talk box gives way, clipped at its own bottom, so long
                words never climb into the header or push the QR out. */}
            <main className="mt-[1.2cqw] flex min-h-0 flex-1 flex-col">
              {speakerName('line-clamp-2 shrink-0 text-[3.4cqw]')}
              {jobTitle('mt-[0.4cqw] line-clamp-1 shrink-0 text-[2.2cqw]')}
              {talk && (
                <div className="mt-[1cqw] min-h-0 overflow-hidden [&>[data-card-element=talk]>div]:justify-start">
                  <Talk
                    talk={talk}
                    size={{
                      box: 'p-[1.2cqw]',
                      icon: 'size-[2.2cqw]',
                      label: 'text-[2.2cqw]',
                      title: 'line-clamp-2 text-[2.5cqw]',
                    }}
                  />
                </div>
              )}
            </main>
            <footer className="mt-[1cqw] flex shrink-0 items-end justify-between gap-[2cqw]">
              {scanLine({
                row: 'pb-[0.4cqw]',
                icon: 'size-[2cqw]',
                text: 'text-[2cqw]',
              })}
              <QrBadge url={qrCodeUrl} alt={QR_ALT} size={8.5} />
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
          className="flex h-full flex-col items-center p-[4cqw] text-center"
        >
          <header className="mb-[3cqw] shrink-0">
            {header({
              row: 'mb-[1cqw] justify-center',
              icon: 'size-[6cqw]',
              text: 'text-[4.5cqw]',
            })}
            {event('line-clamp-2 px-[1cqw] text-[5.5cqw]')}
          </header>
          <Photo
            speaker={speaker}
            className="mb-[3cqw] size-[26cqw] rounded-[2.5cqw]"
          />
          {/* The name and the talk keep their lines; the job title is the
              one thing that gives way — entirely, once the event name and
              the name both wrap — so the QR never leaves the frame. */}
          <main className="flex min-h-0 w-full flex-1 flex-col justify-center px-[1cqw]">
            {speakerName('line-clamp-2 shrink-0 text-[5.5cqw]')}
            {jobTitle('mt-[1cqw] line-clamp-1 text-[4cqw]')}
            {talk && (
              <div className="mx-[1cqw] mt-[2.5cqw] shrink-0">
                <Talk
                  talk={talk}
                  size={{
                    box: 'p-[2.5cqw]',
                    icon: 'size-[4cqw]',
                    label: 'text-[3.5cqw]',
                    title: 'line-clamp-2 text-[4.5cqw]',
                  }}
                />
              </div>
            )}
          </main>
          <footer className="mt-[3cqw] flex shrink-0 flex-col items-center">
            <QrBadge url={qrCodeUrl} alt={QR_ALT} size={16} />
            {scanLine({
              row: 'mt-[1.5cqw] justify-center',
              icon: 'size-[4cqw]',
              text: 'text-[3.5cqw]',
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
        className="flex h-full flex-col p-[3cqw] text-center"
      >
        <header className="mb-[3cqw] shrink-0">
          {header({
            row: 'mb-[1cqw] justify-center',
            icon: 'size-[6cqw]',
            text: 'text-[4.5cqw]',
          })}
          {event('line-clamp-2 px-[1cqw] text-[6cqw]')}
        </header>
        <section className="mb-[2cqw] flex shrink-0 items-center justify-center gap-[7cqw]">
          <Photo speaker={speaker} className="size-[25cqw] rounded-[2cqw]" />
          <QrBadge url={qrCodeUrl} alt={QR_ALT} size={25} />
        </section>
        {/* As in portrait: the job title gives way, nothing else. */}
        <main className="flex min-h-0 flex-1 flex-col justify-center px-[1cqw]">
          {speakerName('line-clamp-2 shrink-0 text-[5.5cqw]')}
          {jobTitle('mt-[1cqw] line-clamp-1 text-[4cqw]')}
          {talk && (
            <div className="mx-[1cqw] mt-[2cqw] shrink-0">
              <Talk
                talk={talk}
                size={{
                  box: 'p-[2cqw]',
                  icon: 'size-[4cqw]',
                  label: 'text-[3.5cqw]',
                  title: 'line-clamp-2 text-[3.8cqw]',
                }}
              />
            </div>
          )}
        </main>
        <footer className="mt-[1cqw] shrink-0">
          {scanLine({
            row: 'justify-center',
            icon: 'size-[4cqw]',
            text: 'text-[3.5cqw]',
          })}
        </footer>
      </div>
    </CardFrame>
  )
}
