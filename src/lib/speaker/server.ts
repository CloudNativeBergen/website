/**
 * Server-only half of the speaker seam (#1772, #1897). Mirrors
 * `@/lib/proposal/server`: functions that need another server-only seam, or
 * write, live here so `@/lib/speaker` (`./index`) stays importable from the
 * module chains that reach it today (e.g. gallery/events, which Storybook
 * loads through conference/sanity).
 */
import 'server-only'
import type { Transaction } from '@sanity/client'
import { clientWrite } from '@/lib/sanity/client'
import { listPublicTalks } from '@/lib/proposal/server'
import type { PublicTalk } from '@/lib/proposal/public'
import * as store from './sanity'
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
  /** Confirmed talks in the conference, from the proposal seam. */
  talks: PublicTalk[]
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
  const { speaker, err } = await store.getPublicSpeaker(conferenceId, slug)
  if (!speaker) return { speaker: null, talks: [], err: err as Error | null }
  const { _id: speakerId, ...publicSpeaker } = speaker
  const talks = await listPublicTalks(conferenceId, { speakerId })
  return { speaker: publicSpeaker, talks: talks.talks, err: talks.err }
}

/** What an organizer supplies to create a speaker placeholder in `orgId`. */
export type CreateSpeakerInput = store.OrganizerCreatedSpeakerFields & {
  orgId: string
}

/**
 * Create an organizer-made speaker placeholder (see
 * `buildOrganizerCreatedSpeaker` for the shape and what it must never carry).
 * Commits on its own, unless `options.transaction` is given: then the create is
 * queued on it with `options.id` and the caller commits.
 */
export async function createSpeaker(
  { orgId, ...fields }: CreateSpeakerInput,
  options: { id?: string; transaction?: Transaction } = {},
): Promise<{ id: string }> {
  const document = await store.buildOrganizerCreatedSpeaker(fields, orgId)
  const doc = options.id ? { _id: options.id, ...document } : document
  if (options.transaction) {
    if (!options.id) throw new Error('createSpeaker: transaction needs an id')
    options.transaction.create(doc as typeof document & { _id: string })
    return { id: options.id }
  }
  const created = await clientWrite.create(doc)
  return { id: created._id }
}
