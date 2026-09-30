import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { logger } from '@/lib/logger'

/** A past edition of the current conference's organization (#1191). */
export interface GalleryEdition {
  _id: string
  title: string
  startDate: string
  endDate: string
}

/** What `gallery.admin.editions` returns: the current edition plus the past ones. */
export interface GalleryEditions {
  current: { _id: string; title?: string }
  previous: GalleryEdition[]
}

/**
 * The organization's PREVIOUS editions (#1191): sibling conferences whose end
 * date is strictly before the current edition's start date, newest first.
 * Future siblings and editions overlapping the current one are not "previous",
 * and an undated sibling cannot be proven past, so all three are excluded.
 *
 * ONE read, scoped to the organization by `scopedFetch` — another
 * organization's conference never reaches the date clause. A current edition
 * without a start date has nothing to compare against and FAILS CLOSED (no
 * query, no editions).
 */
export async function getPreviousEditions(
  orgId: string,
  current: { _id: string; startDate?: string | null },
): Promise<GalleryEdition[]> {
  if (!current.startDate) return []
  try {
    const editions = await scopedFetch<GalleryEdition[] | null>(
      clientReadUncached,
      { orgId },
      `*[_type == "conference" && _id != $currentId && defined(endDate) && endDate < $currentStart]
        | order(startDate desc) { _id, title, startDate, endDate }`,
      { currentId: current._id, currentStart: current.startDate },
      { cache: 'no-store' },
    )
    return editions ?? []
  } catch (error) {
    logger.error('Error listing previous gallery editions', {
      error: error instanceof Error ? error.message : 'Unknown error',
      orgId,
    })
    return []
  }
}
