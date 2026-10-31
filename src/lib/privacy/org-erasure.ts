/**
 * The admin Privacy page's erasure (#1045, #1310): one organization handles
 * one person's erasure request, by email.
 *
 * NOT A SECOND ERASURE. Everything that touches a speaker goes through
 * `eraseSpeakerInPlace` (the core `pnpm erase-speaker` runs) and everything
 * that touches a sponsor send record through `eraseSponsorContactSendRecords`
 * (the core of `pnpm erase-sponsor-contact`). What this module adds is the
 * ORGANIZATION BOUNDARY around them, because the CLI is the platform operator
 * acting for the person everywhere and the page is one tenant:
 *
 *  - A speaker document is shared across organizations. It is erased in full
 *    only when the speaker is EXCLUSIVE to this organization — the same
 *    `requireSpeakerInCurrentOrg(id, { requireExclusive: true })` guard a
 *    merge must pass — AND no document the erasure would touch belongs to
 *    another organization. Otherwise the speaker is left exactly as it is, and
 *    the preview says so: the other organization (or the operator, with the
 *    CLI) handles it. There is no partial anonymisation of a shared speaker.
 *  - Co-speaker invitations and workshop signups for the address are deleted
 *    at this organization's conferences only. This is the path for a person
 *    with no speaker document at all (#1045 gap 3).
 *  - Sponsor send records: this organization's only.
 *  - The shared WorkOS login (#1310) is deleted only when the person has no
 *    workshop signup at another organization's conference. Otherwise this
 *    organization's signups go and the login stays.
 *
 * The plan is ALWAYS computed here, server-side, from the email alone: the
 * erase step re-runs it and never takes a plan from the client.
 */

import { groq } from 'next-sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { normalizeEmail } from '@/lib/speaker/email'
import {
  eraseSpeakerInPlace,
  type EraseSpeakerOptions,
  type ErasurePlan,
  type ErasureVerification,
} from '@/lib/speaker/erasure'
import { eraseSponsorContactSendRecords } from '@/lib/sponsor-crm/contact-erasure'
import { workshopWorkOS } from '@/lib/workshop/central-sign-in/workos'
import { requireSpeakerInCurrentOrg } from '@/server/tenancy'

/** More matches than this for one address is not one person; use the CLI. */
const MAX_SPEAKERS = 5

export type ErasureKind =
  | 'speaker'
  | 'talks'
  | 'invitations'
  | 'sponsorContacts'
  | 'workshops'
  | 'login'
  | 'other'

export interface ErasureItem {
  id: string
  label: string
}

export interface ErasureGroup {
  kind: ErasureKind
  title: string
  /** What happens: deleted or anonymised (`erase`), or left as it is. */
  action: 'erase' | 'keep'
  /** Why, when it is kept or what "erase" means here. */
  note?: string
  items: ErasureItem[]
}

export interface OrgErasurePreview {
  email: string
  groups: ErasureGroup[]
  /** What stays after the erasure, and who has to handle it. */
  remains: string[]
  /** Non-empty: the erasure cannot run from the page. */
  refusals: string[]
  nothingFound: boolean
}

interface SpeakerCandidate {
  id: string
  name: string
  /** The plan the CLI would run; `null` when the speaker is kept. */
  plan: ErasurePlan | null
  keepReason: string | null
}

interface OrgErasurePlan {
  preview: OrgErasurePreview
  fullSpeakerIds: string[]
  workosIds: string[]
  deleteLogin: boolean
  workosError: string | null
}

interface Scope {
  email: string
  orgId: string
}

function stripVersion(id: string): string {
  return id.replace(/^(drafts\.|versions\.[^.]+\.)/, '')
}

async function findSpeakers({ email, orgId }: Scope) {
  return (
    (await clientReadUncached.fetch<{ _id: string; name?: string }[]>(
      // groq-global-scoped: speakers this org has standing over (membership ∨
      // participation, `SPEAKER_ORG_FILTER`) whose address matches.
      groq`*[_type == "speaker" && (lower(email) == $email || count(knownEmails[lower(@) == $email]) > 0) && ($orgId in coalesce(organizations, [])[]._ref || count(*[_type == "talk" && references(^._id) && conference->organization._ref == $orgId]) > 0)][0...$limit]{ _id, name }`,
      { email, orgId, limit: MAX_SPEAKERS + 1 },
      { cache: 'no-store' },
    )) ?? []
  )
}

