'use client'

import { CloudNativePattern } from '@/components/CloudNativePattern'

interface PatternExampleProps {
  title: string
  description: string
  opacity: number
  variant: 'dark' | 'light' | 'brand'
  density: 'low' | 'medium' | 'high'
  minSize: number
  maxSize: number
  minCount: number
  maxCount: number
  animated?: boolean
  className?: string
}

export function PatternExample({
  title,
  description,
  opacity,
  variant,
  density,
  minSize,
  maxSize,
  minCount,
  maxCount,
  animated = true,
  className = 'h-64',
}: PatternExampleProps) {
  const isLight = variant === 'light'
  const backgroundClass = isLight
    ? 'border-2 border-brand-frosted-steel bg-white'
    : variant === 'dark'
      ? 'bg-gradient-to-br from-slate-900 to-blue-900'
      : 'bg-brand-gradient'

  return (
    <div>
      <h5 className="font-space-grotesk text-md mb-3 font-semibold text-brand-slate-gray">
        {title}
      </h5>
      <div
        className={`relative overflow-hidden rounded-xl ${backgroundClass} ${className}`}
      >
        <CloudNativePattern
          className="z-0"
          opacity={opacity}
          animated={animated}
          variant={variant}
          density={density}
          minSize={minSize}
          maxSize={maxSize}
          minCount={minCount}
          maxCount={maxCount}
        />
        {!isLight && <div className="absolute inset-0 z-10 bg-black/30"></div>}
        <div className="relative z-20 flex h-full items-center justify-center">
          <div className="px-4 text-center">
            <h6
              className={`font-space-grotesk mb-2 text-lg font-semibold ${isLight ? 'text-brand-slate-gray' : 'text-white'}`}
            >
              {title}
            </h6>
            <p
              className={`font-inter text-sm ${isLight ? 'text-brand-slate-gray' : 'text-white/90'}`}
            >
              {description}
            </p>
            <div
              className={`mt-3 rounded px-2 py-1 font-mono text-xs ${isLight ? 'bg-white/80 text-brand-slate-gray' : 'bg-black/30 text-white/80'}`}
            >
              {minSize}-{maxSize}px • {minCount}-{maxCount} icons • {variant}{' '}
              variant
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
