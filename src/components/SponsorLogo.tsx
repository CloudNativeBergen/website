import { InlineSvg } from './InlineSvg'

interface SponsorLogoProps {
  logo: string | null | undefined
  logoBright?: string | null | undefined
  name: string
  className?: string
  style?: React.CSSProperties
}

export function SponsorLogo({
  logo,
  logoBright,
  name,
  className,
  style,
}: SponsorLogoProps) {
  if (!logo) {
    return null
  }

  const hasResponsiveBehavior = Boolean(logoBright)

  return (
    <div className="relative">
      <div
        className={hasResponsiveBehavior ? 'block dark:hidden' : 'block'}
        aria-label={name}
      >
        <InlineSvg value={logo} className={className} style={style} />
      </div>

      {logoBright && (
        <div className="hidden dark:block" aria-label={name}>
          <InlineSvg value={logoBright} className={className} style={style} />
        </div>
      )}
    </div>
  )
}
