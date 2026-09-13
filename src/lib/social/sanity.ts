import { randomUUID } from 'node:crypto'
import { groq } from 'next-sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import type { SocialVariantStore, VariantTransition } from './store'
import type {
  PublishAttempt,
  SocialPlatform,
  SocialPostVariant,
  SocialPostVariantListItem,
} from './types'

/**
 * Sanity persistence for the posting core. The engine sees only the
 * {@link SocialVariantStore} slice; the router uses the rest.
 *
 * Reads go through `clientWrite` where read-your-writes matters (the cron and
 * every mutation's pre-read); the admin list uses the live read client with a
 * tenant scope.
 */

const VARIANT_PROJECTION = groq`{
  _id,
  _rev,
  "postId": post._ref,
  "conferenceId": conference._ref,
  platform,
  body,
  status,
  scheduledAt,
  usesCustomTime,
  claimedAt,
  link,
  publishResult,
  attempts[]{ _key, at, outcome, error, "by": by._ref },
  attemptCount,
  updatedAt
}`

interface RawVariant {
  _id: string
  _rev: string
  postId: string | null
  conferenceId: string | null
  platform: SocialPlatform
  body: string | null
  status: SocialPostVariant['status'] | null
  scheduledAt: string | null
  usesCustomTime: boolean | null
  claimedAt: string | null
  link: string | null
  publishResult: SocialPostVariant['publishResult'] | null
  attempts: (Partial<PublishAttempt> & { _key: string })[] | null
  attemptCount: number | null
  updatedAt: string | null
}

function normalizeVariant(raw: RawVariant): SocialPostVariant {
  return {
    _id: raw._id,
    _rev: raw._rev,
    postId: raw.postId ?? '',
    conferenceId: raw.conferenceId ?? '',
    platform: raw.platform,
    body: raw.body ?? '',
    status: raw.status ?? 'draft',
    scheduledAt: raw.scheduledAt ?? null,
    usesCustomTime: raw.usesCustomTime === true,
    claimedAt: raw.claimedAt ?? null,
    link: raw.link ?? null,
    publishResult: raw.publishResult ?? null,
    attempts: (raw.attempts ?? []).map((a) => ({
      _key: a._key,
      at: a.at ?? '',
      outcome: a.outcome ?? 'ambiguous',
      ...(a.error ? { error: a.error } : {}),
      ...(a.by ? { by: a.by } : {}),
    })),
    attemptCount: raw.attemptCount ?? 0,
  }
}

/** A Sanity `ifRevisionId` mismatch — someone else wrote first. */
function isRevisionConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    (error as { statusCode?: number }).statusCode === 409
  )
}

function attemptDoc(attempt: Omit<PublishAttempt, '_key'>) {
  return {
    _key: randomUUID(),
    at: attempt.at,
    outcome: attempt.outcome,
    ...(attempt.error ? { error: attempt.error } : {}),
    ...(attempt.by
      ? { by: { _type: 'reference', _ref: attempt.by, _weak: true } }
      : {}),
  }
}

export const sanitySocialVariantStore: SocialVariantStore = {
  async findWork(now, staleBefore, limit) {
    // groq-global: the per-minute publish cron sweeps EVERY tenant's due
    // variants in one scan (#785); each variant carries its own conference
    // and is dispatched with that tenant's adapter.
    const due = groq`*[_type == "socialPostVariant" && status == "scheduled" && defined(scheduledAt) && scheduledAt <= $now] | order(scheduledAt asc)[0...$limit]${VARIANT_PROJECTION}`
    // groq-global: the same cron's stale-claim sweep, across every tenant.
    const stale = groq`*[_type == "socialPostVariant" && status == "publishing" && (!defined(claimedAt) || claimedAt < $staleBefore)][0...$limit]${VARIANT_PROJECTION}`
    // Both sweeps in ONE round trip: the tick runs every minute.
    const query = `{ "due": ${due}, "stale": ${stale} }`
    const result = await clientWrite.fetch<{
      due: RawVariant[] | null
      stale: RawVariant[] | null
    }>(query, {
      now: now.toISOString(),
      staleBefore: staleBefore.toISOString(),
      limit,
    })
    return {
      due: (result?.due ?? []).map(normalizeVariant),
      stale: (result?.stale ?? []).map(normalizeVariant),
    }
  },

  async claim(variant, now) {
    try {
      const claimedAt = now.toISOString()
      const result = await clientWrite
        .patch(variant._id)
        .ifRevisionId(variant._rev)
        .set({ status: 'publishing', claimedAt })
        .commit()
      return {
        ...variant,
        _rev: result._rev,
        status: 'publishing',
        claimedAt,
      }
    } catch (error) {
      if (isRevisionConflict(error)) return null
      throw error
    }
  },

  async transition(variantId, transition, options) {
    const { attempt, ...fields } = transition
    let patch = clientWrite.patch(variantId)
    if (options?.ifRevision) patch = patch.ifRevisionId(options.ifRevision)
    patch = patch.set({ ...fields, updatedAt: getCurrentDateTime() })
    if (attempt) {
      patch = patch
        .setIfMissing({ attempts: [] })
        .append('attempts', [attemptDoc(attempt)])
    }
    try {
      await patch.commit()
      return true
    } catch (error) {
      if (isRevisionConflict(error)) return false
      throw error
    }
  },
}

