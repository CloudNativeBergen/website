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
  "orgId": conference->organization._ref,
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
  orgId: string | null
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
    orgId: raw.orgId ?? null,
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

/**
 * A Sanity `ifRevisionId` mismatch — someone else wrote first. Matches the
 * 409 status and, like `src/lib/schedule/sanity.ts`, the message form, so a
 * conflict is never mistaken for a transport failure.
 */
function isRevisionConflict(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode
  if (statusCode === 409) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('revision') && message.includes('mismatch')
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
  async findWork(now, staleBefore, bounds) {
    // groq-global: one conference's due variants, correlated to the parent
    // conference document (`^._id`) of the grouped scan below. DRAFTS AND
    // RELEASE VERSIONS ARE EXCLUDED EXPLICITLY: the write client has no
    // perspective, so an unsaved Studio edit (`drafts.<id>`) or a staged
    // Content Release copy (`versions.<release>.<id>`) would otherwise be a
    // second due document with its own revision — and post twice.
    const dueOfConference = groq`*[_type == "socialPostVariant" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && status == "scheduled" && defined(scheduledAt) && dateTime(scheduledAt) <= dateTime($now) && conference._ref == ^._id]`
    // groq-global: the per-minute publish cron sweeps EVERY tenant's due
    // variants in one scan (#785). The scan is grouped by conference so the
    // fairness bound (at most N per conference) is enforced in the read —
    // a tenant with a deep backlog cannot fill the window. The correlated
    // count() runs once per conference document (tens), then the slice
    // keeps the first N conferences in document order.
    const due = groq`*[_type == "conference" && count(${dueOfConference}) > 0][0...${bounds.maxConferences}]{ "due": ${dueOfConference} | order(scheduledAt asc)[0...${bounds.perConference}]${VARIANT_PROJECTION} }.due`
    // groq-global: the same cron's stale-claim sweep, across every tenant.
    const stale = groq`*[_type == "socialPostVariant" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && status == "publishing" && (!defined(claimedAt) || dateTime(claimedAt) < dateTime($staleBefore))][0...${bounds.staleLimit}]${VARIANT_PROJECTION}`
    // Both sweeps in ONE round trip: the tick runs every minute.
    const query = `{ "due": ${due}, "stale": ${stale} }`
    const result = await clientWrite.fetch<{
      due: RawVariant[][] | null
      stale: RawVariant[] | null
    }>(query, {
      now: now.toISOString(),
      staleBefore: staleBefore.toISOString(),
    })
    return {
      due: (result?.due ?? []).flat().map(normalizeVariant),
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
    if (options && 'ifRevision' in options) {
      // A caller that ASKED for compare-and-set never gets an unconditional
      // write by accident (the schedule module's helper takes the same line).
      if (!options.ifRevision) {
        throw new Error(
          `transition(${variantId}): compare-and-set requested without a revision`,
        )
      }
      patch = patch.ifRevisionId(options.ifRevision)
    }
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
  // groq-global-scoped: by-id read after the tenancy guard has admitted the
  // id. Never a draft twin: a mutation must act on the live document.
  const query = groq`*[_type == "socialPostVariant" && _id == $variantId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]${VARIANT_PROJECTION}`
  const row = await clientWrite.fetch<RawVariant | null>(query, { variantId })
  return row ? normalizeVariant(row) : null
}

/**
 * Upper bound on rows the admin list renders; tens of posts per edition is
 * the design scale. Actionable rows sort BEFORE published history, so when
 * the bound bites it is old published rows that drop off, never a new draft.
 */
const LIST_LIMIT = 500

/** The post's default time, for an organizer re-schedule that follows it. */
export async function getSocialPostDefaultTime(
  postId: string,
  conferenceId: string,
): Promise<string | null> {
  const query = groq`*[_type == "socialPost" && _id == $postId && conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0].defaultScheduledAt`
  const value = await clientWrite.fetch<string | null>(query, {
    postId,
    conferenceId,
  })
  return value ?? null
}

/** Every variant of the conference, soonest first, for the admin list. */
export async function listSocialPostVariants(
  conferenceId: string,
): Promise<SocialPostVariantListItem[]> {
  const rows = await scopedFetch<
    (RawVariant & { postDefaultScheduledAt: string | null })[]
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "socialPostVariant" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(select(status == "published" => 1, 0) asc, coalesce(scheduledAt, "9999") asc, _createdAt desc)[0...${LIST_LIMIT}]{ ...${VARIANT_PROJECTION}, "postDefaultScheduledAt": select(post->conference._ref == conference._ref => post->defaultScheduledAt) }`,
    {},
    { cache: 'no-store' },
  )
  return (rows ?? []).map((row) => ({
    ...normalizeVariant(row),
    postDefaultScheduledAt: row.postDefaultScheduledAt ?? null,
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
  conferenceId: string,
  defaultScheduledAt: string,
): Promise<{ rewritten: number } | { conflict: true }> {
  const query = groq`*[_type == "socialPostVariant" && conference._ref == $conferenceId && post._ref == $postId && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && usesCustomTime != true && status in ["draft", "scheduled", "failed"]]{ _id, _rev }`
  const variants = await clientWrite.fetch<{ _id: string; _rev: string }[]>(
    query,
    { postId, conferenceId },
  )
  const now = getCurrentDateTime()
  // Every variant patch is compare-and-set on the revision we just read, so a
  // cron tick that claims or re-queues one of them between the read and the
  // commit fails the WHOLE transaction rather than being overwritten.
  const tx = clientWrite
    .transaction()
    .patch(postId, (p) => p.set({ defaultScheduledAt, updatedAt: now }))
  for (const { _id, _rev } of variants ?? []) {
    tx.patch(_id, (p) =>
      p
        .ifRevisionId(_rev)
        .set({ scheduledAt: defaultScheduledAt, updatedAt: now }),
    )
  }
  try {
    await tx.commit()
  } catch (error) {
    if (isRevisionConflict(error)) return { conflict: true }
    throw error
  }
  return { rewritten: (variants ?? []).length }
}

export type DeleteSocialPostResult =
  | { deleted: true; variants: number }
  | { deleted: false; reason: 'in-flight' | 'published' }

/**
 * Delete a post and every variant of it in ONE transaction. Refused while a
 * variant holds a publishing claim (the cron would settle onto a missing
 * document) or has been published (the audit trail and the platform post
 * id must outlive a tidy-up).
 */
export async function deleteSocialPost(
  postId: string,
  conferenceId: string,
): Promise<DeleteSocialPostResult> {
  const query = groq`*[_type == "socialPostVariant" && conference._ref == $conferenceId && post._ref == $postId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{ _id, status }`
  const variants = await clientWrite.fetch<{ _id: string; status: string }[]>(
    query,
    { postId, conferenceId },
  )
  const rows = variants ?? []
  if (rows.some((v) => v.status === 'publishing')) {
    return { deleted: false, reason: 'in-flight' }
  }
  if (rows.some((v) => v.status === 'published')) {
    return { deleted: false, reason: 'published' }
  }
  const tx = clientWrite.transaction()
  for (const { _id } of rows) tx.delete(_id)
  tx.delete(postId)
  await tx.commit()
  return { deleted: true, variants: rows.length }
}

export type { VariantTransition }
