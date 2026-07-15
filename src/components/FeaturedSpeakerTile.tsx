import Link from 'next/link'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import { speakerImageUrl } from '@/lib/sanity/client'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import {
  computeSpeakerData,
  stripCompanyFromTitle,
} from '@/lib/speaker/promotion'

interface FeaturedSpeakerTileProps {
  speaker: SpeakerWithTalks
}

/**
 * A single photo-forward overlay tile for the Featured Speakers shelf.
 *
 * The whole tile is clickable (a stretched pseudo-element on the name link),
 * while the accessible link text remains the speaker's name. A bottom scrim
 * keeps the caption legible over the portrait photo; speakers without an image
 * fall back to initials on a brand-tinted gradient so the frame never looks
 * broken.
 */
export function FeaturedSpeakerTile({ speaker }: FeaturedSpeakerTileProps) {
  const { name, slug, title, image } = speaker
  const { company, hasWorkshop } = computeSpeakerData(speaker)

  // Prefer the (short) company as the sub-line for overlay legibility, falling
  // back to the role with any trailing "at Company" fragment removed.
  const role = stripCompanyFromTitle(title, company)
  const subline = company || role

  return (
    <div className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl bg-brand-slate-gray focus-within:ring-2 focus-within:ring-brand-cloud-blue focus-within:ring-offset-2 focus-within:ring-offset-brand-slate-gray">
      {/* Portrait photo (or initials fallback) filling the tile */}
      {image ? (
        <img
          src={speakerImageUrl(image, {
            width: 640,
            height: 800,
            fit: 'crop',
          })}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 motion-safe:group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-brand-cloud-blue/40 via-brand-nordic-purple/30 to-brand-slate-gray">
          <MissingAvatar
            name={name}
            size={640}
            className="absolute inset-0 !bg-transparent"
            textSizeClass="text-6xl"
          />
        </div>
      )}

      {/* Bottom scrim for caption legibility */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent"
      />

      {/* Workshop badge (top-left) — the only signal we can derive reliably */}
      {hasWorkshop && (
        <span className="font-inter absolute top-3 left-3 z-10 rounded-full bg-accent-yellow px-2.5 py-1 text-xs font-bold text-black shadow-md">
          Workshop
        </span>
      )}

      {/* Caption (bottom-left).
          NOTE: intentionally NOT `position: relative`. As a flex item it still
          honors `z-10` (stacking above the scrim), while staying out of the
          containing-block chain so the name link's stretched `after:inset-0`
          resolves to the whole tile — making the entire portrait clickable,
          not just this caption strip. */}
      <div className="z-10 p-4 sm:p-5">
        <h3 className="font-space-grotesk text-lg font-bold text-white sm:text-xl">
          <Link
            href={`/speaker/${slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus:outline-none"
          >
            {name}
          </Link>
        </h3>
        {subline && (
          <p className="font-inter mt-1 line-clamp-1 text-sm text-slate-200">
            {subline}
          </p>
        )}
      </div>
    </div>
  )
}
