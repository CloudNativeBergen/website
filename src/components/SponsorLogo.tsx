import { InlineSvg } from './InlineSvg'

interface SponsorLogoProps {
  logo: string | null | undefined
  logoBright?: string | null | undefined
  name: string
  className?: string
  style?: React.CSSProperties
  placeholderClassName?: string
}

export function SponsorLogo({
  logo,
  logoBright,
  name,
  className,
  style,
}: SponsorLogoProps) {
  if (!logo && !logoBright) {
    return null
  }

  const effectiveLogo = logo || logoBright
  const effectiveLogoBright = logoBright || logo

  const hasResponsiveBehavior = logo && logoBright

  return (
    <div className="relative">
      <div
        className={hasResponsiveBehavior ? 'block dark:hidden' : 'block'}
        aria-label={name}
      >
        <InlineSvg value={effectiveLogo!} className={className} style={style} />
      </div>

      {hasResponsiveBehavior && (
        <div className="hidden dark:block" aria-label={name}>
          <InlineSvg
            value={effectiveLogoBright!}
            className={className}
            style={style}
          />
        </div>
      )}
    </div>
  )
}
