import clsx from 'clsx'
import { SponsorLogo } from '@/components/SponsorLogo'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

/**
 * A sponsored track's banner on its room's stream screen: the sponsor alone,
 * still, as "Track sponsored by", their logo and their name.
 */
export function TrackSponsorBanner({
  sponsor: { sponsor },
  className,
}: {
  sponsor: ConferenceSponsor
  className?: string
}) {
  return (
    <section
      aria-label="Track sponsored by"
      className={clsx(
        'rounded-lg border-2 border-brand-cloud-blue/20 bg-white/95 px-6 py-8 text-center shadow-xl backdrop-blur-sm sm:px-8 sm:py-10 dark:bg-gray-900/95',
        className,
      )}
    >
      <p className="text-base font-semibold tracking-widest text-gray-600 uppercase sm:text-lg dark:text-gray-400">
        Track sponsored by
      </p>
      <a
        href={sponsor.website}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex max-w-full flex-wrap items-center justify-center gap-x-10 gap-y-4 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-gray-900"
        aria-label={`Visit ${sponsor.name} website`}
      >
        <SponsorLogo
          logo={sponsor.logo}
          logoBright={sponsor.logoBright}
          name={sponsor.name}
          className="h-16 w-auto max-w-full object-contain sm:h-24 sm:max-w-[480px] lg:h-32"
        />
        <span className="text-2xl font-semibold [overflow-wrap:anywhere] text-brand-slate-gray sm:text-4xl dark:text-gray-100">
          {sponsor.name}
        </span>
      </a>
    </section>
  )
}
