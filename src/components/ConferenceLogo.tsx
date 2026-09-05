'use client'

import { InlineSvg } from './InlineSvg'
import { BrandMonogram, BrandWordmark } from './BrandWordmark'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import type { ConferenceLogoData } from '@/lib/conference/logo'

interface ConferenceLogoProps {
  // Every field — `title` included — is optional; a missing title degrades to
  // the platform mark. PUBLIC server components must construct this with
  // `pickConferenceLogoProps` rather than passing a whole `Conference`:
  // structural typing accepts the full object, and client-component props
  // serialize verbatim into the publicly readable RSC flight payload.
  conference?: ConferenceLogoData | null
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
