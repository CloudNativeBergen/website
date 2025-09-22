import {
  BoltIcon,
  PresentationChartBarIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
} from '@heroicons/react/24/solid'
import { Format } from '../types'

export interface FormatConfig {
  label: string

  duration: string

  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>

  color: string

  bgColor: string

  borderColor: string

  gradient: string

  accentColor: string
}

export const formatConfig: Record<Format, FormatConfig> = {
  [Format.lightning_10]: {
    label: 'Lightning',
    duration: '10 min',
    icon: BoltIcon,
    color: 'text-accent-yellow',
    bgColor: 'bg-accent-yellow/10',
    borderColor: 'border-accent-yellow/20',
    gradient: 'from-accent-yellow/20 to-accent-yellow/5',
    accentColor: 'text-accent-yellow',
  },
  [Format.presentation_20]: {
    label: 'Presentation',
    duration: '20 min',
    icon: PresentationChartBarIcon,
    color: 'text-brand-cloud-blue',
    bgColor: 'bg-brand-cloud-blue/10',
    borderColor: 'border-brand-cloud-blue/20',
    gradient: 'from-brand-cloud-blue/20 to-brand-cloud-blue/5',
    accentColor: 'text-brand-cloud-blue',
  },
  [Format.presentation_25]: {
    label: 'Presentation',
    duration: '25 min',
    icon: PresentationChartBarIcon,
    color: 'text-brand-cloud-blue',
    bgColor: 'bg-brand-cloud-blue/10',
    borderColor: 'border-brand-cloud-blue/20',
    gradient: 'from-brand-cloud-blue/20 to-brand-cloud-blue/5',
    accentColor: 'text-brand-cloud-blue',
  },
  [Format.presentation_40]: {
    label: 'Deep Dive',
    duration: '40 min',
    icon: ChartBarIcon,
    color: 'text-brand-fresh-green',
    bgColor: 'bg-brand-fresh-green/10',
    borderColor: 'border-brand-fresh-green/20',
    gradient: 'from-brand-fresh-green/20 to-brand-fresh-green/5',
    accentColor: 'text-brand-fresh-green',
  },
  [Format.presentation_45]: {
    label: 'Deep Dive',
    duration: '45 min',
    icon: ChartBarIcon,
    color: 'text-brand-fresh-green',
    bgColor: 'bg-brand-fresh-green/10',
    borderColor: 'border-brand-fresh-green/20',
    gradient: 'from-brand-fresh-green/20 to-brand-fresh-green/5',
    accentColor: 'text-brand-fresh-green',
  },
  [Format.workshop_120]: {
    label: 'Workshop',
    duration: '2 hours',
    icon: WrenchScrewdriverIcon,
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
    borderColor: 'border-accent-purple/20',
    gradient: 'from-accent-purple/20 to-accent-purple/5',
    accentColor: 'text-accent-purple',
  },
  [Format.workshop_240]: {
    label: 'Extended Workshop',
    duration: '4 hours',
    icon: WrenchScrewdriverIcon,
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
    borderColor: 'border-accent-purple/20',
    gradient: 'from-accent-purple/20 to-accent-purple/5',
    accentColor: 'text-accent-purple',
  },
}

export function getFormatConfig(format: Format): FormatConfig {
  return formatConfig[format]
}

export function getFormatDisplay(format: Format) {
  const config = formatConfig[format]
  return {
    label: config.label,
    duration: config.duration,
    icon: config.icon,
  }
}

export function getFormatStyling(format: Format) {
  const config = formatConfig[format]
  return {
    color: config.color,
    bgColor: config.bgColor,
    gradient: config.gradient,
    accentColor: config.accentColor,
  }
}
