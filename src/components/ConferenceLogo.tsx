'use client'

import { InlineSvg } from './InlineSvg'
import { Logo, Logomark } from './Logo'
import { Conference } from '@/lib/conference/types'

interface ConferenceLogoProps {
  conference?: Pick<
    Conference,
    'logoBright' | 'logoDark' | 'logomarkBright' | 'logomarkDark'
  > | null
  variant?: 'horizontal' | 'mark'
  /**
   * Color variant for the fallback logo when no custom logo is set.
   * Has no effect when a custom logo is configured.
   */
  fallbackVariant?: 'gradient' | 'monochrome'
  className?: string
  style?: React.CSSProperties
}

export function ConferenceLogo({
  conference,
  variant = 'horizontal',
  fallbackVariant = 'gradient',
  className,
  style,
}: ConferenceLogoProps) {
  const isHorizontal = variant === 'horizontal'

  const brightLogo = isHorizontal
    ? conference?.logoBright
    : conference?.logomarkBright
  const darkLogo = isHorizontal
    ? conference?.logoDark
    : conference?.logomarkDark

  // Use custom logo if available
  if (brightLogo) {
    // If dark logo is not set, use bright logo for both modes
    const effectiveDarkLogo = darkLogo || brightLogo
    const hasResponsiveBehavior = Boolean(darkLogo)

    return (
      <div className="relative">
        <div
          className={hasResponsiveBehavior ? 'block dark:hidden' : 'block'}
          aria-label="Conference logo"
        >
          <InlineSvg value={brightLogo} className={className} style={style} />
        </div>

        {hasResponsiveBehavior && (
          <div className="hidden dark:block" aria-label="Conference logo">
            <InlineSvg
              value={effectiveDarkLogo}
              className={className}
              style={style}
            />
          </div>
        )}
      </div>
    )
  }

  // Fallback to default Logo/Logomark
  if (isHorizontal) {
    return (
      <Logo className={className} style={style} variant={fallbackVariant} />
    )
  }

  return (
    <Logomark className={className} style={style} variant={fallbackVariant} />
  )
}
