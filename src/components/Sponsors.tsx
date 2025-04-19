'use client'
// Use client due to the use of InlineSvgPreviewComponent that renders SVGs

import { Container } from '@/components/Container'
import { ConferenceSponsor } from '@/lib/conference/types'
import { InlineSvgPreviewComponent } from '@starefossen/sanity-plugin-inline-svg-input'

export function Sponsors({ sponsors }: { sponsors: ConferenceSponsor[] }) {
  // @TODO make this more dynamic
  sponsors.push({
    sponsor: {
      name: 'TBD',
      logo: '',
      website: '/sponsor',
    },
  })
  return (
    <section id="sponsors" aria-label="Sponsors" className="py-20 sm:py-32">
      <Container>
        <h2 className="mx-auto max-w-4xl text-center font-display text-4xl font-medium tracking-tighter text-blue-900 sm:text-5xl">
          Fueling the cluster: Our sponsors keep the pods running!
        </h2>
        <div className="mx-auto mt-20 grid max-w-max grid-cols-1 place-content-center gap-x-32 gap-y-12 sm:grid-cols-4 md:gap-x-16 lg:gap-x-32">
          {sponsors.map((sponsor, i) => (
            <div
              key={`${sponsor.sponsor.name}-${i}`}
              className="flex items-center justify-center"
            >
              {sponsor.sponsor.name === 'TBD' ? (
                <a
                  type="button"
                  href="/sponsor"
                  className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-10 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:gap-y-16"
                >
                  <p className="mt-1 font-mono text-md text-slate-500">
                    Become our sponsor
                  </p>
                </a>
              ) : (
                <a href={sponsor.sponsor.website} className="hover:opacity-80 foo bvar">
                  <InlineSvgPreviewComponent
                    className="h-20"
                    value={sponsor.sponsor.logo}
                  />
                </a>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
