import React from 'react'
import {
  Status,
  Format,
  Level,
  Audience,
  statuses,
  formats,
  audiences,
} from '../types'
import { getFormatConfig } from './config'

export interface BadgeConfig {
  text: string
  bgColor: string
  textColor: string
  ringColor?: string
  borderColor?: string
}

export function getStatusBadgeConfig(status: Status): BadgeConfig {
  switch (status) {
    case Status.draft:
      return {
        text: statuses.get(Status.draft) || 'Draft',
        bgColor: 'bg-yellow-100',
        textColor: 'text-yellow-800',
        ringColor: 'ring-yellow-600/20',
        borderColor: 'border-l-yellow-500',
      }
    case Status.submitted:
      return {
        text: statuses.get(Status.submitted) || 'Submitted',
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-800',
        ringColor: 'ring-blue-600/20',
        borderColor: 'border-l-blue-500',
      }
    case Status.accepted:
      return {
        text: statuses.get(Status.accepted) || 'Accepted',
        bgColor: 'bg-green-100',
        textColor: 'text-green-800',
        ringColor: 'ring-green-600/20',
        borderColor: 'border-l-green-500',
      }
    case Status.confirmed:
      return {
        text: statuses.get(Status.confirmed) || 'Confirmed',
        bgColor: 'bg-green-100',
        textColor: 'text-green-800',
        ringColor: 'ring-green-700/30',
        borderColor: 'border-l-green-600',
      }
    case Status.rejected:
      return {
        text: statuses.get(Status.rejected) || 'Rejected',
        bgColor: 'bg-red-100',
        textColor: 'text-red-800',
        ringColor: 'ring-red-600/20',
        borderColor: 'border-l-red-500',
      }
    case Status.withdrawn:
      return {
        text: statuses.get(Status.withdrawn) || 'Withdrawn',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-800',
        ringColor: 'ring-gray-600/20',
        borderColor: 'border-l-gray-500',
      }
    case Status.deleted:
      return {
        text: statuses.get(Status.deleted) || 'Deleted',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-800',
        ringColor: 'ring-gray-600/20',
        borderColor: 'border-l-gray-500',
      }
    default:
      return {
        text: 'Unknown',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-800',
        ringColor: 'ring-gray-600/20',
        borderColor: 'border-l-gray-500',
      }
  }
}

export function getAudienceBadgeConfig(audience: Audience): BadgeConfig {
  switch (audience) {
    case Audience.developer:
      return {
        text: audiences.get(Audience.developer) || 'Developer',
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-800',
      }
    case Audience.architect:
      return {
        text: audiences.get(Audience.architect) || 'Architect',
        bgColor: 'bg-indigo-100',
        textColor: 'text-indigo-800',
      }
    case Audience.operator:
      return {
        text: audiences.get(Audience.operator) || 'Operator',
        bgColor: 'bg-red-100',
        textColor: 'text-red-800',
      }
    case Audience.manager:
      return {
        text: audiences.get(Audience.manager) || 'Manager',
        bgColor: 'bg-green-100',
        textColor: 'text-green-800',
      }
    case Audience.dataEngineer:
      return {
        text: audiences.get(Audience.dataEngineer) || 'Data Engineer',
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-800',
      }
    case Audience.securityEngineer:
      return {
        text: audiences.get(Audience.securityEngineer) || 'Security Engineer',
        bgColor: 'bg-pink-100',
        textColor: 'text-pink-800',
      }
    case Audience.qaEngineer:
      return {
        text: audiences.get(Audience.qaEngineer) || 'QA Engineer',
        bgColor: 'bg-yellow-100',
        textColor: 'text-yellow-800',
      }
    case Audience.devopsEngineer:
      return {
        text: audiences.get(Audience.devopsEngineer) || 'DevOps Engineer',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-800',
      }
    default:
      return {
        text: 'Unknown',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-800',
      }
  }
}

export interface LevelConfig {
  color: string
  label: string
  symbol: string
  bgColor: string
  badgeBgColor: string
  badgeTextColor: string
}

