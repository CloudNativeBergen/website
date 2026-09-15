#!/usr/bin/env tsx

/**
 * ONE-TIME RECONCILIATION for speaker-ticket delivery markers.
 *
 * `talk.issuedSpeakerTickets[]` is the only thing that stops
 * `speaker.admin.sendTicketInvitations` from inviting a speaker twice. On a live
 * conference many speakers were invited BY HAND in the Checkin UI, so they carry
 * no marker at all — and the next sweep would send them a SECOND invitation.
 *
 * This script writes the missing markers for the speakers we can PROVE were
 * invited, so the sweep skips them.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CAN PROVE, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------------
 *
 * The speaker ticket type is invitation-gated, so a CLAIMED speaker ticket is
 * proof that an invitation was sent to that address. That is the whole evidence
 * base, and it is a one-way implication:
 *
 *   claimed speaker ticket  ⇒  was invited      (backfillable)
 *   invited                 ⇏  claimed          (invisible)
 *
 * A speaker who was invited by hand and has NOT yet claimed is NOT IDENTIFIABLE.
 * The provider interface (`src/lib/tickets/provider/types.ts`) exposes tickets,
 * orders, public ticket types, discounts, webhooks and `sendTicketInvitation` —
 * nothing anywhere lists who has been invited to an invitation-gated type. So
 * this script closes the provable set and no more: the unclaimed hand-invited
 * residue keeps its risk of a duplicate invitation, and the only remedies for it
 * are an organizer's own records or simply accepting a second invitation for
 * those people. This script does not guess at them, and neither should anything
 * built on top of it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WRITES INTO `emailedAt`
 * ---------------------------------------------------------------------------
 *
 * The RUN TIMESTAMP of this reconciliation — not a reconstructed send time.
 *
 * We did not send these invitations and we do not know when anyone did. Any
 * backdated value (the conference creation date, the ticket's own timestamp,
 * the speaker's confirmation date) would be a fabricated send time that later
 * reads as an audit record of an email this system never sent. The run time is
 * the one honest statement the field can carry: "as of this moment, this speaker
 * is known to hold their ticket and must not be invited again." The truth that
 * the invitation came from a human in the Checkin UI lives here, in the PR that
 * landed this, and in the run log — not in a falsified date.
 *
 * `emailedAt` is also load-bearing beyond the dedupe: `joinSpeakerTicketStatus`
 * reads it as `invitedAt`, so leaving it unset would report these speakers as
 * "not invited" on /admin/speakers. A run timestamp keeps that surface honest
 * too.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   # dry run — prints every planned write, changes nothing
 *   BACKFILL_CONFERENCE_ID=<id> NODE_OPTIONS=--conditions=react-server pnpm tsx \
 *     scripts/backfill-speaker-ticket-markers.ts
 *
 *   # commit
 *   BACKFILL_CONFERENCE_ID=<id> NODE_OPTIONS=--conditions=react-server pnpm tsx \
 *     scripts/backfill-speaker-ticket-markers.ts --apply
 *
 * `BACKFILL_CONFERENCE_ID` is MANDATORY. Run without it to get the candidate
 * list and a refusal. It is not a default worth having: measured against
 * production, "latest startDate" — the `migrations/042-*` heuristic — resolves
 * to the DEMO tenant, not the live conference.
 *
 * `--conditions=react-server` resolves the `server-only` marker to its empty
 * build so the ticketing barrel (which reaches the per-org secrets store) can be
 * imported outside a Server Component. Without it the import throws; see
 * `scripts/backfill-domain-verification.ts` for the alternative (import the leaf
 * modules), which is not available here because credential resolution is
 * exactly the part we must not reimplement.
 *
 * The run reads its environment through `src/lib/sanity/client.ts`, so it needs
 * `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`,
 * `SANITY_API_TOKEN_READ` and — for `--apply` — `SANITY_API_TOKEN_WRITE`. NOT
 * `SANITY_AUTH_TOKEN`, which is the Sanity CLI's variable and is what
 * `.github/workflows/run-migration.yml` sets; the clients here never read it and
 * fall back to the literal token `'invalid'`. That fails LOUDLY — the client
 * still sends `Authorization: Bearer invalid`, the API answers `401 Session not
 * found`, and the run exits 1 — so a wrong token name cannot produce a
 * clean-looking empty run. It also needs the ticketing credentials for the
 * conference's organization, the same ones the app resolves
 * (`TENANT_<SLUG>_CHECKIN_*` / `TENANT_SECRETS_JSON`, or the platform env for
 * the platform org).
 *
 * NOTE: it is a `scripts/` tool, so `.github/workflows/run-migration.yml` cannot
 * run it — that workflow only runs `migrations/<id>`. It is run by hand,
 * dry-run first.
 *
 * Idempotent: a speaker who already carries a marker is never touched, so a
 * second run after a committed one reports zero writes. The apply loop
 * RE-CHECKS each proposal's markers immediately before writing, so a marker the
 * live handler recorded after the plan was computed is never overwritten.
 *
 * KNOWN LIMIT — one operator at a time. Two concurrent `--apply` runs could both
 * pass that re-check and append duplicate `_key` entries. Nothing is destroyed
 * and this is a one-off tool, so it is not worth a lock; just do not run two.
 * ponytail: no locking, add one if this ever becomes a scheduled job.
 */

