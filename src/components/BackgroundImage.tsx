'use client'

import clsx from 'clsx'
import { CloudNativePattern } from './CloudNativePattern'
import { useBackgroundPattern } from './BackgroundPatternProvider'
import type { BackgroundPattern } from '@/lib/conference/backgroundPattern'

/**
 * Per-pattern density/opacity for the CNCF logo layer. `'cloud-native'` is the
 * historical look; `'subtle'` keeps the same logo-based pattern but far sparser
 * and fainter (the component is inherently logo-based, so "subtle" is low
 * density + low opacity rather than a different, logo-free texture); `'none'`
 * omits the logo layer entirely, leaving just the gradient wash.
 */
const PATTERN_SETTINGS: Record<
  Exclude<BackgroundPattern, 'none'>,
  { opacity: number; iconCount: number }
> = {
  'cloud-native': { opacity: 0.1, iconCount: 50 },
  subtle: { opacity: 0.04, iconCount: 14 },
}

export function BackgroundImage({
  className,
  pattern: patternProp,
}: {
  className?: string
  /** Override the context-provided pattern (stories / isolated previews). */
  pattern?: BackgroundPattern
}) {
  const contextPattern = useBackgroundPattern()
  const pattern = patternProp ?? contextPattern

  const settings = pattern === 'none' ? null : PATTERN_SETTINGS[pattern]

  return (
    <div className={clsx('absolute inset-0 overflow-hidden', className)}>
      <div className="absolute inset-0 bg-brand-gradient opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-gray-950" />

      {settings && (
        <div className="absolute inset-0">
          <div className="block dark:hidden">
            <CloudNativePattern
              variant="light"
              opacity={settings.opacity}
              animated={true}
              baseSize={100}
              iconCount={settings.iconCount}
              className="h-full w-full"
              seed={new Date().setHours(0, 0, 0, 0)}
            />
          </div>

          <div className="hidden dark:block">
            <CloudNativePattern
              variant="dark"
              opacity={settings.opacity}
              animated={true}
              baseSize={100}
              iconCount={settings.iconCount}
              className="h-full w-full"
              seed={new Date().setHours(0, 0, 0, 0)}
            />
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white dark:from-gray-950" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white dark:from-gray-950" />
    </div>
  )
}
