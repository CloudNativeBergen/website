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
        'rounded-lg border-2 border-brand-cloud-blue/20 bg-white/95 px-8 py-10 text-center shadow-xl backdrop-blur-sm dark:bg-gray-900/95',
        className,
      )}
    >
      <p className="text-lg font-semibold tracking-widest text-gray-600 uppercase dark:text-gray-400">
        Track sponsored by
      </p>
      <a
        href={sponsor.website}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex flex-wrap items-center justify-center gap-x-10 gap-y-4 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-gray-900"
        aria-label={`Visit ${sponsor.name} website`}
      >
        <SponsorLogo
          logo={sponsor.logo}
          logoBright={sponsor.logoBright}
          name={sponsor.name}
          className="h-24 w-auto max-w-[480px] object-contain lg:h-32"
        />
        <span className="text-4xl font-semibold text-brand-slate-gray dark:text-gray-100">
          {sponsor.name}
        </span>
      </a>
    </section>
  )
}
