'use client'

import { useMemo, useState } from 'react'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { HomepageSectionRenderer } from '@/components/homepage/SectionRenderer'
import type { Conference } from '@/lib/conference/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { sectionContentStatus } from '@/lib/homepage/contentStatus'
import {
  PLACEHOLDER_FAQ_ITEMS,
  isPlaceholder,
  needsPlaceholderFaqItems,
  withPlaceholders,
} from '@/lib/homepage/placeholders'
import type {
  PreviewColorScheme,
  PreviewMode,
} from '@/lib/homepage/previewProtocol'
import {
  SECTION_LABELS,
  type HomepageSection,
  type HomepageSectionType,
} from '@/lib/homepage/sections'
import { resolveHomepageLifecycle } from '@/lib/homepage/lifecycle'
import type { TicketAvailability } from '@/lib/tickets/public'
import { PreviewBandFrame } from './PreviewBandFrame'
import { PreviewChrome } from './PreviewChrome'

export interface HomepagePreviewProps {
  /** The tenant's REAL conference, exactly as the public page receives it. */
  conference: Conference
  /** The composition to render — the composer's UNSAVED rows, when live. */
  sections: HomepageSection[]
  mode?: PreviewMode
  scheme?: PreviewColorScheme
  ticketsFromPrice?: string | null
  ticketAvailability?: TicketAvailability | null
  /** `_key` of the section whose config is open in the composer rail. */
  focusKey?: string | null
  /** `_key` of the section hovered in the composer rail. */
  hoverKey?: string | null
  /**
   * Reference time for placeholder dates and the time-dependent content-status
   * guards. Injectable so stories and tests are deterministic; defaults to now.
   */
  now?: number
  /** Bumped on every state push; resets any band that threw. */
  resetKey?: number
  onSelect?: (key: string) => void
  onHover?: (key: string | null) => void
  onThemeToggle?: () => void
}

/**
 * The composer's live preview: the organizer's actual front page, rendered from
 * the REAL section components, wrapped in the REAL header and footer, under the
 * tenant's own theme.
 *
 * ## Why this is a full-fidelity render and not a mockup
 *
 * The homepage render tree has no `server-only` / `next/headers` / `'use cache'`
 * imports anywhere — the whole composition already renders client-side in
 * `HomepageComposition.stories.tsx` with only the Sanity image CDN mocked. So
 * "what the organizer sees" and "what ships" are the same components with the
 * same props, not two implementations that have to be kept in sync. Header and
 * Footer are pure functions of `Conference`, so they come along for free.
 *
 * (Honest limitation: the previewed Header shows the ORGANIZER's own signed-in
 * cluster, because it reads the live session. Forcing a signed-out render would
 * mean forking Header, which would break the guarantee above for a detail the
 * organizer can already interpret.)
 *
 * ## One renderer call per band
 *
 * Each section is rendered by its own `HomepageSectionRenderer` call inside a
 * {@link PreviewBandFrame}. That is what buys per-band badges, ghosting,
 * click-to-focus and error isolation without a single line of change inside the
 * renderer or any section component — files that other branches are editing
 * right now. The lifecycle override (`cancelled` / `archived`) is checked ONCE
 * above the loop, because those states replace the page rather than reorder it.
 *
 * ## The two modes
 *
 * **Design** (default) — for making layout decisions before the content exists.
 * Empty conference-level collections are filled with obviously-synthetic sample
 * content (`withPlaceholders`), every band standing on it is chipped "Sample
 * content" with a dashed amber outline, bands switched off with the eye toggle
 * are ghosted rather than removed, and a band that would render nothing even
 * with samples gets a plate naming the reason.
 *
 * **Live** — byte-for-byte what a visitor gets: no placeholders, hidden bands
 * absent, empty bands genuinely gone. One toggle between an aspirational page
 * and the truthful one is the honesty mechanism; nobody ships thinking they have
 * twelve speakers.
 */