/** Why a full erasure would reach outside this org, or null when it would not. */
async function sharedReason(
  speakerId: string,
  plan: ErasurePlan,
  orgId: string,
): Promise<string | null> {
  try {
    await requireSpeakerInCurrentOrg(speakerId, { requireExclusive: true })
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  const ids = [
    ...new Set(
      [...plan.documentPatches, ...plan.documentDeletes].map((d) =>
        stripVersion(d.id),
      ),
    ),
  ]
  if (ids.length === 0) return null
  const owners =
    (await clientReadUncached.fetch<
      { owner?: string | null; members?: (string | null)[] | null }[]
    >(
      // groq-global: an ownership probe over the ids the erasure would write,
      // to REFUSE a write into another organization's documents.
      groq`*[_id in $ids]{ "owner": coalesce(organization._ref, conference->organization._ref, sponsorForConference->conference->organization._ref, proposal->conference->organization._ref), "members": organizations[]._ref }`,
      { ids },
      { cache: 'no-store' },
    )) ?? []
  const foreign = owners.filter(
    (o) =>
      (o.owner && o.owner !== orgId) ||
      (o.members ?? []).some((m) => m && m !== orgId),
  ).length
  return foreign > 0
    ? `Erasing this speaker would change ${foreign} document(s) that belong to another organization.`
    : null
}

async function workosUserIds(email: string): Promise<string[]> {
  const page = await workshopWorkOS().userManagement.listUsers({ email })
  return page.data.map((user) => user.id)
}

async function orgRecords({ email, orgId }: Scope, workosIds: string[]) {
  const params = { email, orgId, workosIds }
  const count = async (query: string) =>
    (await clientReadUncached.fetch<number>(query, params, {
      cache: 'no-store',
    })) ?? 0
  const [mine, foreignInvitations, foreignSignups, foreignSpeakers] =
    await Promise.all([
      clientReadUncached.fetch<{
        invitations: ErasureItem[]
        signups: (ErasureItem & { workosId?: string | null })[]
      }>(
        groq`{
        "invitations": *[_type == "coSpeakerInvitation" && lower(invitedEmail) == $email && conference->organization._ref == $orgId]{
          "id": _id, "label": coalesce(proposal->title, "Invitation") + " (" + coalesce(status, "unknown") + ")"
        },
        "signups": *[_type == "workshopSignup" && (lower(userEmail) == $email || userWorkOSId in $workosIds) && conference->organization._ref == $orgId]{
          "id": _id, "label": coalesce(workshop->title, "Workshop") + " (" + coalesce(conference->title, "") + ")", "workosId": userWorkOSId
        }
      }`,
        params,
        { cache: 'no-store' },
      ),
      count(
        // groq-global: COUNTS ONLY of this address at OTHER organizations, so
        // the preview can say what remains. Nothing is returned or written.
        groq`count(*[_type == "coSpeakerInvitation" && lower(invitedEmail) == $email && coalesce(conference->organization._ref, "") != $orgId])`,
      ),
      count(
        // groq-global: other organizations' signups; decides whether the
        // SHARED workshop login may be deleted (#1310).
        groq`count(*[_type == "workshopSignup" && (lower(userEmail) == $email || userWorkOSId in $workosIds) && coalesce(conference->organization._ref, "") != $orgId])`,
      ),
      count(
        // groq-global: every speaker profile with this address, counted only;
        // the caller subtracts the ones this org has standing over.
        groq`count(*[_type == "speaker" && (lower(email) == $email || count(knownEmails[lower(@) == $email]) > 0)])`,
      ),
    ])
  return {
    ...mine,
    foreignInvitations,
    foreignSignups,
    speakersWithAddress: foreignSpeakers,
  }
}

async function talksOf(speakerIds: string[], orgId: string) {
  if (speakerIds.length === 0) return []
  return (
    (await clientReadUncached.fetch<{ _id: string; title?: string }[]>(
      groq`*[_type == "talk" && count((speakers[]._ref)[@ in $speakerIds]) > 0 && conference->organization._ref == $orgId]{ _id, title }`,
      { speakerIds, orgId },
      { cache: 'no-store' },
    )) ?? []
  )
}

const KIND_OF_TYPE: Record<string, ErasureKind> = {
  coSpeakerInvitation: 'invitations',
  sponsorActivity: 'sponsorContacts',
  talk: 'talks',
}

/** Compute what an erasure of `email` at `orgId` would do. Writes nothing. */
export async function planOrgErasure(
  rawEmail: string,
  orgId: string,
): Promise<OrgErasurePlan> {
  const email = normalizeEmail(rawEmail)
  const scope = { email, orgId }
  const refusals: string[] = []
  const remains: string[] = []

  let workosIds: string[] = []
  let workosError: string | null = null
  try {
    workosIds = await workosUserIds(email)
  } catch (error) {
    workosError = error instanceof Error ? error.message : String(error)
  }

  const found = await findSpeakers(scope)
  if (found.length > MAX_SPEAKERS) {
    refusals.push(
      `More than ${MAX_SPEAKERS} speaker profiles match this address. Ask the platform operator to use the CLI.`,
    )
  }
  const speakers: SpeakerCandidate[] = []
  for (const s of found.slice(0, MAX_SPEAKERS)) {
    const dry = await eraseSpeakerInPlace({
      speakerId: s._id,
      actor: 'privacy-page-preview',
      dryRun: true,
    })
    if (dry.err || !dry.plan) {
      refusals.push(
        `Speaker ${s._id}: ${dry.err?.message ?? 'could not plan the erasure'}`,
      )
      continue
    }
    const shared = await sharedReason(s._id, dry.plan, orgId)
    if (!shared) {
      for (const r of dry.plan.refusals) refusals.push(`Speaker ${s._id}: ${r}`)
      if (dry.plan.sharedByLinkOnly.length > 0) {
        refusals.push(
          `Speaker ${s._id}: a social handle of theirs is also listed by another speaker. The platform operator must decide this with the CLI (--accept-shared-handles).`,
        )
      }
    }
    speakers.push({
      id: s._id,
      name: s.name ?? s._id,
      plan: shared ? null : dry.plan,
      keepReason: shared,
    })
  }

  const records = await orgRecords(scope, workosIds)
  const talks = await talksOf(
    speakers.map((s) => s.id),
    orgId,
  )
  const sponsor = await eraseSponsorContactSendRecords({
    emails: [email],
    actor: 'privacy-page-preview',
    dryRun: true,
    organizationId: orgId,
  })
  if (sponsor.err) refusals.push(`Sponsor contacts: ${sponsor.err.message}`)

  const full = speakers.filter((s) => s.plan)
  const kept = speakers.filter((s) => !s.plan)
  const groups: ErasureGroup[] = []

  if (speakers.length > 0) {
    groups.push({
      kind: 'speaker',
      title: 'Speaker profile',
      action: kept.length > 0 ? 'keep' : 'erase',
      note:
        kept.length > 0
          ? 'Shared with another organization, so it is NOT erased here.'
          : 'Anonymised in place: name becomes "Deleted speaker", email, photo, bio, links and logins are removed.',
      items: speakers.map((s) => ({
        id: s.id,
        label: s.keepReason ? `${s.name} — kept: ${s.keepReason}` : s.name,
      })),
    })
  }

  // The dependent writes of every full erasure, grouped by kind.
  const byKind = new Map<ErasureKind, ErasureItem[]>()
  for (const s of full) {
    for (const op of [...s.plan!.documentPatches, ...s.plan!.documentDeletes]) {
      const kind = KIND_OF_TYPE[op.type] ?? 'other'
      byKind.set(kind, [
        ...(byKind.get(kind) ?? []),
        { id: op.id, label: `${op.type}: ${op.reason}` },
      ])
    }
  }

  if (talks.length > 0) {
    groups.push({
      kind: 'talks',
      title: 'Talks and co-speaker links',
      action: kept.length > 0 ? 'keep' : 'erase',
      note:
        kept.length > 0
          ? 'Kept: they point at the shared speaker profile, which stays.'
          : 'The talks stay for the other speakers and the programme; the person is shown as "Deleted speaker".',
      items: [
        ...talks.map((t) => ({ id: t._id, label: t.title ?? t._id })),
        ...(byKind.get('talks') ?? []),
      ],
    })
  }

  const invitationIds = new Set(records.invitations.map((i) => i.id))
  const invitations = [
    ...records.invitations,
    ...(byKind.get('invitations') ?? []).filter(
      (i) => !invitationIds.has(stripVersion(i.id)),
    ),
  ]
  if (invitations.length > 0) {
    groups.push({
      kind: 'invitations',
      title: 'Co-speaker invitations',
      action: 'erase',
      note: 'Deleted.',
      items: invitations,
    })
  }

  const sponsorItems = full.length
    ? (byKind.get('sponsorContacts') ?? [])
    : sponsor.patches.map((p) => ({ id: p.id, label: p.reason }))
  if (sponsorItems.length > 0) {
    groups.push({
      kind: 'sponsorContacts',
      title: 'Sponsor contacts (sent emails)',
      action: 'erase',
      note: 'Name and address replaced by a marker; the business record stays.',
      items: sponsorItems,
    })
  }

  if (records.signups.length > 0) {
    groups.push({
      kind: 'workshops',
      title: 'Workshop signups',
      action: 'erase',
      note: 'Deleted. The seat is freed; a waitlist is not promoted automatically, so tell the workshop host.',
      items: records.signups.map(({ id, label }) => ({ id, label })),
    })
  }

  const allWorkosIds = [
    ...new Set([
      ...workosIds,
      ...records.signups
        .map((s) => s.workosId)
        .filter((id): id is string => !!id),
    ]),
  ]
  const deleteLogin =
    workosError === null &&
    records.foreignSignups === 0 &&
    allWorkosIds.length > 0
  if (workosError) {
    groups.push({
      kind: 'login',
      title: 'Workshop login (WorkOS)',
      action: 'keep',
      note: `Could not check WorkOS (${workosError}). The login is not deleted; try again later.`,
      items: [],
    })
  } else if (allWorkosIds.length > 0) {
    groups.push({
      kind: 'login',
      title: 'Workshop login (WorkOS)',
      action: deleteLogin ? 'erase' : 'keep',
      note: deleteLogin
        ? 'Deleted. The login is shared by every conference on the platform, and they have no workshop signups elsewhere.'
        : 'Kept: they also have workshop signups at another organization’s conference. Only this organization’s signups are deleted.',
      items: allWorkosIds.map((id) => ({ id, label: id })),
    })
  }

  const otherItems = byKind.get('other') ?? []
  if (otherItems.length > 0) {
    groups.push({
      kind: 'other',
      title: 'Other references',
      action: 'erase',
      note: 'Patched or deleted as listed.',
      items: otherItems,
    })
  }

  if (kept.length > 0) {
    remains.push(
      'The speaker profile, and the talks that point at it, stay: the person also has data at another organization. That organization, or the platform operator with `pnpm erase-speaker`, has to erase the profile.',
    )
  }
  const foreignSpeakers = records.speakersWithAddress - found.length
  if (foreignSpeakers > 0) {
    remains.push(
      `${foreignSpeakers} speaker profile(s) with this address belong only to other organizations. They are not shown or touched here.`,
    )
  }
  if (records.foreignInvitations > 0) {
    remains.push(
      `${records.foreignInvitations} co-speaker invitation(s) at other organizations’ conferences stay.`,
    )
  }
  if (sponsor.foreign > 0) {
    remains.push(
      `${sponsor.foreign} sponsor email record(s) of other organizations stay.`,
    )
  }
  if (records.foreignSignups > 0) {
    remains.push(
      `${records.foreignSignups} workshop signup(s) at other organizations’ conferences stay, and so does the shared workshop login.`,
    )
  }
  remains.push(
    'Never erased by this tool: free text (abstracts, review comments, message bodies), badges, paid travel records, Sanity revision history. See the runbook.',
  )

  return {
    preview: {
      email,
      groups,
      remains,
      refusals,
      nothingFound: groups.length === 0,
    },
    fullSpeakerIds: full.map((s) => s.id),
    workosIds: allWorkosIds,
    deleteLogin,
    workosError,
  }
}

export interface OrgErasureResult {
  clean: boolean
  /** The verification lines, as the CLI prints them. */
  verification: string[]
  /** Counts for the audit line and the page. */
  counts: Record<string, number>
}

/** Thrown when a write lost a revision race: preview again and retry. */
export class OrgErasureConflictError extends Error {}

function isConflict(error: Error): boolean {
  const status = (error as { statusCode?: number }).statusCode
  return status === 409 || /revision/i.test(error.message)
}

function verificationLine(id: string, v: ErasureVerification | null): string {
  if (!v) return `Speaker ${id}: speaker document not found.`
  return `Speaker ${id}: ${v.clean ? 'CLEAN' : `RESIDUAL DATA FOUND ${JSON.stringify(v.residual)}`}`
}

/**
 * Run the erasure. Re-plans first: what runs is what the server finds now,
 * never what a client was shown.
 */
export async function runOrgErasure(
  rawEmail: string,
  orgId: string,
  actor: string,
  revalidate?: EraseSpeakerOptions['revalidate'],
): Promise<OrgErasureResult> {
  const plan = await planOrgErasure(rawEmail, orgId)
  const { email, refusals } = plan.preview
  if (refusals.length > 0) {
    throw new Error(`Refused: ${refusals.join('; ')}`)
  }

  const verification: string[] = []
  let clean = true
  const counts: Record<string, number> = {
    speakers: 0,
    invitations: 0,
    signups: 0,
    sponsorRecords: 0,
    logins: 0,
  }

  for (const speakerId of plan.fullSpeakerIds) {
    const result = await eraseSpeakerInPlace({
      speakerId,
      actor,
      dryRun: false,
      revalidate,
    })
    if (result.err) {
      if (isConflict(result.err)) {
        throw new OrgErasureConflictError(result.err.message)
      }
      throw result.err
    }
    counts.speakers++
    verification.push(verificationLine(speakerId, result.verification))
    if (!result.verification?.clean) clean = false
  }

  // Whatever is still here after the speaker erasures: invitations to the
  // address (also those with no speaker document) and workshop signups.
  const records = await orgRecords({ email, orgId }, plan.workosIds)
  const deletes = [...records.invitations, ...records.signups]
  if (deletes.length > 0) {
    const tx = clientWrite.transaction()
    for (const doc of deletes) tx.delete(doc.id)
    try {
      await tx.commit()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      if (isConflict(err)) throw new OrgErasureConflictError(err.message)
      throw err
    }
    counts.invitations = records.invitations.length
    counts.signups = records.signups.length
  }

  const sponsor = await eraseSponsorContactSendRecords({
    emails: [email],
    actor,
    organizationId: orgId,
  })
  if (sponsor.err) {
    if (isConflict(sponsor.err)) {
      throw new OrgErasureConflictError(sponsor.err.message)
    }
    throw sponsor.err
  }
  counts.sponsorRecords = sponsor.patches.length
  verification.push(
    `Sponsor contacts: ${sponsor.residual === 0 ? 'CLEAN' : `RESIDUAL DATA FOUND (${sponsor.residual ?? 'unknown'})`}`,
  )
  if (sponsor.residual !== 0) clean = false

  if (plan.deleteLogin) {
    for (const id of plan.workosIds) {
      try {
        await workshopWorkOS().userManagement.deleteUser(id)
      } catch (error) {
        // Already gone is what we wanted.
        if ((error as { status?: number }).status !== 404) throw error
      }
      counts.logins++
    }
  }

  const after = await orgRecords({ email, orgId }, plan.workosIds)
  const left = after.invitations.length + after.signups.length
  verification.push(
    `Invitations and workshop signups at this organization: ${left === 0 ? 'CLEAN' : `RESIDUAL DATA FOUND (${left})`}`,
  )
  if (left > 0) clean = false
  if (plan.workosError) {
    verification.push(
      'Workshop login: NOT CHECKED (WorkOS could not be reached)',
    )
    clean = false
  } else if (plan.deleteLogin) {
    const still = await workosUserIds(email)
    verification.push(
      `Workshop login: ${still.length === 0 ? 'CLEAN' : `RESIDUAL DATA FOUND (${still.length})`}`,
    )
    if (still.length > 0) clean = false
  }

  // Ids and counts only, like the speaker-erasure audit line: no address.
  console.info('[privacy-erasure] organizer erasure', {
    actor,
    orgId,
    clean,
    ...counts,
  })

  return { clean, verification, counts }
}
