import { CloudNativePattern } from '@/components/CloudNativePattern'
import {
  CalendarIcon,
  MapPinIcon,
  TicketIcon,
  ArrowRightIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import {
  BoltIcon,
  PresentationChartBarIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
} from '@heroicons/react/24/solid'
import { Format } from '@/lib/proposal/types'

interface TalkPromotionProps {
  title: string
  speaker: string
  format: Format
  date?: string
  time?: string
  location?: string
  ctaText?: string
  ctaUrl?: string
  description?: string
  variant?: 'banner' | 'card' | 'social'
  className?: string
}

const formatConfig = {
  [Format.lightning_10]: {
    label: 'Lightning Talk',
    duration: '10 min',
    icon: BoltIcon,
    gradient: 'from-accent-yellow/20 to-accent-yellow/5',
    accentColor: 'text-accent-yellow',
  },
  [Format.presentation_20]: {
    label: 'Presentation',
    duration: '20 min',
    icon: PresentationChartBarIcon,
    gradient: 'from-brand-cloud-blue/20 to-brand-cloud-blue/5',
    accentColor: 'text-brand-cloud-blue',
  },
  [Format.presentation_25]: {
    label: 'Presentation',
    duration: '25 min',
    icon: PresentationChartBarIcon,
    gradient: 'from-brand-cloud-blue/20 to-brand-cloud-blue/5',
    accentColor: 'text-brand-cloud-blue',
  },
  [Format.presentation_40]: {
    label: 'Deep Dive',
    duration: '40 min',
    icon: ChartBarIcon,
    gradient: 'from-brand-fresh-green/20 to-brand-fresh-green/5',
    accentColor: 'text-brand-fresh-green',
  },
  [Format.presentation_45]: {
    label: 'Deep Dive',
    duration: '45 min',
    icon: ChartBarIcon,
    gradient: 'from-brand-fresh-green/20 to-brand-fresh-green/5',
    accentColor: 'text-brand-fresh-green',
  },
  [Format.workshop_120]: {
    label: 'Workshop',
    duration: '2 hours',
    icon: WrenchScrewdriverIcon,
    gradient: 'from-accent-purple/20 to-accent-purple/5',
    accentColor: 'text-accent-purple',
  },
  [Format.workshop_240]: {
    label: 'Extended Workshop',
    duration: '4 hours',
    icon: WrenchScrewdriverIcon,
    gradient: 'from-accent-purple/20 to-accent-purple/5',
    accentColor: 'text-accent-purple',
  },
}

export function TalkPromotion({
  title,
  speaker,
  format,
  date,
  time,
  location,
  ctaText = 'Learn More',
  ctaUrl = '#',
  description,
  variant = 'card',
  className = '',
}: TalkPromotionProps) {
  const config = formatConfig[format]
  const Icon = config.icon

  if (variant === 'banner') {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${config.gradient} border border-gray-200 p-8 md:p-12 ${className} `}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <CloudNativePattern
            iconCount={24}
            baseSize={24}
            className="h-full w-full"
          />
        </div>

        <div className="relative">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div className="mb-6 lg:mb-0 lg:flex-1">
              {/* Format Badge */}
              <div className="mb-4 flex items-center space-x-2">
                <Icon className={`h-6 w-6 ${config.accentColor}`} />
                <span
                  className={`font-inter text-lg font-semibold ${config.accentColor}`}
                >
                  {config.label}
                </span>
                <span className="font-inter text-sm text-gray-600">
                  ({config.duration})
                </span>
              </div>

              {/* Title */}
              <h2 className="font-space-grotesk mb-3 text-3xl font-bold text-brand-slate-gray md:text-4xl">
                {title}
              </h2>

              {/* Speaker */}
              <p className="font-inter mb-4 text-xl text-gray-700">
                by <span className="font-semibold">{speaker}</span>
              </p>

              {/* Description */}
              {description && (
                <p className="font-inter mb-6 text-gray-600 lg:max-w-2xl">
                  {description}
                </p>
              )}

              {/* Event Details */}
              <div className="flex flex-wrap items-center gap-6">
                {date && (
                  <div className="flex items-center space-x-2">
                    <CalendarIcon className="h-5 w-5 text-gray-400" />
                    <span className="font-inter text-gray-700">{date}</span>
                  </div>
                )}
                {time && (
                  <div className="flex items-center space-x-2">
                    <ClockIcon className="h-5 w-5 text-gray-400" />
                    <span className="font-inter text-gray-700">{time}</span>
                  </div>
                )}
                {location && (
                  <div className="flex items-center space-x-2">
                    <MapPinIcon className="h-5 w-5 text-gray-400" />
                    <span className="font-inter text-gray-700">{location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="lg:ml-8">
              <a
                href={ctaUrl}
                className="group font-inter inline-flex items-center space-x-2 rounded-xl bg-brand-cloud-blue px-8 py-4 font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-lg"
              >
                <TicketIcon className="h-5 w-5" />
                <span>{ctaText}</span>
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'social') {
    return (
      <div
        className={`relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br ${config.gradient} max-w-sm border border-gray-200 p-6 ${className} `}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-15">
          <CloudNativePattern
            iconCount={16}
            baseSize={20}
            className="h-full w-full"
          />
        </div>

        <div className="relative flex h-full flex-col">
          {/* Format Badge */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Icon className={`h-5 w-5 ${config.accentColor}`} />
              <span
                className={`font-inter text-sm font-semibold ${config.accentColor}`}
              >
                {config.label}
              </span>
            </div>
            <span className="font-inter text-xs text-gray-600">
              {config.duration}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1">
            <h3 className="font-space-grotesk mb-3 text-xl font-bold text-brand-slate-gray">
              {title}
            </h3>
            <p className="font-inter mb-4 text-gray-700">
              by <span className="font-semibold">{speaker}</span>
            </p>

            {description && (
              <p className="font-inter line-clamp-3 text-sm text-gray-600">
                {description}
              </p>
            )}
          </div>

          {/* Event Info */}
          <div className="mt-4 space-y-2">
            {date && (
              <div className="flex items-center space-x-2">
                <CalendarIcon className="h-4 w-4 text-gray-400" />
                <span className="font-inter text-sm text-gray-700">{date}</span>
              </div>
            )}
            {location && (
              <div className="flex items-center space-x-2">
                <MapPinIcon className="h-4 w-4 text-gray-400" />
                <span className="font-inter text-sm text-gray-700">
                  {location}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Default card variant
  return (
    <div
      className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${config.gradient} border border-gray-200 p-6 transition-all duration-300 hover:border-gray-300 hover:shadow-lg ${className} `}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <CloudNativePattern
          iconCount={12}
          baseSize={18}
          className="h-full w-full"
        />
      </div>

      <div className="relative">
        {/* Format Badge */}
        <div className="mb-4 flex items-center space-x-2">
          <Icon className={`h-5 w-5 ${config.accentColor}`} />
          <span
            className={`font-inter text-sm font-semibold ${config.accentColor}`}
          >
            {config.label}
          </span>
          <span className="font-inter text-xs text-gray-600">
            ({config.duration})
          </span>
        </div>

        {/* Title */}
        <h3 className="font-space-grotesk mb-3 text-xl font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue">
          {title}
        </h3>

        {/* Speaker */}
        <p className="font-inter mb-4 text-gray-700">
          by <span className="font-semibold">{speaker}</span>
        </p>

        {/* Description */}
        {description && (
          <p className="font-inter mb-6 text-sm text-gray-600">{description}</p>
        )}

        {/* Event Details */}
        {(date || time || location) && (
          <div className="mb-6 space-y-2">
            {date && (
              <div className="flex items-center space-x-2">
                <CalendarIcon className="h-4 w-4 text-gray-400" />
                <span className="font-inter text-sm text-gray-700">{date}</span>
              </div>
            )}
            {time && (
              <div className="flex items-center space-x-2">
                <ClockIcon className="h-4 w-4 text-gray-400" />
                <span className="font-inter text-sm text-gray-700">{time}</span>
              </div>
            )}
            {location && (
              <div className="flex items-center space-x-2">
                <MapPinIcon className="h-4 w-4 text-gray-400" />
                <span className="font-inter text-sm text-gray-700">
                  {location}
                </span>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <a
          href={ctaUrl}
          className="group/cta font-inter inline-flex items-center space-x-2 text-sm font-semibold text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80"
        >
          <span>{ctaText}</span>
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover/cta:translate-x-1" />
        </a>
      </div>
    </div>
  )
}