import { pathToFileURL } from 'node:url'
import { normalizeEmail } from '../src/lib/speaker/email'

export interface BackfillSpeaker {
  _id: string
  name?: string | null
  /** Display address. */
  email?: string | null
  /** Verified addresses collected across OAuth providers. */
  knownEmails?: string[] | null
}

export interface BackfillMarker {
  _key?: string
  speakerId?: string
  email?: string
}

export interface BackfillTalk {
  _id: string
  title?: string | null
  /** `null` entries are dangling references — GROQ dereferences them to null. */
  speakers?: (BackfillSpeaker | null)[] | null
  issuedSpeakerTickets?: BackfillMarker[] | null
}

export interface PlannedMarker {
  proposalId: string
  proposalTitle: string
  speakerId: string
  speakerName: string
  /** Normalized address written into the marker (display address when present). */
  email: string
  /** The normalized address that actually holds the claimed ticket. */
  matchedEmail: string
  /** Which field carried the matching address. */
  matchedVia: 'email' | 'knownEmails'
}

export interface BackfillPlan {
  planned: PlannedMarker[]
  /** Speakers that already carry a marker (by speaker id or by address). */
  alreadyMarked: number
  /** Speakers with no claimed speaker-category ticket — unprovable, skipped. */
  noClaimedTicket: number
  /** Duplicate speaker entries collapsed onto one address within a proposal. */
  duplicateInRun: number
  /** Dangling `speakers[]` references that dereferenced to null. */
  unresolvableSpeakers: number
}

/**
 * Decide which markers to write. PURE — no Sanity, no provider, no clock.
 *
 * `redeemedEmails` is the output of `redeemedSpeakerEmails` from
 * `@/lib/tickets/speakerStatus`: normalized addresses holding a ticket in the
 * SPEAKER category, selected there by the same rule issuance uses. An ordinary
 * ticket is therefore not in the set and is never proof of an invitation.
 *
 * The skip rules mirror `handleSpeakerTicket` exactly — speaker id OR any known
 * address already present in the markers, and one address per proposal per run —
 * so a marker this script declines to write is one the handler would have
 * skipped anyway.
 */
