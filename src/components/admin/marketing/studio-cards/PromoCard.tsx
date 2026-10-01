'use client'

import {
  CalendarDaysIcon,
  MapPinIcon,
  MicrophoneIcon,
  QrCodeIcon,
  TrophyIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import type { StudioFormat } from '@/lib/marketing-asset'
import {
  CardFrame,
  QrBadge,
  useCardFormat,
  type IconLineSizes,
} from './CardFrame'

const QR_ALT = 'QR Code - Scan to view conference program'

/**
 * The elements the conference promo keeps in every Format (docs/MARKETING_
 * STUDIO_FORMATS_SPEC.md §3), as `data-card-element` values: only their place
 * and size change between Formats. `date` is present when the conference has
 * one (a share asset never invents a date) and `qr` when there is a code.
 */
export const PROMO_CARD_ELEMENTS = [
  'title',
  'date',
  'place',
  'counts',
  'qr',
  'description',
] as const

export interface PromoCardCounts {
  speakers: number
  talks: number
  workshops: number
}

export interface PromoCardProps {
  /** The conference's title. */
  title: string
  /** Already formatted for display; absent leaves the date line out. */
  date?: string
  /** "City, Country", or the studio's own placeholder. */
  place: string
  counts: PromoCardCounts
  /** One paragraph; clamped per Format, never dropped. */
  description: string
  /** A data URL; empty leaves the QR out (it would point nowhere). */
  qrCodeUrl: string
  /** Fixed; otherwise the studio tab's Format switch, otherwise square. */
  format?: StudioFormat
  className?: string
}

/**
 * The count icons' colours, read from the brand variables rather than the
 * `text-brand-*` classes: those have `.dark` overrides, which would make the
 * downloaded promo follow the organizer's admin theme.
 */
const COUNTS: {
  key: keyof PromoCardCounts
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}[] = [
  {
    key: 'speakers',
    label: 'Speakers',
    icon: UsersIcon,
    color: 'text-[color:var(--color-brand-sunbeam-yellow)]',
  },
  {
    key: 'talks',
    label: 'Talks',
    icon: MicrophoneIcon,
    color: 'text-[color:var(--color-brand-fresh-green)]',
  },
  {
    key: 'workshops',
    label: 'Workshops',
    icon: TrophyIcon,
    color: 'text-[color:var(--color-brand-sunbeam-yellow)]',
  },
]

/**
 * The conference promo in a Format (spec §3), in the brand gradient it always
 * had. Square stacks title, date and place, the counts, the description and
 * the QR beside its scan line; landscape keeps the title across the top and
 * puts the QR in the lower right of the description and counts; portrait is
 * the square's stack with the date and place on their own lines and the QR
 * centred below. The QR code is a prop, generated on the server.
 */
export function PromoCard({
  title,
  date,
  place,
  counts,
  description,
  qrCodeUrl,
  format: fixedFormat,
  className = '',
}: PromoCardProps) {
  const format = useCardFormat(fixedFormat)

  const heading = (size: string) => (
    <h1
      data-card-element="title"
      className={`font-space-grotesk leading-tight font-bold ${size}`}
    >
      {title}
    </h1>
  )
  const iconLine = (
    element: 'date' | 'place',
    Icon: React.ComponentType<{ className?: string }>,
    text: string,
    size: IconLineSizes,
  ) => (
    <p
      data-card-element={element}
      className={`font-inter flex min-w-0 items-center gap-[1cqw] leading-snug text-white/90 ${size.row}`}
    >
      <Icon className={`shrink-0 ${size.icon}`} />
      {/* Left-aligned beside its icon, even in a centred layout, so a line
          that fills the card keeps the icon next to its words. */}
      <span className={`text-left ${size.text}`}>{text}</span>
    </p>
  )
  const dateAndPlace = (size: IconLineSizes) => (
    <>
      {date && iconLine('date', CalendarDaysIcon, date, size)}
      {iconLine('place', MapPinIcon, place, size)}
    </>
  )
  const countTiles = (size: {
    grid: string
    tile: string
    icon: string
    number: string
    label: string
  }) => (
    <div
      data-card-element="counts"
      className={`grid shrink-0 grid-cols-3 ${size.grid}`}
    >
      {COUNTS.map(({ key, label, icon: Icon, color }) => (
        <div
          key={key}
          data-count={key}
          className={`rounded-[1.5cqw] bg-white/10 text-center ${size.tile}`}
        >
          <div className="flex items-center justify-center gap-[1cqw]">
            <Icon className={`shrink-0 ${color} ${size.icon}`} />
            <span
              className={`font-space-grotesk leading-tight font-bold ${size.number}`}
            >
              {counts[key]}
            </span>
          </div>
          <p className={`font-inter leading-tight text-white/80 ${size.label}`}>
            {label}
          </p>
        </div>
      ))}
    </div>
  )
  const descriptionLine = (size: string) => (
    <p
      data-card-element="description"
      className={`font-inter shrink-0 leading-snug text-white/95 ${size}`}
    >
      {description}
    </p>
  )
  const scanLine = (size: IconLineSizes) => (
    <div className={`flex items-center gap-[1cqw] ${size.row}`}>
      <QrCodeIcon className={`shrink-0 ${size.icon}`} />
      <p className={`font-inter leading-tight text-white/90 ${size.text}`}>
        Scan for Program
      </p>
    </div>
  )

  const frame = {
    kind: 'promo' as const,
    format,
    tone: 'brand' as const,
    pattern: true,
    seed: title.length,
    className,
  }

  if (format === 'landscape') {
    return (
      <CardFrame {...frame}>
        <div
          data-layout="landscape"
          className="flex h-full flex-col p-[3.5cqw] text-left"
        >
          <header className="shrink-0">
            {heading('line-clamp-2 text-[4.4cqw]')}
            <div className="mt-[1.2cqw] flex flex-wrap gap-x-[3cqw] gap-y-[0.5cqw]">
              {dateAndPlace({
                row: '',
                icon: 'size-[2.2cqw]',
                text: 'line-clamp-1 text-[2.1cqw]',
              })}
            </div>
          </header>
          <div className="mt-[2cqw] flex min-h-0 flex-1 items-end gap-[4cqw]">
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-[2cqw] self-stretch">
              {descriptionLine('line-clamp-3 text-[2.1cqw]')}
              {countTiles({
                grid: 'gap-[2cqw]',
                tile: 'p-[1.4cqw]',
                icon: 'size-[2.6cqw]',
                number: 'text-[3.6cqw]',
                label: 'mt-[0.5cqw] text-[1.8cqw]',
              })}
            </div>
            <footer className="flex shrink-0 flex-col items-center">
              <QrBadge url={qrCodeUrl} alt={QR_ALT} size={15} />
              {scanLine({
                row: 'mt-[1.2cqw]',
                icon: 'size-[1.9cqw]',
                text: 'text-[1.8cqw]',
              })}
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
          <header className="flex w-full shrink-0 flex-col items-center">
            {heading('line-clamp-2 text-[7.5cqw]')}
            <div className="mt-[3cqw] flex max-w-full flex-col items-center gap-[1.5cqw]">
              {dateAndPlace({
                row: '',
                icon: 'size-[4.2cqw]',
                text: 'line-clamp-1 text-[4cqw]',
              })}
            </div>
          </header>
          <main className="flex min-h-0 w-full flex-1 flex-col justify-center gap-[5cqw] py-[3cqw]">
            {countTiles({
              grid: 'gap-[3cqw]',
              tile: 'p-[3cqw]',
              icon: 'size-[6cqw]',
              number: 'text-[8cqw]',
              label: 'mt-[1cqw] text-[3.6cqw]',
            })}
            {descriptionLine('line-clamp-4 px-[2cqw] text-[3.8cqw]')}
          </main>
          <footer className="flex shrink-0 flex-col items-center">
            <QrBadge url={qrCodeUrl} alt={QR_ALT} size={18} />
            {scanLine({
              row: 'mt-[2cqw]',
              icon: 'size-[3.6cqw]',
              text: 'text-[3.4cqw]',
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
        className="flex h-full flex-col p-[5cqw] text-center"
      >
        <header className="flex shrink-0 flex-col items-center">
          {heading('line-clamp-2 text-[6.5cqw]')}
          <div className="mt-[2.5cqw] flex max-w-full flex-wrap items-center justify-center gap-x-[4cqw] gap-y-[1cqw]">
            {dateAndPlace({
              row: '',
              icon: 'size-[3.6cqw]',
              text: 'line-clamp-1 text-[3.4cqw]',
            })}
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col justify-center gap-[4cqw] py-[3cqw]">
          {countTiles({
            grid: 'gap-[3cqw]',
            tile: 'p-[2cqw]',
            icon: 'size-[5cqw]',
            number: 'text-[6.5cqw]',
            label: 'mt-[1cqw] text-[3cqw]',
          })}
          {descriptionLine('line-clamp-3 px-[2cqw] text-[3.2cqw]')}
        </main>
        <footer className="flex shrink-0 items-center justify-center gap-[3cqw]">
          <QrBadge url={qrCodeUrl} alt={QR_ALT} size={15} />
          {scanLine({
            row: '',
            icon: 'size-[3.4cqw]',
            text: 'text-[3.2cqw]',
          })}
        </footer>
      </div>
    </CardFrame>
  )
}
