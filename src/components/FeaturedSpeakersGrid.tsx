import Link from 'next/link'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { FeaturedSpeakerTile } from '@/components/FeaturedSpeakerTile'
import { SpeakerWithTalks } from '@/lib/speaker/types'

interface FeaturedSpeakersGridProps {
  speakers: SpeakerWithTalks[]
}

/**
 * Static, even grid of the same photo-forward speaker tiles the shelf uses —
 * the `grid` variant of the featured-speakers band.
 *
 * The shelf (`FeaturedSpeakersShelf`) is a horizontally scrolling row: it shows
 * a curated few and asks the visitor to swipe for the rest, which reads as
 * breadth being withheld. This shows EVERY featured speaker at once, in a dense
 * wall that gets denser as the viewport widens (2 → 3 → 4 → 5 columns) — the
 * right answer for a conference whose line-up IS the pitch.
 *
 * Consequences of having no scroller: no client state, no timers and no
 * `prefers-reduced-motion` branch, so this stays a server component. The
 * "View all speakers" endcap is kept as a trailing tile so the grid still ends
 * on the same affordance the shelf does, and the speaker listing is reachable
 * from the band either way.
 */
export function FeaturedSpeakersGrid({ speakers }: FeaturedSpeakersGridProps) {
  return (
    <ul
      aria-label="Featured speakers"
      className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5"
    >
      {speakers.map((speaker) => (
        <li key={speaker._id}>
          <FeaturedSpeakerTile speaker={speaker} />
        </li>
      ))}

      {/* Endcap: same destination and same dashed treatment as the shelf's, so
          the two variants differ in layout only — never in what they offer.
          Deliberately NOT aspect-locked like the tiles are. As a grid item it
          stretches to the height of the row it shares, matching the tiles
          exactly; but when the speaker count leaves it ALONE on the last row
          (10 speakers in a 5-column grid, say) a 4:5 box would be a huge empty
          panel closing the section. `min-h-28` lets it collapse to a compact
          bar in that case. */}
      <li className="flex">
        <Link
          href="/speaker"
          className="group flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-frosted-steel px-2 py-6 text-center text-brand-slate-gray transition hover:border-brand-cloud-blue hover:text-brand-cloud-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:border-gray-700 dark:text-gray-300"
        >
          <span className="font-space-grotesk text-base font-bold sm:text-lg">
            View all speakers
          </span>
          <ArrowRightIcon className="mt-2 size-6 transition-transform group-hover:translate-x-1" />
        </Link>
      </li>
    </ul>
  )
}
