import { InlineSvg } from './InlineSvg'

interface SponsorLogoProps {
  logo: string | null | undefined
  logoBright?: string | null | undefined
  /** Data URLs from the API (#1772), rendered with <img>, never inlined. */
  logoUrl?: string | null | undefined
  logoBrightUrl?: string | null | undefined
  name: string
  className?: string
  style?: React.CSSProperties
  placeholderClassName?: string
}

export function SponsorLogo({
  logo,
  logoBright,
  logoUrl,
  logoBrightUrl,
  name,
  className,
  style,
}: SponsorLogoProps) {
  const fromUrl = !logo && !logoBright
  const light = fromUrl ? logoUrl : logo
  const bright = fromUrl ? logoBrightUrl : logoBright
  if (!light && !bright) {
    return null
  }

  const effectiveLogo = (light || bright)!
  const effectiveLogoBright = (bright || light)!

  const hasResponsiveBehavior = light && bright

  const render = (value: string) =>
    fromUrl ? (
      <img src={value} alt="" className={className} style={style} />
    ) : (
      <InlineSvg value={value} className={className} style={style} />
    )

  return (
    <div className="relative">
      <div
        className={hasResponsiveBehavior ? 'block dark:hidden' : 'block'}
        aria-label={name}
      >
        {render(effectiveLogo)}
      </div>

      {hasResponsiveBehavior && (
        <div className="hidden dark:block" aria-label={name}>
          {render(effectiveLogoBright)}
        </div>
      )}
    </div>
  )
}