export function HomepagePreview({
  conference,
  sections,
  mode = 'design',
  scheme = 'light',
  ticketsFromPrice,
  ticketAvailability,
  focusKey,
  hoverKey,
  now,
  resetKey = 0,
  onSelect,
  onHover,
  onThemeToggle,
}: HomepagePreviewProps) {
  const design = mode === 'design'
  // Pinned ONCE per mount rather than read on every render: placeholder dates,
  // the countdown target and the "programme published" guard must all agree
  // with each other, and a clock that moved between two renders would make
  // `withPlaceholders` return a new conference on every keystroke — remounting
  // the carousel and re-fetching images for nothing.
  const [mountedAt] = useState(() => Date.now())
  const reference = now ?? mountedAt

  const { conference: previewConference, placeholderTypes } = useMemo(
    () =>
      design
        ? withPlaceholders(conference, { now: reference })
        : {
            conference,
            placeholderTypes:
              new Set<HomepageSectionType>() as ReadonlySet<HomepageSectionType>,
          },
    [conference, design, reference],
  )

  const placeholderImages = useMemo(
    () => buildPlaceholderImageMap(previewConference),
    [previewConference],
  )

  const lifecycle = resolveHomepageLifecycle(previewConference, {
    ticketAvailability,
  })

  const bands = design
    ? sections
    : sections.filter((section) => !section.hidden)

  return (
    <PreviewChrome
      theme={conference.theme}
      backgroundPattern={conference.backgroundPattern}
      scheme={scheme}
      placeholderImages={placeholderImages}
      onThemeToggle={onThemeToggle}
    >
      <Header c={previewConference} />
      <main className="flex-auto">
        {lifecycle.isOverridden ? (
          // `cancelled` / `archived` REPLACE the page. Showing the real
          // replacement is the correct — and worth seeing — preview; the
          // composition underneath is not what visitors would get.
          <HomepageSectionRenderer
            sections={sections}
            conference={previewConference}
            ticketsFromPrice={ticketsFromPrice}
            ticketAvailability={ticketAvailability}
          />
        ) : (
          bands.map((section) => {
            const label = SECTION_LABELS[section._type] ?? section._type
            // Status is always computed against the organizer's REAL
            // conference: the chips must say what the LIVE site does, not what
            // the placeholder-filled copy does.
            const status = sectionContentStatus(section, conference, {
              now: reference,
            })
            const rendered = design
              ? applyDesignPlaceholders(section)
              : { section, sample: false }
            const sample =
              rendered.sample || placeholderTypes.has(section._type)
            // Would the band render nothing even with samples behind it?
            const emptyInPreview = sectionContentStatus(
              rendered.section,
              previewConference,
              { now: reference },
            ).willHide

            return (
              <PreviewBandFrame
                key={section._key}
                sectionKey={section._key}
                label={label}
                mode={mode}
                hidden={section.hidden === true}
                sample={sample}
                status={status}
                emptyInPreview={emptyInPreview}
                focused={focusKey === section._key}
                hovered={hoverKey === section._key}
                resetKey={resetKey}
                onSelect={onSelect}
                onHover={onHover}
              >
                <HomepageSectionRenderer
                  // Visibility is the FRAME's business in Design mode (ghosted,
                  // not absent), so the renderer is handed an un-hidden copy.
                  sections={[{ ...rendered.section, hidden: false }]}
                  conference={previewConference}
                  ticketsFromPrice={ticketsFromPrice}
                  ticketAvailability={ticketAvailability}
                />
              </PreviewBandFrame>
            )
          })
        )}
      </main>
      <Footer c={previewConference} />
    </PreviewChrome>
  )
}

/**
 * Section-LEVEL sample content, for the one band whose content can live on the
 * section rather than on the conference.
 *
 * `withPlaceholders` fills conference-level collections only — by design, it is
 * the conference it is handed a copy of. A FAQ block set to `own` with no items
 * of its own is therefore still empty after that pass, and would preview as a
 * plate on a page the organizer is trying to lay out. Filling it here keeps the
 * placeholder module pure and the substitution visible at the point of use.
 * Nothing is persisted: this copy exists for one render.
 */
function applyDesignPlaceholders(section: HomepageSection): {
  section: HomepageSection
  sample: boolean
} {
  if (needsPlaceholderFaqItems(section)) {
    return {
      section: { ...section, items: [...PLACEHOLDER_FAQ_ITEMS] },
      sample: true,
    }
  }
  return { section, sample: false }
}

/**
 * Sanity asset `_ref` → the placeholder's own `data:` URI, for the DOM guard.
 *
 * Sample gallery tiles carry a well-formed but NONEXISTENT asset ref (a
 * malformed one would make `@sanity/image-url` throw and take the band down),
 * so anything that renders them through the CDN builder — `ImageCarousel`, its
 * thumbnail strip, the fullscreen modal — produces a URL that 404s. The honest
 * artwork already travels on `imageUrl`; this map lets
 * {@link usePreviewDomGuard} put it where the DOM actually looks.
 */
export function buildPlaceholderImageMap(
  conference: Conference,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  const images: GalleryImageWithSpeakers[] = [
    ...(conference.featuredGalleryImages ?? []),
    ...(conference.galleryImages ?? []),
  ]
  for (const image of images) {
    if (!isPlaceholder(image)) continue
    const ref = image.image?.asset?._ref
    if (ref && image.imageUrl) map.set(ref, image.imageUrl)
  }
  return map
}