/**
 * Point read for a mutation's pre-check. The caller has ALREADY proven the id
 * belongs to the request's conference (`requireDocumentInCurrentConference`).
 */
export async function getSocialPostVariant(
  variantId: string,
): Promise<SocialPostVariant | null> {
  // groq-global-scoped: by-id read after the tenancy guard has admitted the id.
  const query = groq`*[_type == "socialPostVariant" && _id == $variantId][0]${VARIANT_PROJECTION}`
  const row = await clientWrite.fetch<RawVariant | null>(query, { variantId })
  return row ? normalizeVariant(row) : null
}

/** Every variant of the conference, soonest first, for the admin list. */
export async function listSocialPostVariants(
  conferenceId: string,
): Promise<SocialPostVariantListItem[]> {
  const rows = await scopedFetch<RawVariant[]>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "socialPostVariant"] | order(coalesce(scheduledAt, "9999") asc, _createdAt desc)${VARIANT_PROJECTION}`,
    {},
    { cache: 'no-store' },
  )
  return (rows ?? []).map((row) => ({
    ...normalizeVariant(row),
    updatedAt: row.updatedAt ?? null,
  }))
}

export interface CreateSocialPostInput {
  conferenceId: string
  body: string
  /** ISO datetime or null. */
  defaultScheduledAt: string | null
  platforms: SocialPlatform[]
  createdBy: string
}

/**
 * Create the canonical post and one `draft` variant per platform in ONE
 * transaction. Each variant starts with the post's body and its default time
 * (`usesCustomTime: false`), so the default-time cascade applies to it.
 */
export async function createSocialPost(
  input: CreateSocialPostInput,
): Promise<{ postId: string; variantIds: string[] }> {
  const now = getCurrentDateTime()
  const postId = `socialPost.${randomUUID()}`
  const conference = { _type: 'reference', _ref: input.conferenceId }
  const tx = clientWrite.transaction().create({
    _id: postId,
    _type: 'socialPost',
    conference,
    body: input.body,
    defaultScheduledAt: input.defaultScheduledAt,
    createdBy: { _type: 'reference', _ref: input.createdBy, _weak: true },
    createdAt: now,
    updatedAt: now,
  })

  const variantIds: string[] = []
  for (const platform of input.platforms) {
    const variantId = `socialPostVariant.${randomUUID()}`
    variantIds.push(variantId)
    tx.create({
      _id: variantId,
      _type: 'socialPostVariant',
      post: { _type: 'reference', _ref: postId },
      conference,
      platform,
      body: input.body,
      status: 'draft',
      scheduledAt: input.defaultScheduledAt,
      usesCustomTime: false,
      attempts: [],
      attemptCount: 0,
      updatedAt: now,
    })
  }

  await tx.commit()
  return { postId, variantIds }
}

/**
 * Change the post's default time and REWRITE `scheduledAt` on every variant
 * that follows it (`usesCustomTime != true`) and can still be (re-)queued
 * (`draft`, `scheduled`, `failed`). A `publishing`, `awaiting-manual` or
 * `published` variant keeps its time: it records when the publish happened.
 * An engine re-queue flags itself `usesCustomTime`, so backoff slots are
 * never overwritten here.
 */
export async function updateSocialPostDefaultTime(
  postId: string,
  defaultScheduledAt: string,
): Promise<{ rewritten: number }> {
  // groq-global-scoped: the post id was admitted by the tenancy guard, and
  // variants hang off that post.
  const query = groq`*[_type == "socialPostVariant" && post._ref == $postId && usesCustomTime != true && status in ["draft", "scheduled", "failed"]]._id`
  const variantIds = await clientWrite.fetch<string[]>(query, { postId })
  const now = getCurrentDateTime()
  const tx = clientWrite
    .transaction()
    .patch(postId, (p) => p.set({ defaultScheduledAt, updatedAt: now }))
  for (const id of variantIds ?? []) {
    tx.patch(id, (p) =>
      p.set({ scheduledAt: defaultScheduledAt, updatedAt: now }),
    )
  }
  await tx.commit()
  return { rewritten: (variantIds ?? []).length }
}

export type { VariantTransition }
