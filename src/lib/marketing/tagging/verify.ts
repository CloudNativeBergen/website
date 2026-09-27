/**
 * The save and approval checks (tagging spec §4.4) with their inputs
 * gathered: the variant's recorded mentions, this conference's people and
 * the handle resolutions. The decisions themselves are the pure functions
 * in `./checks`. SERVER-ONLY: reads Sanity and asks Bluesky.
 *
 * The caller has proven `variantId` belongs to `conferenceId` (guard before
 * fetch), and calls these only for a Bluesky variant.
 */

import type { ManualBody, SocialVariantEditorData } from '@/lib/social/types'
import { GONE_SPEAKER_TEXT } from './publish'
import type { MentionRecord } from './body'
import {
  approvalCheck,
  approvalHandlesToResolve,
  fixTagIssue,
  handlesToResolve,
  mentionTokens,
  saveMentions,
  type TagCheck,
  type TaggablePerson,
} from './checks'
import { resolveBlueskyHandle, type HandleResolution } from './resolve'
import { ownBlueskyAccount } from './own-account'
import { getConferenceTaggablePeople, getVariantMentionRecords } from './sanity'

/**
 * Each handle asked once, all at once; `known` answers are not asked again
 * (a scheduled save's approval check reuses the save's lookups).
 */
async function resolveHandles(
  handles: readonly string[],
  known: ReadonlyMap<string, HandleResolution> = new Map(),
): Promise<Map<string, HandleResolution>> {
  const out = new Map(known)
  const wanted = [...new Set(handles)].filter((h) => !out.has(h))
  const answers = await Promise.all(
    wanted.map((h) =>
      resolveBlueskyHandle(h).catch((): HandleResolution => ({
        kind: 'unreachable',
      })),
    ),
  )
  wanted.forEach((h, i) => out.set(h, answers[i]))
  return out
}

function merged(a: TagCheck, b: TagCheck): TagCheck {
  const key = (x: { code: string; mentionKey: string | null }) =>
    `${x.code}:${x.mentionKey}`
  const uniq = <T extends { code: string; mentionKey: string | null }>(
    xs: T[],
  ) => [...new Map(xs.map((x) => [key(x), x])).values()]
  return {
    issues: uniq([...a.issues, ...b.issues]),
    warnings: uniq([...a.warnings, ...b.warnings]),
  }
}

/**
 * A save of a Bluesky body: `mentions[]` rebuilt from it (§4.3) and the save
 * check; for a variant that is already scheduled, the approval check too
 * (§4.4: saving a scheduled variant is one of the three refusal paths).
 */
export async function checkTagsOnSave(input: {
  conferenceId: string
  variantId: string
  body: string
  scheduled: boolean
}): Promise<TagCheck & { mentions: MentionRecord[] }> {
  const previous = await getVariantMentionRecords(
    input.variantId,
    input.conferenceId,
  )
  // No `@` token, no tag: nothing to match, so no read of the roster —
  // unless a note from generation must be checked against it.
  const hasTokens = mentionTokens(input.body).length > 0
  const hasNotes = previous.some((m) => m.status === 'unresolved')
  const [people, ownAccount]: [TaggablePerson[], string | null] =
    await Promise.all([
      hasTokens || hasNotes
        ? getConferenceTaggablePeople(input.conferenceId)
        : [],
      hasTokens ? ownBlueskyAccount(input.conferenceId) : null,
    ])
  let resolutions = await resolveHandles(
    handlesToResolve({ body: input.body, people, previous, ownAccount }),
  )
  const saved = saveMentions({
    body: input.body,
    people,
    previous,
    resolutions,
    ownAccount,
  })
  if (!input.scheduled || saved.issues.length > 0) return saved
  resolutions = await resolveHandles(
    approvalHandlesToResolve({
      body: input.body,
      mentions: saved.mentions,
      people,
      ownAccount,
    }),
    resolutions,
  )
  const approval = approvalCheck({
    body: input.body,
    mentions: saved.mentions,
    people,
    resolutions,
    ownAccount,
  })
  return { mentions: saved.mentions, ...merged(saved, approval) }
}

/** The approval check with the inputs it decided from. */
async function approvalWithInputs(input: {
  conferenceId: string
  variantId: string
  body: string
}): Promise<{
  check: TagCheck
  people: TaggablePerson[]
  mentions: MentionRecord[]
}> {
  const mentions = await getVariantMentionRecords(
    input.variantId,
    input.conferenceId,
  )
  if (
    mentionTokens(input.body).length === 0 &&
    !mentions.some((m) => m.status === 'tagged')
  )
    return { check: { issues: [], warnings: [] }, people: [], mentions }
  const [people, ownAccount] = await Promise.all([
    getConferenceTaggablePeople(input.conferenceId),
    ownBlueskyAccount(input.conferenceId),
  ])
  const resolutions = await resolveHandles(
    approvalHandlesToResolve({
      body: input.body,
      mentions,
      people,
      ownAccount,
    }),
  )
  const check = approvalCheck({
    body: input.body,
    mentions,
    people,
    resolutions,
    ownAccount,
  })
  return { check, people, mentions }
}

/**
 * Approving the Task or scheduling the variant: the approval check (§4.4)
 * on what is stored.
 */
export async function checkTagsForApproval(input: {
  conferenceId: string
  variantId: string
  body: string
}): Promise<TagCheck> {
  return (await approvalWithInputs(input)).check
}

/**
 * The manual post view (§4.4, Publish): a Bluesky variant handed to an
 * organizer to post by hand never reaches the engine's check, perhaps for
 * days. The view runs the approval check when it opens and shows the body
 * that passes it — each refused tag replaced by the one-click fix (the plain
 * name). Null: the stored body passes as it is. A body that fails for its
 * length alone has no tag to fix and is shown as stored.
 */
export async function manualPostBody(input: {
  conferenceId: string
  variantId: string
  body: string
}): Promise<ManualBody | null> {
  const { check, people, mentions } = await approvalWithInputs(input)
  let body = input.body
  const untagged: string[] = []
  let removed = 0
  for (const issue of check.issues) {
    if (issue.code === 'plain-too-long') continue
    // Someone no longer a speaker here — erased, deleted or taken off the
    // programme. The name on the record may be an erased person's real name,
    // so it is never shown or copied: a neutral word stands in (GDPR).
    const gone = issue.code === 'not-a-speaker'
    const fixed = fixTagIssue(
      body,
      gone ? { ...issue, name: GONE_SPEAKER_TEXT } : issue,
      people,
      mentions,
    )
    if (fixed === body) continue
    body = fixed
    if (gone) removed++
    else if (!untagged.includes(issue.name)) untagged.push(issue.name)
  }
  return body === input.body ? null : { body, untagged, removed }
}

/**
 * The editor read with `manualBody` for a Bluesky variant an organizer posts
 * by hand. A failed check (Sanity, Bluesky) shows the stored body rather than
 * failing the view: the approval check already passed it once.
 */
export async function withManualBody<T extends SocialVariantEditorData>(
  data: T,
  conferenceId: string,
): Promise<T> {
  const v = data.variant
  if (
    v.platform !== 'bluesky' ||
    (v.status !== 'awaiting-manual' && v.status !== 'failed')
  )
    return data
  try {
    const manualBody = await manualPostBody({
      conferenceId,
      variantId: v._id,
      body: v.body,
    })
    return manualBody ? { ...data, manualBody } : data
  } catch (error) {
    console.error(`[tagging] manual view check failed for ${v._id}:`, error)
    return data
  }
}
