'use client'

import { ConferenceSponsor } from '@/lib/sponsor/types'
import { SponsorLogo } from '@/components/SponsorLogo'
import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'

interface SponsorBannerProps {
  sponsors: ConferenceSponsor[]
  className?: string
  speed?: number
}

export function SponsorBanner({
  sponsors,
  className,
  speed = 30,
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

  if (!sponsors || sponsors.length === 0) {
    return null
  }

  // Duplicate sponsors multiple times to ensure smooth scrolling
  const duplicatedSponsors = [
    ...sponsors,
    ...sponsors,
    ...sponsors,
    ...sponsors,
  ]

  return (
    <div
      ref={containerRef}
      className={clsx(
        'overflow-hidden bg-white/95 backdrop-blur-sm dark:bg-gray-900/95',
        'rounded-lg border-2 border-brand-cloud-blue/20 shadow-xl',
        'py-12',
        className,
      )}
      aria-label="Sponsor banner"
      role="marquee"
      aria-live="off"
    >
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
            className="shrink-0 px-12"
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
                className="h-20 w-auto max-w-[400px] object-contain sm:h-24 lg:h-28"
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
