'use client'

import { ConferenceSponsor } from '@/lib/sponsor/types'
import { filterPublicSponsors } from '@/lib/sponsor/utils'
import { SponsorLogo } from '@/components/SponsorLogo'
import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'

interface SponsorBannerProps {
  sponsors: ConferenceSponsor[]
  className?: string
  speed?: number
  /**
   * `strip`: the low band along the bottom of the Photo Wall's Screen Mode
   * (spec §9.4), on a 1920×1080 canvas with no responsive steps.
   */
  variant?: 'default' | 'strip'
  /** A line above the loop, e.g. "Thank you to:" on a room's stream screen. */
  heading?: string
}

export function SponsorBanner({
  sponsors,
  className,
  speed = 30,
  variant = 'default',
  heading,
}: SponsorBannerProps) {
  const [scrollWidth, setScrollWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentRef.current) {
      // Calculate the actual width of the first set of sponsors
      // Since we duplicate 4 times, divide by 4 to get one set's width
      const firstSetWidth = contentRef.current.scrollWidth / 4
      setScrollWidth(firstSetWidth)
    }
  }, [sponsors])

  // Only sponsors with a resolved tier are shown publicly; this banner doesn't
  // group by tier, so apply the public-tier filter here (excludes unset and
  // dangling tier references alike).
  const visibleSponsors = filterPublicSponsors(sponsors ?? [])

  if (visibleSponsors.length === 0) {
    return null
  }

  // Duplicate sponsors multiple times to ensure smooth scrolling
  const duplicatedSponsors = [
    ...visibleSponsors,
    ...visibleSponsors,
    ...visibleSponsors,
    ...visibleSponsors,
  ]

  return (
    <div
      ref={containerRef}
      className={clsx(
        'overflow-hidden bg-white/95 backdrop-blur-sm dark:bg-gray-900/95',
        'rounded-lg border-2 border-brand-cloud-blue/20 shadow-xl',
        variant === 'strip' ? 'py-4' : 'py-12',
        className,
      )}
      aria-label="Sponsor banner"
      role="marquee"
      aria-live="off"
    >
      {heading && (
        <p className="mb-8 px-12 text-center text-lg font-semibold tracking-widest text-gray-600 uppercase dark:text-gray-400">
          {heading}
        </p>
      )}
      <div
        ref={contentRef}
        className="animate-marquee-dynamic flex items-center"
        style={
          {
            '--marquee-speed': `${speed}s`,
            '--scroll-width': `${scrollWidth}px`,
            willChange: 'transform',
            contain: 'layout',
          } as CSSProperties
        }
      >
        {duplicatedSponsors.map((sponsor, index) => (
          <div
            key={`${sponsor.sponsor._id}-${index}`}
            className={clsx(
              'shrink-0',
              variant === 'strip' ? 'px-8' : 'px-12',
              // The strip is dark: a sponsor with no bright logo gets its
              // dark one on a white tile, so it still reads (spec §9.4).
              variant === 'strip' &&
                sponsor.sponsor.logo &&
                !sponsor.sponsor.logoBright &&
                '[&>a]:rounded-md [&>a]:bg-white [&>a]:px-3 [&>a]:py-2',
            )}
          >
            <a
              href={sponsor.sponsor.website}
              target="_blank"
              rel="noopener noreferrer"
              className="block transition-opacity hover:opacity-80 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-gray-900"
              aria-label={`Visit ${sponsor.sponsor.name} website`}
            >
              <SponsorLogo
                logo={sponsor.sponsor.logo}
                logoBright={sponsor.sponsor.logoBright}
                name={sponsor.sponsor.name}
                className={
                  variant === 'strip'
                    ? 'h-14 w-auto max-w-[260px] object-contain'
                    : 'h-20 w-auto max-w-[400px] object-contain sm:h-24 lg:h-28'
                }
              />
            </a>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes marquee-dynamic {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(calc(-1 * var(--scroll-width, 50%)));
          }
        }

        .animate-marquee-dynamic {
          animation: marquee-dynamic var(--marquee-speed, 30s) linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-marquee-dynamic {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