export function planSpeakerTicketBackfill(
  talks: BackfillTalk[],
  redeemedEmails: Set<string>,
): BackfillPlan {
  const plan: BackfillPlan = {
    planned: [],
    alreadyMarked: 0,
    noClaimedTicket: 0,
    duplicateInRun: 0,
    unresolvableSpeakers: 0,
  }

  for (const talk of talks) {
    const markers = talk.issuedSpeakerTickets ?? []
    const markedSpeakerIds = new Set(
      markers.map((m) => m.speakerId).filter((id): id is string => !!id),
    )
    const markedEmails = new Set(
      markers.map((m) => normalizeEmail(m.email)).filter(Boolean),
    )
    const handledEmails = new Set<string>()

    for (const speaker of talk.speakers ?? []) {
      // A DANGLING speaker reference dereferences to `null` in GROQ and lands in
      // the array as a null entry. Skip it rather than throwing: an operator
      // must still get to see and apply the rest of the plan, and a speaker
      // document that no longer exists can neither hold a ticket nor be invited.
      if (!speaker?._id) {
        plan.unresolvableSpeakers++
        continue
      }

      const displayEmail = normalizeEmail(speaker.email)
      const knownEmails = (speaker.knownEmails ?? [])
        .map((e) => normalizeEmail(e))
        .filter(Boolean)

      // Display address first so `matchedVia` names the primary field when both
      // carry the same address.
      const candidates: { email: string; via: PlannedMarker['matchedVia'] }[] =
        [
          ...(displayEmail
            ? [{ email: displayEmail, via: 'email' as const }]
            : []),
          ...knownEmails.map((email) => ({
            email,
            via: 'knownEmails' as const,
          })),
        ]

      const match = candidates.find((c) => redeemedEmails.has(c.email))
      if (!match) {
        plan.noClaimedTicket++
        continue
      }

      // Already recorded — by speaker id, or by ANY of this speaker's addresses
      // appearing in a marker (the handler skips on either, and a duplicate
      // speaker document for the same person must not earn a second marker).
      if (
        markedSpeakerIds.has(speaker._id) ||
        candidates.some((c) => markedEmails.has(c.email))
      ) {
        plan.alreadyMarked++
        continue
      }

      // The marker carries the DISPLAY address when there is one, because that
      // is what `handleSpeakerTicket` compares its own `normalizeEmail(
      // speaker.email)` against on the next sweep.
      const markerEmail = displayEmail || match.email

      if (handledEmails.has(markerEmail)) {
        plan.duplicateInRun++
        continue
      }
      handledEmails.add(markerEmail)

      plan.planned.push({
        proposalId: talk._id,
        proposalTitle: talk.title ?? '—',
        speakerId: speaker._id,
        speakerName: speaker.name ?? '—',
        email: markerEmail,
        matchedEmail: match.email,
        matchedVia: match.via,
      })
    }
  }

  return plan
}

interface ConferenceRow {
  _id: string
  title?: string
  startDate?: string
  ticketingProvider?: 'checkin' | 'tito' | null
  checkinCustomerId?: number
  checkinEventId?: number
  titoAccountSlug?: string | null
  titoEventSlug?: string | null
  organization?: { _ref?: string } | null
}

function abort(message: string): never {
  console.error(`✖ ${message}`)
  process.exit(1)
}

