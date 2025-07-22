import { Level } from './types'

export interface LevelConfig {
  color: string
  label: string
  symbol: string
  bgColor: string
}

/**
 * Consistent level configuration across the entire application
 */
export const LEVEL_CONFIG: Record<Level, LevelConfig> = {
  beginner: {
    color: '#10b981', // green-500
    bgColor: '#10b98110', // green-500 with 10% opacity
    label: 'Beginner',
    symbol: '●',
  },
  intermediate: {
    color: '#f59e0b', // amber-500
    bgColor: '#f59e0b10', // amber-500 with 10% opacity
    label: 'Intermediate',
    symbol: '●',
  },
  advanced: {
    color: '#ef4444', // red-500
    bgColor: '#ef444410', // red-500 with 10% opacity
    label: 'Advanced',
    symbol: '●',
  },
}

/**
 * Get level configuration for a proposal level
 */
export function getLevelConfig(level?: Level): LevelConfig | null {
  if (!level || !(level in LEVEL_CONFIG)) return null
  return LEVEL_CONFIG[level]
}

/**
 * Reusable Level Indicator Component
 */
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

/**
 * Hook to get level configuration
 */
export function useLevelConfig(level?: Level) {
  return getLevelConfig(level)
}
