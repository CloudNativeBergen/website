import { InlineSvg } from './InlineSvg'
import { BuildingOffice2Icon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

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
  placeholderClassName,
}: SponsorLogoProps) {
  if (!logo) {
    return (
      <div
        className={clsx(
          'flex h-full w-full items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800',
          placeholderClassName,
        )}
        style={style}
        title={name}
      >
        <div className="flex flex-col items-center gap-1 overflow-hidden px-1 text-center">
          <BuildingOffice2Icon className="h-1/2 w-auto max-w-full text-gray-400 dark:text-gray-500" />
          <span className="truncate text-[8px] font-bold text-gray-400 uppercase dark:text-gray-500">
            {name}
          </span>
        </div>
      </div>
    )
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
