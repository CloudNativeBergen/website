/**
 * The save and approval checks (tagging spec §4.4) with their inputs
 * gathered: the variant's recorded mentions, this conference's people and
 * the handle resolutions. The decisions themselves are the pure functions
 * in `./checks`. SERVER-ONLY: reads Sanity and asks Bluesky.
 *
 * The caller has proven `variantId` belongs to `conferenceId` (guard before
 * fetch), and calls these only for a Bluesky variant.
 */

import type { MentionRecord } from './body'
import {
  approvalCheck,
  approvalHandlesToResolve,
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
  // No `@` token, no tag: nothing to match, so no read of the roster.
  const hasTokens = mentionTokens(input.body).length > 0
  const [people, ownAccount]: [TaggablePerson[], string | null] = hasTokens
    ? await Promise.all([
        getConferenceTaggablePeople(input.conferenceId),
        ownBlueskyAccount(input.conferenceId),
      ])
    : [[], null]
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

/**
 * Approving the Task or scheduling the variant: the approval check (§4.4)
 * on what is stored.
 */
export async function checkTagsForApproval(input: {
  conferenceId: string
  variantId: string
  body: string
}): Promise<TagCheck> {
  const mentions = await getVariantMentionRecords(
    input.variantId,
    input.conferenceId,
  )
  if (
    mentionTokens(input.body).length === 0 &&
    !mentions.some((m) => m.status === 'tagged')
  )
    return { issues: [], warnings: [] }
  const [people, ownAccount] = await Promise.all([
    getConferenceTaggablePeople(input.conferenceId),
    ownBlueskyAccount(input.conferenceId),
  ])
  const resolutions = await resolveHandles(
    approvalHandlesToResolve({ body: input.body, mentions, people }),
  )
  return approvalCheck({
    body: input.body,
    mentions,
    people,
    resolutions,
    ownAccount,
  })
}
