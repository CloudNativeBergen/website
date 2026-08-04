import { ProgramHighlights } from '@/components/ProgramHighlights'
import type { Conference } from '@/lib/conference/types'
import type { HomepageLifecycle } from '@/lib/homepage/lifecycle'

/** Program-highlights band (legacy middle slot). Null without a live schedule. */
export function ProgramHighlightsSectionView({
  conference,
  lifecycle,
}: {
  conference: Conference
  lifecycle: HomepageLifecycle
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
    />
  )
}
