'use client'

import { InlineSvg } from './InlineSvg'
import { BrandMonogram, BrandWordmark } from './BrandWordmark'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import { Conference } from '@/lib/conference/types'

interface ConferenceLogoProps {
  // Partial: callers pass either a full `Conference` or the narrower
  // `ConferenceLogos` bag, where every field — `title` included — is optional.
  // A missing title is a supported state; it degrades to the platform mark.
  conference?: Partial<
    Pick<
      Conference,
      'title' | 'logoBright' | 'logoDark' | 'logomarkBright' | 'logomarkDark'
    >
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

  // No uploaded logo: generate a mark from the tenant's OWN name. Degrading to
  // the platform name (rather than to some conference's wordmark) is the whole
  // point — a tenant must never be shown another tenant's brand, and a genuinely
  // platform-owned surface with no conference resolved should read as Konf.
  const name = conference?.title?.trim() || PLATFORM_NAME

  if (isHorizontal) {
    return (
      <BrandWordmark
        name={name}
        className={className}
        style={style}
        variant={fallbackVariant}
      />
    )
  }

  return (
    <BrandMonogram
      name={name}
      className={className}
      style={style}
      variant={fallbackVariant}
    />
  )
}
