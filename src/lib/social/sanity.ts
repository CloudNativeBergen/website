import { randomUUID } from 'node:crypto'
import { groq } from 'next-sanity'
import { mediaDeletionBlockers } from './media-deletion'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import { placeholderIssues } from './schedule-check'
import type { ValidationIssue } from './provider/types'
import type {
  PublishableVariant,
  SocialVariantStore,
  VariantTransition,
} from './store'
import { parseImageRefDimensions } from '@/lib/homepage/richTextImage'
import type {
  PublishAttempt,
  SocialPlatform,
  SocialPostAttachment,
  SocialPostVariant,
  SocialPostVariantListItem,
  SocialVariantAttachment,
  SocialVariantEditorData,
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
  attachments[]{ source, crop{ x, y, width, height }, altOverride },
  publishResult,
  attempts[]{ _key, at, outcome, error, "by": by._ref },
  attemptCount,
  updatedAt
}`

/**
 * The post's attachments as the editor, the rendition function and the
 * publish tick see them. Pixel size comes from the asset metadata, falling
 * back to the id (which encodes it) for an asset whose metadata has not
 * been extracted yet.
 */
const POST_ATTACHMENTS_PROJECTION = groq`attachments[]{
    _key,
    "assetId": image.asset._ref,
    "dimensions": image.asset->metadata.dimensions{ width, height },
    "hotspot": image.hotspot{ x, y },
    "crop": image.crop{ top, bottom, left, right },
    alt
  }`

/**
 * What the tick reads for a DUE variant: the slice plus its post's
 * attachments (#1005), joined only when the post belongs to the same
 * conference — a hand-edited cross-tenant reference yields no attachments
 * rather than another tenant's images.
 */
// groq-global-scoped: the Task subquery binds conference._ref to the outer variant's ^.conference._ref.
const DUE_PROJECTION = groq`{ ...${VARIANT_PROJECTION}, "postAttachments": select(post->conference._ref == conference._ref => post->${POST_ATTACHMENTS_PROJECTION}), "conferenceDomains": conference->domains, "postCreatedBy": select(post->conference._ref == conference._ref => post->createdBy._ref), "marketingTaskId": *[_type == "marketingTask" && conference._ref == ^.conference._ref && variant._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]._id }`

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
  attachments:
    | {
        source: string | null
        crop: Partial<NonNullable<SocialVariantAttachment['crop']>> | null
        altOverride: string | null
      }[]
    | null
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
    attachments: normalizeVariantAttachments(raw.attachments),
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

function normalizeVariantAttachments(
  raw: RawVariant['attachments'],
): SocialVariantAttachment[] {
  const out: SocialVariantAttachment[] = []
  for (const a of raw ?? []) {
    if (!a?.source) continue
    const c = a.crop
    const crop =
      c &&
      typeof c.x === 'number' &&
      typeof c.y === 'number' &&
      typeof c.width === 'number' &&
      typeof c.height === 'number'
        ? { x: c.x, y: c.y, width: c.width, height: c.height }
        : null
    out.push({ source: a.source, crop, altOverride: a.altOverride ?? null })
  }
  return out
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

function attemptDoc(attempt: NonNullable<VariantTransition['attempt']>) {
  return {
    _key: attempt._key ?? randomUUID(),
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
    const due = groq`*[_type == "conference" && count(${dueOfConference}) > 0][0...${bounds.maxConferences}]{ "due": ${dueOfConference} | order(scheduledAt asc)[0...${bounds.perConference}]${DUE_PROJECTION} }.due`
    // groq-global: the same cron's stale-claim sweep, across every tenant.
    const stale = groq`*[_type == "socialPostVariant" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && status == "publishing" && (!defined(claimedAt) || dateTime(claimedAt) < dateTime($staleBefore))][0...${bounds.staleLimit}]${VARIANT_PROJECTION}`
    // Both sweeps in ONE round trip: the tick runs every minute.
    const query = `{ "due": ${due}, "stale": ${stale} }`
    const result = await clientWrite.fetch<{
      due:
        | (RawVariant & {
            postAttachments: RawPostAttachments
            conferenceDomains: (string | null)[] | null
            postCreatedBy: string | null
            marketingTaskId: string | null
          })[][]
        | null
      stale: RawVariant[] | null
    }>(query, {
      now: now.toISOString(),
      staleBefore: staleBefore.toISOString(),
    })
    return {
      due: (result?.due ?? []).flat().map((raw): PublishableVariant => ({
        ...normalizeVariant(raw),
        postAttachments: normalizePostAttachments(raw.postAttachments),
        conferenceDomains: (raw.conferenceDomains ?? []).filter(
          (d): d is string => typeof d === 'string' && d.length > 0,
        ),
        marketingTaskId: raw.marketingTaskId,
        postCreatedBy:
          typeof raw.postCreatedBy === 'string' && raw.postCreatedBy.length > 0
            ? raw.postCreatedBy
            : null,
      })),
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
      post: { _type: 'reference', _ref: postId, _weak: true },
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
  // The post's revision is read in the SAME round trip as the followers, so
  // the two are a consistent snapshot to compare-and-set against.
  const postQuery = groq`*[_type == "socialPost" && _id == $postId && conference._ref == $conferenceId][0]._rev`
  const { variants, postRev } = await clientWrite.fetch<{
    variants: { _id: string; _rev: string }[] | null
    postRev: string | null
  }>(`{ "variants": ${query}, "postRev": ${postQuery} }`, {
    postId,
    conferenceId,
  })
  const now = getCurrentDateTime()
  // Every variant patch is compare-and-set on the revision we just read, so a
  // cron tick that claims or re-queues one of them between the read and the
  // commit fails the WHOLE transaction rather than being overwritten. The
  // post is compare-and-set too: an editor save that switched a variant to
  // "follow the default" after this read (and so is missing from `variants`)
  // bumps the post's revision, and this cascade conflicts instead of leaving
  // that variant on the old default.
  const tx = clientWrite.transaction().patch(postId, (p) =>
    (postRev ? p.ifRevisionId(postRev) : p).set({
      defaultScheduledAt,
      updatedAt: now,
    }),
  )
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
  | {
      deleted: false
      reason: 'in-flight' | 'published' | 'changed' | 'referenced'
    }
  /** A Marketing Task references a variant (spec §2.3): delete the Task instead. */
  | { deleted: false; reason: 'task'; taskId: string }

/**
 * Delete a post and every variant of it in ONE transaction. Refused while a
 * variant holds a publishing claim (the cron would settle onto a missing
 * document) or has been published (the audit trail and the platform post
 * id must outlive a tidy-up). Each variant is GUARDED by a compare-and-set
 * patch on the revision that was read, in the same transaction as its
 * delete: a cron claim or a "mark posted" landing between the read and the
 * commit aborts the whole delete instead of erasing a post that went out.
 * Refused, too, while a Marketing Task references one of the variants (spec
 * §2.3: deleting the Task deletes post and variant, never the other way).
 *
 * AND refused while anything this delete does NOT remove still points at the
 * post. The `post` reference used to be strong, so Sanity itself refused the
 * delete in that case; #1084 declared it weak — a Campaign or plan delete
 * cannot chunk its way through strong references — which removed that guard
 * silently. This enumerates only LIVE, same-conference variants, so a release
 * version or a variant belonging to another conference would have been left
 * pointing at a post that no longer exists, and the next publish or render
 * would find no parent. Asked as `references()` rather than by listing types:
 * nine review rounds on the plan-deletion path were each defeated by a
 * referrer the list did not name.
 */
export async function deleteSocialPost(
  postId: string,
  conferenceId: string,
): Promise<DeleteSocialPostResult> {
  const query = groq`*[_type == "socialPostVariant" && conference._ref == $conferenceId && post._ref == $postId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{ _id, _rev, status, "taskId": *[_type == "marketingTask" && conference._ref == $conferenceId && variant._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]._id }`
  const variants = await clientWrite.fetch<
    { _id: string; _rev: string; status: string; taskId: string | null }[]
  >(query, { postId, conferenceId })
  const rows = variants ?? []
  const referenced = rows.find((v) => v.taskId)
  if (referenced?.taskId) {
    return { deleted: false, reason: 'task', taskId: referenced.taskId }
  }
  if (rows.some((v) => v.status === 'publishing')) {
    return { deleted: false, reason: 'in-flight' }
  }
  if (rows.some((v) => v.status === 'published')) {
    return { deleted: false, reason: 'published' }
  }
  // Draft twins go with their variant, exactly as the post's own twin goes with
  // the post — and they must be in the delete set before the referrer count
  // below, or an unsaved Studio edit would refuse the delete of the document it
  // is a draft of.
  const deleted = [
    postId,
    `drafts.${postId}`,
    ...rows.flatMap(({ _id }) => [_id, `drafts.${_id}`]),
  ]
  if ((await mediaDeletionBlockers([postId], deleted)).length > 0)
    return { deleted: false, reason: 'referenced' }
  const now = getCurrentDateTime()
  const tx = clientWrite.transaction()
  for (const { _id, _rev } of rows) {
    tx.patch(_id, (p) => p.ifRevisionId(_rev).set({ updatedAt: now }))
    tx.delete(_id)
    tx.delete(`drafts.${_id}`)
  }
  tx.delete(postId)
  // The post is still editable in Studio, so an unsaved draft twin may exist;
  // a delete of a missing id is a no-op, and a surviving twin could be
  // published back as a variant-less post.
  tx.delete(`drafts.${postId}`)
  try {
    await tx.commit()
  } catch (error) {
    if (isRevisionConflict(error)) return { deleted: false, reason: 'changed' }
    throw error
  }
  return { deleted: true, variants: rows.length }
}

// ---------------------------------------------------------------------------
// The single-variant editor (#1007)
// ---------------------------------------------------------------------------

/**
 * The post's attachments as the editor and the rendition function see them.
 * Pixel size comes from the asset metadata, falling back to the id (which
 * encodes it) for an asset whose metadata has not been extracted yet.
 */
const POST_INPUTS_PROJECTION = groq`{
  _rev,
  defaultScheduledAt,
  ${POST_ATTACHMENTS_PROJECTION}
}`

type RawPostAttachments =
  | {
      _key: string
      assetId: string | null
      dimensions: { width: number | null; height: number | null } | null
      hotspot: { x: number | null; y: number | null } | null
      crop: {
        top: number | null
        bottom: number | null
        left: number | null
        right: number | null
      } | null
      alt: string | null
    }[]
  | null

interface RawPostInputs {
  _rev: string | null
  defaultScheduledAt: string | null
  attachments: RawPostAttachments
}

function normalizePostInputs(
  raw: RawPostInputs | null,
): SocialVariantEditorData['post'] {
  return {
    attachments: normalizePostAttachments(raw?.attachments),
    defaultScheduledAt: raw?.defaultScheduledAt ?? null,
  }
}

function normalizePostAttachments(
  raw: RawPostAttachments | undefined,
): SocialPostAttachment[] {
  const attachments: SocialPostAttachment[] = []
  for (const a of raw ?? []) {
    if (!a.assetId) continue
    const dims =
      a.dimensions?.width && a.dimensions?.height
        ? { width: a.dimensions.width, height: a.dimensions.height }
        : parseImageRefDimensions(a.assetId)
    if (!dims) continue
    const h = a.hotspot
    const c = a.crop
    attachments.push({
      _key: a._key,
      assetId: a.assetId,
      ...dims,
      hotspot:
        h && typeof h.x === 'number' && typeof h.y === 'number'
          ? { x: h.x, y: h.y }
          : null,
      crop:
        c &&
        typeof c.top === 'number' &&
        typeof c.bottom === 'number' &&
        typeof c.left === 'number' &&
        typeof c.right === 'number'
          ? { top: c.top, bottom: c.bottom, left: c.left, right: c.right }
          : null,
      alt: a.alt ?? '',
    })
  }
  return attachments
}

/**
 * Everything the editor loads for one variant, in ONE read. The caller has
 * proven the variant belongs to the request's conference; the post is only
 * followed when it belongs to the SAME conference, so a hand-edited
 * cross-tenant reference yields no attachments rather than another
 * tenant's images.
 */
export async function getSocialVariantEditorData(
  variantId: string,
): Promise<SocialVariantEditorData | null> {
  // groq-global-scoped: by-id read after the tenancy guard has admitted the id.
  const query = groq`*[_type == "socialPostVariant" && _id == $variantId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{ "variant": @${VARIANT_PROJECTION}, "post": select(post->conference._ref == conference._ref => post->${POST_INPUTS_PROJECTION}) }`
  const row = await clientWrite.fetch<{
    variant: RawVariant
    post: RawPostInputs | null
  } | null>(query, { variantId })
  if (!row) return null
  return {
    variant: normalizeVariant(row.variant),
    post: normalizePostInputs(row.post),
  }
}

/**
 * The post's attachments and default time, for validating a save — plus the
 * post's revision, so a save that follows the default time can be
 * compare-and-set against the post it read.
 */
export async function getSocialPostEditorInputs(
  postId: string,
  conferenceId: string,
): Promise<SocialVariantEditorData['post'] & { rev: string | null }> {
  const query = groq`*[_type == "socialPost" && _id == $postId && conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]${POST_INPUTS_PROJECTION}`
  const row = await clientWrite.fetch<RawPostInputs | null>(query, {
    postId,
    conferenceId,
  })
  return { ...normalizePostInputs(row), rev: row?._rev ?? null }
}

export interface SocialVariantContent {
  body: string
  link: string | null
  attachments: SocialVariantAttachment[]
  /** ISO datetime or null (no time yet). */
  scheduledAt: string | null
  usesCustomTime: boolean
}

/**
 * Save the editor's fields. ALWAYS compare-and-set on the revision the
 * editor loaded: a cron claim landing in between wins, and the organizer is
 * told to reload rather than having their edit silently applied to a
 * variant that is already going out. Status is never touched here.
 *
 * A save that FOLLOWS the post's default time also compare-and-sets the
 * post (`followsPost`): the default-time cascade skips custom-timed
 * variants when it reads them, so a cascade landing between our read of the
 * default and this write would leave the variant on the OLD default. Both
 * writers bump and check the post's revision, so one of them conflicts.
 */
export async function updateSocialVariantContent(
  variantId: string,
  content: SocialVariantContent,
  options: {
    ifRevision: string
    followsPost?: { id: string; rev: string }
    /**
     * The Marketing Task the variant belongs to: its target page rides
     * along, compare-and-set on the revision the Task editor loaded.
     */
    task?: { id: string; rev: string; targetPage: string }
    /**
     * The Marketing Task whose copy this save rewrites (spec §3.1): the flag
     * is what tells a later plan copy that an organizer touched the text,
     * rather than guessing from the Template skeleton.
     */
    copyEditedTaskId?: string
  },
): Promise<boolean> {
  const now = getCurrentDateTime()
  const tx = clientWrite.transaction().patch(variantId, (p) =>
    p.ifRevisionId(options.ifRevision).set({
      body: content.body,
      link: content.link,
      attachments: content.attachments.map((a) => ({
        _key: randomUUID(),
        _type: 'socialPostVariantAttachment',
        source: a.source,
        ...(a.crop ? { crop: a.crop } : {}),
        ...(a.altOverride !== null ? { altOverride: a.altOverride } : {}),
      })),
      scheduledAt: content.scheduledAt,
      usesCustomTime: content.usesCustomTime,
      updatedAt: now,
    }),
  )
  if (options.followsPost) {
    const { id, rev } = options.followsPost
    tx.patch(id, (p) => p.ifRevisionId(rev).set({ updatedAt: now }))
  }
  const copyEdited = options.copyEditedTaskId
  if (options.task) {
    const { id, rev, targetPage } = options.task
    tx.patch(id, (p) =>
      p.ifRevisionId(rev).set({
        targetPage,
        ...(copyEdited === id ? { copyEdited: true } : {}),
        updatedAt: now,
      }),
    )
  }
  try {
    await tx.commit()
  } catch (error) {
    if (isRevisionConflict(error)) return false
    throw error
  }
  // A Task edited from the posts table, where the editor holds no Task
  // revision: the flag is set on its own afterwards, and never unset. It is
  // advisory (it only tells a later plan copy whose words these are), so a
  // Task deleted in the meantime must not turn a saved variant into a
  // reported conflict.
  if (copyEdited && copyEdited !== options.task?.id) {
    try {
      await clientWrite
        .patch(copyEdited)
        .set({ copyEdited: true, updatedAt: now })
        .commit()
    } catch (error) {
      console.error(`Could not record the copy edit on ${copyEdited}`, error)
    }
  }
  return true
}

export interface AddSocialPostAttachmentInput {
  assetId: string
  alt: string
  hotspot: { x: number; y: number; width: number; height: number } | null
  crop: { top: number; bottom: number; left: number; right: number } | null
}

/**
 * Append an image (an upload, a gallery pick, a share-card raster — all are
 * asset references by the time they get here) to the post's attachments.
 * The patch is query-scoped to the conference so it can never land on a
 * post the guard did not admit.
 */
export type AddSocialPostAttachmentResult =
  { key: string } | { refused: 'foreign-asset' | 'post-gone' }

/**
 * Asset ids are dataset-wide and every image is public on the CDN, so this
 * is not a confidentiality gate. It is a tenancy tidiness one: an asset
 * that only OTHER conferences' documents reference is refused, while a
 * fresh upload (no references yet) or one of our own passes.
 */
async function assetBelongsElsewhere(
  assetId: string,
  conferenceId: string,
): Promise<boolean> {
  // groq-global: the cross-tenant reference count is the point — it asks
  // whether ANY tenant owns the asset; the scoped count says whether we do.
  const query = groq`{ "any": count(*[references($assetId)]), "ours": count(*[references($assetId) && conference._ref == $conferenceId]) }`
  const counts = await clientWrite.fetch<{ any: number; ours: number }>(query, {
    assetId,
    conferenceId,
  })
  return (counts?.any ?? 0) > 0 && (counts?.ours ?? 0) === 0
}

export async function addSocialPostAttachment(
  postId: string,
  conferenceId: string,
  input: AddSocialPostAttachmentInput,
): Promise<AddSocialPostAttachmentResult> {
  if (await assetBelongsElsewhere(input.assetId, conferenceId)) {
    return { refused: 'foreign-asset' }
  }
  const key = randomUUID()
  const result = await clientWrite
    .patch({
      query:
        '*[_type == "socialPost" && _id == $postId && conference._ref == $conferenceId]',
      params: { postId, conferenceId },
    })
    .setIfMissing({ attachments: [] })
    .append('attachments', [
      {
        _key: key,
        _type: 'socialPostAttachment',
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: input.assetId },
          ...(input.hotspot
            ? { hotspot: { _type: 'sanity.imageHotspot', ...input.hotspot } }
            : {}),
          ...(input.crop
            ? { crop: { _type: 'sanity.imageCrop', ...input.crop } }
            : {}),
        },
        alt: input.alt,
      },
    ])
    .set({ updatedAt: getCurrentDateTime() })
    .commit({ returnDocuments: false })
  // A query patch that matched nothing commits fine and changes nothing:
  // the post was deleted (or moved) after the guard ran. Say so rather than
  // hand back a key that was never stored.
  if (result.results.length === 0) return { refused: 'post-gone' }
  return { key }
}

export type { VariantTransition }

/**
 * Fill an empty post and select its render on the Task's variant atomically.
 * Both revisions protect the empty check and the variant against concurrent
 * editor/publisher changes. A conflict is retryable by the studio caller.
 * The asset has already been bound to and saved on its tenant's render Task.
 */
export async function handoffStudioAttachment(
  variantId: string,
  conferenceId: string,
  input: { assetId: string; alt: string },
): Promise<
  'attached' | 'occupied' | 'unavailable' | { issues: ValidationIssue[] }
> {
  const variant = await scopedFetch<{
    _id: string
    _rev: string
    postId: string
    status: string
    body: string
  } | null>(
    clientReadUncached,
    { conferenceId },
    '*[_type == "socialPostVariant" && _id == $variantId][0]{_id, _rev, "postId": post._ref, status, body}',
    { variantId },
    { cache: 'no-store' },
  )
  if (!variant) return 'unavailable'
  const post = await scopedFetch<{
    _id: string
    _rev: string
    count: number
  } | null>(
    clientReadUncached,
    { conferenceId },
    '*[_type == "socialPost" && _id == $postId][0]{_id, _rev, "count": count(coalesce(attachments, []))}',
    { postId: variant.postId },
    { cache: 'no-store' },
  )
  if (!post) return 'unavailable'
  if (post.count > 0) return 'occupied'
  if (variant.status === 'publishing' || variant.status === 'published')
    return 'unavailable'
  // Task-owned queued posts retain the editor's scheduling rule. Drafts may
  // still carry skeletons; a refusal leaves this render's receipt retryable.
  if (variant.status === 'scheduled') {
    const issues = placeholderIssues({
      text: variant.body,
      media: [{ alt: input.alt }],
    })
    if (issues.length > 0) return { issues }
  }
  const key = randomUUID()
  const now = getCurrentDateTime()
  await clientWrite
    .transaction()
    .patch(post._id, (p) =>
      p.ifRevisionId(post._rev).set({
        attachments: [
          {
            _key: key,
            _type: 'socialPostAttachment',
            alt: input.alt,
            image: {
              _type: 'image',
              asset: { _type: 'reference', _ref: input.assetId },
            },
          },
        ],
        updatedAt: now,
      }),
    )
    .patch(variant._id, (p) =>
      p
        .ifRevisionId(variant._rev)
        .setIfMissing({ attachments: [] })
        .append('attachments', [
          {
            _key: randomUUID(),
            _type: 'socialPostVariantAttachment',
            source: key,
          },
        ])
        .set({ updatedAt: now }),
    )
    .commit()
  return 'attached'
}
