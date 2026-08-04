import { MissingAvatar } from '@/components/common/MissingAvatar'
import { speakerImageUrl } from '@/lib/sanity/client'
import {
  computeSpeakerData,
  stripCompanyFromTitle,
} from '@/lib/speaker/promotion'
import type { SpeakerWithTalks } from '@/lib/speaker/types'

interface OrganizersCompactProps {
  /** Already sorted by the band — this component never reorders people. */
  organizers: SpeakerWithTalks[]
}

/**
 * Dense avatar-and-name roster — the `compact` variant of the organizers band.
 *
 * The default (`cards`) gives every organizer a full `SpeakerPromotionCard`:
 * card chrome, an "Organizer" pill, a 140px portrait and a bio. That is a fine
 * treatment for a committee of five and a wall of noise for a team of twenty,
 * where the section ends up dominating the page it is meant to footnote.
 *
 * Here each person is one row — a small round portrait, the name, and a single
 * clamped role line — laid out in a multi-column grid so a large team reads as
 * a roster rather than a catalogue. No cards, no borders, no per-person CTA
 * (the card variant has none either, so nothing is lost by dropping it).
 *
 * Server component: no state, no interactivity. Colours come from the brand
 * tokens (`brand-cloud-blue` resolves to the tenant's `--brand-primary`), so
 * the roster picks up the tenant theme in both light and dark mode.
 */
export function OrganizersCompact({ organizers }: OrganizersCompactProps) {
  return (
    <ul className="mt-12 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {organizers.map((organizer) => {
        const { name, title, image } = organizer
        const { company } = computeSpeakerData(organizer)
        // Prefer the role; fall back to the company when the title was only
        // ever "… at Company" and stripping it leaves nothing.
        const role = stripCompanyFromTitle(title, company) || company

        return (
          <li key={organizer._id} className="flex min-w-0 items-center gap-3">
            <div className="size-14 shrink-0 overflow-hidden rounded-full ring-2 ring-brand-cloud-blue/25 dark:ring-brand-cloud-blue/40">
              {image ? (
                <img
                  src={speakerImageUrl(image, {
                    width: 112,
                    height: 112,
                    fit: 'crop',
                  })}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover object-center"
                />
              ) : (
                <MissingAvatar
                  name={name}
                  size={56}
                  textSizeClass="text-lg"
                  className="size-full"
                />
              )}
            </div>

            <div className="min-w-0">
              <p className="font-space-grotesk truncate text-base font-bold text-brand-slate-gray dark:text-white">
                {name}
              </p>
              {role && (
                <p className="font-inter mt-0.5 line-clamp-1 text-sm text-brand-slate-gray/70 dark:text-gray-400">
                  {role}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