export async function main() {
  const { config } = await import('dotenv')
  const { resolve } = await import('path')
  config({ path: resolve(process.cwd(), '.env') })
  config({ path: resolve(process.cwd(), '.env.local'), override: true })

  const apply = process.argv.includes('--apply')

  const { clientReadUncached } = await import('../src/lib/sanity/client')
  const { resolveTicketingProvider, ticketingBinding } =
    await import('../src/lib/tickets/provider')
  const {
    findSpeakerTicketType,
    redeemedSpeakerEmails,
    SPEAKER_TICKET_CATEGORY,
  } = await import('../src/lib/tickets/speakerStatus')
  const { recordSpeakerTicketEmailed } =
    await import('../src/lib/proposal/data/sanity')

  // --- The conference -------------------------------------------------------
  // The app scopes by request domain (`getConferenceForCurrentDomain`), which a
  // CLI has no access to. `migrations/042-*` guesses (latest `startDate`) and
  // this tool DELIBERATELY DOES NOT: measured against production, the latest
  // startDate is the DEMO tenant (KontainerKonf 2026, 2026-11-12), not the live
  // conference. It aborts today only because the demo has no Checkin binding —
  // give it one and an unpinned run would plan against the wrong tenant. A tool
  // that writes must be TOLD which tenant it is pointed at.
  const conferences = await clientReadUncached.fetch<ConferenceRow[]>(
    // groq-global: the tenant registry itself — this read RESOLVES the tenant
    // the rest of the run is scoped to, so it cannot be scoped by one.
    `*[_type == "conference" && !(_id in path("drafts.**"))]{
      _id, title, startDate, ticketingProvider, checkinCustomerId, checkinEventId,
      titoAccountSlug, titoEventSlug, organization
    } | order(startDate desc)`,
  )

  const pinned = process.env.BACKFILL_CONFERENCE_ID
  if (!pinned) {
    console.error('Conference candidates:')
    for (const c of conferences) {
      console.error(
        `  ${c._id.padEnd(28)} startDate=${c.startDate ?? '—'}  ${c.title ?? '—'}`,
      )
    }
    abort(
      'BACKFILL_CONFERENCE_ID is required — this tool does not guess which ' +
        'tenant it writes to. Pick an id from the list above and re-run.',
    )
  }

  const conference = conferences.find((c) => c._id === pinned)
  if (!conference) {
    abort(`BACKFILL_CONFERENCE_ID=${pinned} not found.`)
  }
  console.log(
    `Conference: ${conference.title ?? '—'} (${conference._id}, startDate ${conference.startDate ?? '—'})`,
  )

  // FAIL CLOSED on an unresolvable org. Ticketing credentials are per-org; with
  // no owning organization there is no account to address, and
  // `resolveTicketingCredentials` would decline anyway. Refuse loudly rather
  // than fall through to an empty ticket list, which would read as "nobody
  // claimed anything" and backfill nothing while looking like a clean run.
  if (!conference.organization?._ref) {
    abort(
      `Conference ${conference._id} has no owning organization; refusing to run. ` +
        'Ticketing credentials are resolved per-org and an empty result here is ' +
        'indistinguishable from "no claims".',
    )
  }

  // --- The provider's tickets, fetched ONCE ---------------------------------
  const ticketing = await resolveTicketingProvider(ticketingBinding(conference))
  if (!ticketing.configured) {
    abort(
      `Conference ${conference._id} has no usable ticketing binding or credentials.`,
    )
  }

  const { tickets: ticketTypes } =
    await ticketing.provider.fetchPublicTicketTypes(ticketing.eventRef)
  const speakerType = findSpeakerTicketType(ticketTypes)
  if (!speakerType) {
    // The same refusal `speakerTicketCategories` makes: without the type there
    // is no way to tell a claimed comp from an ordinary ticket, and guessing a
    // category name here would write markers off the wrong evidence.
    abort(
      'No invitation-gated ticket type matching /speaker/i; refusing to guess at a category.',
    )
  }

  const categories = [speakerType.name, SPEAKER_TICKET_CATEGORY]
  const allTickets = await ticketing.provider.fetchEventTickets(
    ticketing.eventRef,
  )
  const redeemed = redeemedSpeakerEmails(allTickets, categories)
  console.log(
    `Speaker ticket type: "${speakerType.name}" — ` +
      `${redeemed.size} claimed speaker ticket(s) of ${allTickets.length} ticket(s).`,
  )
  // The one genuinely quiet failure left. A rate limit or a pagination hiccup
  // returns a short or empty ticket list, and "nothing to backfill" then means
  // "we could not see the evidence", not "everything is already recorded". It
  // writes nothing either way, so it is not dangerous — but the two outcomes
  // print identically unless this says otherwise.
  if (redeemed.size === 0) {
    console.warn(
      `⚠ The provider returned NO claimed speaker tickets (${allTickets.length} ticket(s) total). ` +
        'That is either genuinely none, or a short/rate-limited read. ' +
        'This is NOT the same as "everyone is already marked" — re-run before concluding.',
    )
  }

  // --- The speakers on confirmed talks --------------------------------------
  const talks = await clientReadUncached.fetch<BackfillTalk[]>(
    `*[_type == "talk" && conference._ref == $conferenceId && status == "confirmed"]{
      _id, title,
      issuedSpeakerTickets[]{ _key, speakerId, email },
      speakers[]->{ _id, name, email, knownEmails }
    } | order(title asc)`,
    { conferenceId: conference._id },
  )
  console.log(`Confirmed talks: ${talks.length}`)

  const plan = planSpeakerTicketBackfill(talks, redeemed)

  console.log('')
  for (const marker of plan.planned) {
    console.log(
      `  ${apply ? 'write' : 'plan '}  ${marker.speakerName} <${marker.email}> ` +
        `— matched via ${marker.matchedVia} (${marker.matchedEmail}) ` +
        `on "${marker.proposalTitle}" (${marker.proposalId})`,
    )
  }
  if (plan.planned.length === 0) {
    console.log('  (nothing to backfill)')
  }

  console.log('')
  console.log(
    `${apply ? 'Writing' : 'Would write'} ${plan.planned.length} marker(s); ` +
      `${plan.alreadyMarked} already marked; ` +
      `${plan.noClaimedTicket} speaker(s) with no claimed speaker ticket; ` +
      `${plan.duplicateInRun} duplicate speaker entr(y|ies) collapsed; ` +
      `${plan.unresolvableSpeakers} dangling speaker reference(s).`,
  )
  console.log(
    'NOT COVERED: speakers invited by hand who have not claimed. The provider ' +
      'cannot list invitees, so they are invisible here and may still receive a ' +
      'second invitation.',
  )

  if (!apply) {
    if (plan.planned.length > 0) console.log('\nRe-run with --apply to write.')
    return
  }

  // `recordSpeakerTicketEmailed` is reused deliberately: it owns the
  // `speaker-ticket-<speakerId>` key shape, so a marker written here is
  // byte-identical to one the live handler writes, and both a later run and the
  // handler's own dedupe see it. `emailedAt` lands as the run timestamp — see
  // the header.
  //
  // RE-CHECKED IMMEDIATELY BEFORE EACH WRITE. The plan is computed from a
  // snapshot, and `recordSpeakerTicketEmailed` UPSERTS on the key: if the live
  // handler recorded a genuine delivery for this speaker between the plan and
  // this loop, writing would replace a real `emailedAt` (and address) with a
  // reconciliation stamp — destroying the one record that says an email was
  // actually sent. One point read per planned marker is a trivial cost at this
  // scale, and closes the window to the width of a single request.
  let written = 0
  let raced = 0
  for (const marker of plan.planned) {
    const current = await clientReadUncached.fetch<BackfillMarker[] | null>(
      // groq-global-scoped: point read by document _id, and that _id came from
      // the conference-scoped talk query above — never from an argument.
      `*[_type == "talk" && _id == $id][0].issuedSpeakerTickets[]{ speakerId, email }`,
      { id: marker.proposalId },
    )
    if (
      current?.some(
        (m) =>
          m.speakerId === marker.speakerId ||
          normalizeEmail(m.email) === marker.email,
      )
    ) {
      raced++
      console.log(
        `  skip   ${marker.speakerName} — a marker appeared on "${marker.proposalTitle}" since the plan was computed`,
      )
      continue
    }

    await recordSpeakerTicketEmailed(marker.proposalId, {
      speakerId: marker.speakerId,
      email: marker.email,
    })
    written++
  }
  console.log(
    `\nWrote ${written} marker(s)` +
      (raced > 0 ? `; skipped ${raced} that were recorded meanwhile.` : '.'),
  )
}

// Only run when invoked directly, so importing the planner from a test does not
// execute the backfill or call process.exit.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
