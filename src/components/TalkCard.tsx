import { CloudNativePattern } from '@/components/CloudNativePattern'
import {
  ClockIcon,
  UserIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'
import {
  BoltIcon,
  PresentationChartBarIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
} from '@heroicons/react/24/solid'
import { Format } from '@/lib/proposal/types'

interface TalkCardProps {
  title: string
  speaker: string
  format: Format
  duration?: string
  level?: 'beginner' | 'intermediate' | 'advanced'
  topic?: string
  description?: string
  variant?: 'default' | 'featured' | 'compact'
  className?: string
}

const formatConfig = {
  [Format.lightning_10]: {
    label: 'Lightning Talk',
    duration: '10 min',
    icon: BoltIcon,
    color: 'text-accent-yellow',
    bgColor: 'bg-accent-yellow/10',
    borderColor: 'border-accent-yellow/20',
  },
  [Format.presentation_20]: {
    label: 'Presentation',
    duration: '20 min',
    icon: PresentationChartBarIcon,
    color: 'text-brand-cloud-blue',
    bgColor: 'bg-brand-cloud-blue/10',
    borderColor: 'border-brand-cloud-blue/20',
  },
  [Format.presentation_25]: {
    label: 'Presentation',
    duration: '25 min',
    icon: PresentationChartBarIcon,
    color: 'text-brand-cloud-blue',
    bgColor: 'bg-brand-cloud-blue/10',
    borderColor: 'border-brand-cloud-blue/20',
  },
  [Format.presentation_40]: {
    label: 'Deep Dive',
    duration: '40 min',
    icon: ChartBarIcon,
    color: 'text-brand-fresh-green',
    bgColor: 'bg-brand-fresh-green/10',
    borderColor: 'border-brand-fresh-green/20',
  },
  [Format.presentation_45]: {
    label: 'Deep Dive',
    duration: '45 min',
    icon: ChartBarIcon,
    color: 'text-brand-fresh-green',
    bgColor: 'bg-brand-fresh-green/10',
    borderColor: 'border-brand-fresh-green/20',
  },
  [Format.workshop_120]: {
    label: 'Workshop',
    duration: '2 hours',
    icon: WrenchScrewdriverIcon,
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
    borderColor: 'border-accent-purple/20',
  },
  [Format.workshop_240]: {
    label: 'Extended Workshop',
    duration: '4 hours',
    icon: WrenchScrewdriverIcon,
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
    borderColor: 'border-accent-purple/20',
  },
}

const levelConfig = {
  beginner: { label: 'Beginner', color: 'text-secondary-500' },
  intermediate: { label: 'Intermediate', color: 'text-accent-yellow' },
  advanced: { label: 'Advanced', color: 'text-primary-500' },
}

export function TalkCard({
  title,
  speaker,
  format,
  duration,
  level,
  topic,
  description,
  variant = 'default',
  className = '',
}: TalkCardProps) {
  const config = formatConfig[format]
  const Icon = config.icon
  const effectiveDuration = duration || config.duration

  const isCompact = variant === 'compact'
  const isFeatured = variant === 'featured'

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-white transition-all duration-300 hover:shadow-lg ${isFeatured ? 'border-2 border-brand-cloud-blue shadow-md' : 'border-gray-200 hover:border-gray-300'} ${isCompact ? 'p-4' : isFeatured ? 'p-8' : 'p-6'} ${className} `}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <CloudNativePattern
          iconCount={isCompact ? 8 : isFeatured ? 16 : 12}
          baseSize={isCompact ? 16 : 20}
          className="h-full w-full"
        />
      </div>

      {/* Content */}
      <div className="relative">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div
            className={`flex items-center space-x-2 rounded-full px-3 py-1 ${config.bgColor} ${config.borderColor} border`}
          >
            <Icon className={`h-4 w-4 ${config.color}`} />
            <span className={`font-inter text-sm font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>

          {isFeatured && (
            <div className="rounded-full bg-brand-cloud-blue/10 px-3 py-1">
              <span className="font-inter text-sm font-medium text-brand-cloud-blue">
                Featured
              </span>
            </div>
          )}
        </div>

        {/* Title */}
        <h3
          className={`font-space-grotesk font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue ${isCompact ? 'mb-2 text-lg' : isFeatured ? 'mb-4 text-2xl' : 'mb-3 text-xl'} `}
        >
          {title}
        </h3>

        {/* Speaker */}
        <div className="mb-3 flex items-center space-x-2">
          <UserIcon className="h-4 w-4 text-gray-400" />
          <span
            className={`font-inter font-medium text-gray-700 ${isCompact ? 'text-sm' : 'text-base'}`}
          >
            {speaker}
          </span>
        </div>

        {/* Meta Information */}
        <div
          className={`flex flex-wrap items-center gap-4 ${isCompact ? 'mb-2' : 'mb-4'}`}
        >
          {/* Duration */}
          <div className="flex items-center space-x-1">
            <ClockIcon className="h-4 w-4 text-gray-400" />
            <span className="font-inter text-sm text-gray-600">
              {effectiveDuration}
            </span>
          </div>

          {/* Level */}
          {level && (
            <div className="flex items-center space-x-1">
              <AcademicCapIcon className="h-4 w-4 text-gray-400" />
              <span
                className={`font-inter text-sm ${levelConfig[level].color}`}
              >
                {levelConfig[level].label}
              </span>
            </div>
          )}

          {/* Topic */}
          {topic && (
            <div className="rounded-full bg-gray-100 px-2 py-1">
              <span className="font-inter text-xs text-gray-600">{topic}</span>
            </div>
          )}
        </div>

        {/* Description */}
        {description && !isCompact && (
          <p
            className={`font-inter text-gray-600 ${isFeatured ? 'text-base' : 'text-sm'}`}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