export const LEVEL_CONFIG: Record<Level, LevelConfig> = {
  beginner: {
    color: '#10b981',
    bgColor: '#10b98110',
    badgeBgColor: 'bg-green-100',
    badgeTextColor: 'text-green-800',
    label: 'Beginner',
    symbol: '●',
  },
  intermediate: {
    color: '#f59e0b',
    bgColor: '#f59e0b10',
    badgeBgColor: 'bg-yellow-100',
    badgeTextColor: 'text-yellow-800',
    label: 'Intermediate',
    symbol: '●',
  },
  advanced: {
    color: '#ef4444',
    bgColor: '#ef444410',
    badgeBgColor: 'bg-red-100',
    badgeTextColor: 'text-red-800',
    label: 'Advanced',
    symbol: '●',
  },
}

export function getLevelConfig(level?: Level): LevelConfig | null {
  if (!level || !(level in LEVEL_CONFIG)) return null
  return LEVEL_CONFIG[level]
}

export function getLevelBadgeConfig(level: Level): BadgeConfig {
  const config = getLevelConfig(level)
  if (!config) {
    return {
      text: 'Unknown',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-800',
    }
  }

  return {
    text: config.label,
    bgColor: config.badgeBgColor,
    textColor: config.badgeTextColor,
  }
}

export function getFormatBadgeConfig(format: Format): BadgeConfig {
  const config = getFormatConfig(format)
  return {
    text: formats.get(format) || config.label,
    bgColor: config.bgColor,
    textColor: config.color,
  }
}

interface BaseBadgeProps {
  variant?: 'default' | 'compact'
  className?: string
}

const getBadgeClasses = (variant: 'default' | 'compact') => {
  const baseClasses = 'inline-flex items-center rounded-full font-medium'
  const sizeClasses =
    variant === 'compact' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'
  return `${baseClasses} ${sizeClasses}`
}

interface StatusBadgeProps extends BaseBadgeProps {
  status: Status
}

export function StatusBadge({
  status,
  variant = 'default',
  className = '',
}: StatusBadgeProps) {
  const config = getStatusBadgeConfig(status)
  const classes = getBadgeClasses(variant)

  return (
    <span
      className={`${classes} ${config.bgColor} ${config.textColor} ${className}`}
    >
      {config.text}
    </span>
  )
}

interface LevelBadgeProps extends BaseBadgeProps {
  level: Level
}

export function LevelBadge({
  level,
  variant = 'default',
  className = '',
}: LevelBadgeProps) {
  const config = getLevelBadgeConfig(level)
  const classes = getBadgeClasses(variant)

  return (
    <span
      className={`${classes} ${config.bgColor} ${config.textColor} ${className}`}
    >
      {config.text}
    </span>
  )
}

interface FormatBadgeProps extends BaseBadgeProps {
  format: Format
}

export function FormatBadge({
  format,
  variant = 'default',
  className = '',
}: FormatBadgeProps) {
  const config = getFormatBadgeConfig(format)
  const classes = getBadgeClasses(variant)

  return (
    <span
      className={`${classes} ${config.bgColor} ${config.textColor} ${className}`}
    >
      {config.text}
    </span>
  )
}

interface AudienceBadgeProps extends BaseBadgeProps {
  audience: Audience
}

export function AudienceBadge({
  audience,
  variant = 'default',
  className = '',
}: AudienceBadgeProps) {
  const config = getAudienceBadgeConfig(audience)
  const classes = getBadgeClasses(variant)

  return (
    <span
      className={`${classes} ${config.bgColor} ${config.textColor} ${className}`}
    >
      {config.text}
    </span>
  )
}

export interface LevelIndicatorProps {
  level?: Level
  className?: string
  showLabel?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

export function LevelIndicator({
  level,
  className = '',
  showLabel = false,
  size = 'xs',
}: LevelIndicatorProps) {
  const config = getLevelConfig(level)
  if (!config) return null

  return (
    <span
      className={`flex flex-shrink-0 items-center font-bold ${sizeClasses[size]} ${className}`}
      style={{ color: config.color }}
      title={config.label}
      aria-label={`Level: ${config.label}`}
    >
      {config.symbol}
      {showLabel && <span className="ml-1">{config.label}</span>}
    </span>
  )
}
