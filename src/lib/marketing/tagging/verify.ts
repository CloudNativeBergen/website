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
import type { MentionRecord } from './body'
import {
  approvalCheck,
  approvalHandlesToResolve,
  fixTagIssue,
  occurrenceOwnersWithRoster,
  replacementText,
  handlesToResolve,
  mentionTokens,
  saveMentions,
  type TagCheck,
  type TagIssue,
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
  /** Re-runs the same check on another body with the inputs gathered here. */
  recheck: (body: string) => TagCheck
}> {
  const mentions = await getVariantMentionRecords(
    input.variantId,
    input.conferenceId,
  )
  if (
    mentionTokens(input.body).length === 0 &&
    !mentions.some((m) => m.status === 'tagged')
  )
    return {
      check: { issues: [], warnings: [] },
      people: [],
      mentions,
      recheck: () => ({ issues: [], warnings: [] }),
    }
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
  const recheck = (body: string) =>
    approvalCheck({ body, mentions, people, resolutions, ownAccount })
  return { check: recheck(input.body), people, mentions, recheck }
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
  const { check, people, mentions, recheck } = await approvalWithInputs(input)
  let body = input.body
  const untagged: string[] = []
  let removed = 0
  // Fix, then CHECK AGAIN until the body passes (round 5, T1): one issue per
  // handle, and the one-click fix of a shared handle takes one occurrence,
  // so a single pass can leave a refused "@team.dev" in the text to copy.
  // No fixed pass limit (final round, T1): every fix turns a tag into text,
  // so there are at most as many useful passes as tags. Anything still
  // refused after that FAILS CLOSED — the view offers nothing to copy.
  // Per occurrence, whose tag is it (final round, T4)? An opted-out speaker
  // who merely LISTS a shared handle does not own the occurrence the check
  // binds to someone else: that one is left as it is, never given her name.
  const byId = new Map(people.map((p) => [p.speakerId, p]))
  const optedOutOwned = (text: string, handle: string) => {
    const owners = occurrenceOwnersWithRoster(text, people, mentions).get(
      handle,
    )
    const tokens = mentionTokens(text).filter((t) => t.handle === handle)
    return tokens.flatMap((t, k) => {
      const id = owners?.[Math.min(k, owners.length - 1)]
      const person = id ? byId.get(id) : undefined
      return person?.optedOut ? [{ ...t, person }] : []
    })
  }
  const refused = (issues: readonly TagIssue[]) =>
    issues.filter(
      (i) =>
        i.code !== 'plain-too-long' &&
        !(i.code === 'opted-out' && optedOutOwned(body, i.handle).length === 0),
    )
  let issues = check.issues
  const maxPasses = mentionTokens(body).length + 1
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false
    for (const issue of issues) {
      if (issue.code === 'plain-too-long') continue
      if (issue.code === 'opted-out') {
        // Every occurrence an opted-out speaker OWNS, each with that
        // speaker's own replacement; occurrences owned by others stay.
        const owned = optedOutOwned(body, issue.handle)
        for (const t of [...owned].reverse())
          body = `${body.slice(0, t.start)}${replacementText({ name: t.person.name })}${body.slice(t.end)}`
        for (const t of owned)
          if (!untagged.includes(t.person.name)) untagged.push(t.person.name)
        if (owned.length > 0) changed = true
        continue
      }
      // Someone no longer a speaker here — erased, deleted or taken off the
      // programme. The name on the record may be an erased person's real
      // name, so it is never shown or copied: a neutral word stands in.
      const gone = issue.code === 'not-a-speaker'
      const fixed = fixTagIssue(
        body,
        // A name that holds a handle keeps it as text (round 2, T3).
        { ...issue, name: replacementText({ name: issue.name, gone }) },
        people,
        mentions,
      )
      if (fixed === body) continue
      body = fixed
      changed = true
      if (gone) removed++
      else if (!untagged.includes(issue.name)) untagged.push(issue.name)
    }
    if (!changed) break
    issues = recheck(body).issues
  }
  if (refused(recheck(body).issues).length > 0) {
    throw new Error('a refused tag could not be removed from the manual copy')
  }
  return body === input.body ? null : { body, untagged, removed }
}

/**
 * The editor read with `manualBody` for a Bluesky variant an organizer posts
 * by hand. Bluesky being unreachable is a warning inside the check and keeps
 * the tags; a check that cannot run at all is `{ unavailable: true }`.
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
    // Always a checked body, even when nothing changed: the view announces
    // completion from it, and "passed as written" must not read as "never
    // checked" (round 5, T2).
    return {
      ...data,
      manualBody: manualBody ?? { body: v.body, untagged: [], removed: 0 },
    }
  } catch (error) {
    // FAIL CLOSED (review T1): the stored body may tag a speaker who opted
    // out since approval, so it must not be offered as checked.
    console.error(`[tagging] manual view check failed for ${v._id}:`, error)
    return { ...data, manualBody: { unavailable: true } }
  }
}
