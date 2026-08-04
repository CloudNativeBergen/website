import { ProgramHighlights } from '@/components/ProgramHighlights'
import type { Conference } from '@/lib/conference/types'
import type { HomepageLifecycle } from '@/lib/homepage/lifecycle'
import type { SectionVariant } from '@/lib/homepage/variants'

/** Program-highlights band (legacy middle slot). Null without a live schedule. */
export function ProgramHighlightsSectionView({
  conference,
  lifecycle,
  variant,
}: {
  conference: Conference
  lifecycle: HomepageLifecycle
  /** Passed straight through; the band resolves it (absent = `full`). */
  variant?: SectionVariant<'homepageProgramHighlights'>
}) {
  // A published-but-EMPTY schedule is not a programme. Guarding on content (not
  // just on "publish was pressed") is what stops the all-zero statistics band.
  if (!lifecycle.content.hasProgramme) return null
  return (
    <ProgramHighlights
      schedules={conference.schedules!}
      featuredSpeakers={conference.featuredSpeakers || []}
      featuredTalks={conference.featuredTalks || []}
      conference={conference}
      variant={variant}
    />
  )
}
