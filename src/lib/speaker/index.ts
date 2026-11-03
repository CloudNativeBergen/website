/**
 * Speaker domain seam (#1772). Call sites read speakers through this module so
 * the backing store can later move from Sanity to the konf API, the way
 * conference public reads did (`src/lib/conference/konf-api.ts`). Today every
 * function here is Sanity-backed and behaves exactly as the function it wraps.
 *
 * Return types name the fields a caller may rely on, shaped like the future
 * GraphQL type, so a second backend only has to produce these fields.
 */
import type { ProposalExisting } from '@/lib/proposal/types'
import { getPublicSpeaker } from './sanity'
import type { Speaker } from './types'

/** A speaker's public profile in one conference. */
export type PublicSpeaker = Pick<
  Speaker,
  'name' | 'title' | 'bio' | 'links' | 'flags' | 'image' | 'galleryImages'
> & {
  /** Not projected by the Sanity read today, so always undefined there. */
  slug?: string
}

export interface PublicSpeakerProfile {
  speaker: PublicSpeaker | null
  /** Confirmed talks in the conference. Typed by the proposal seam later. */
  talks: ProposalExisting[]
  err: Error | null
}

/**
 * The public profile of the speaker at `slug`, or `speaker: null` when no
 * speaker with a confirmed talk in `conferenceId` has that slug.
 */
export async function getPublicSpeakerProfile(
  conferenceId: string,
  slug: string,
): Promise<PublicSpeakerProfile> {
  const { speaker, talks, err } = await getPublicSpeaker(conferenceId, slug)
  return { speaker, talks, err: err as Error | null }
}
