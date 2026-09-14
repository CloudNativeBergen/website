import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { groq } from 'next-sanity'
import { clientWrite } from '@/lib/sanity/client'
import { formatDate } from '@/lib/time'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { emailBrandColor } from '@/lib/branding/theme'
import { Status } from '@/lib/proposal/types'
import {
  INVITATION_NUDGE_THRESHOLD_DAYS,
  isInvitationExpired,
  isInvitationOpen,
} from '@/lib/cospeaker/constants'
import {
  buildEmailEventContext,
  sendEmail,
  type InvitationEmailContext,
} from '@/lib/cospeaker/server'
import { remindCoSpeakerInvitation } from '@/lib/cospeaker/remind'
import type { CoSpeakerInvitationFull } from '@/lib/cospeaker/types'
import {
  CoSpeakerLapsedAlertTemplate,
  type LapsedCoSpeakerItem,
} from '@/components/email/CoSpeakerLapsedAlertTemplate'

/**
 * Daily co-speaker invitation sweep.
 *
 * A co-speaker invitation expires after 14 days and nothing chased it. A
 * pending invitee is NOT in `talk.speakers`, so they are off the programme and
 * the website and get no speaker ticket or badge — and a lapsed invitation
 * usually still reads `pending` in Sanity, because the `expired` status is only
 * written when the invitee clicks a dead link. The sweep therefore accepts BOTH
 * stored statuses and decides expiry by date: `pending` covers the invitations
 * nobody came back to, `expired` the ones where the invitee did come back, too
 * late — and the second is no less broken than the first.
 *
 * Two things, once a day:
 *
 *  1. NUDGE the invitee INVITATION_NUDGE_THRESHOLD_DAYS before the invitation
 *     lapses — once, via `remindCoSpeakerInvitation`, which is the same code an
 *     organizer's "Send reminder" runs, claiming the same 24h `lastRemindedAt`
 *     lock before it sends. A human and this job cannot double-send.
 *  2. ALERT the organizers when an invitation has ALREADY lapsed on a CONFIRMED
 *     proposal. That is the case with consequences; a talk still in `submitted`
 *     does not warrant chasing anyone.
 *
 * Unattended-safety rules, all of them enforced below:
 *  - IDEMPOTENT. A nudge needs `lastRemindedAt` absent; the reminder itself
 *    claims that field before sending. An organizer alert needs
 *    `organizerAlertedAt` absent and claims it before sending. A second run in
 *    the same day therefore finds nothing to do.
 *  - BOUNDED. At most MAX_EMAILS_PER_RUN messages leave per run. On reaching the
 *    cap the job stops and reports `capped: true`; nothing is claimed for the
 *    work it skipped, so the next run picks it up. Organizer alerts are sent
 *    FIRST, so a bulk of expiring invitations cannot spend the budget and leave
 *    the confirmed talks unreported.
 *  - FAIL-SOFT. One failed send is counted and the loop continues.
 *  - MULTI-TENANT. Every send carries the invitation's OWN conference as its
 *    email context, so branding, links and the Resend account (via
 *    `resolveEmailSender(organization._ref)`) come from that tenant and never
 *    from a request Host or a platform default.
 *  - NOBODY DEAD IS MAILED. The query excludes proposals that are rejected,
 *    withdrawn or deleted, conferences whose `endDate` is in the past, and
 *    `drafts.*` documents — `clientWrite` reads the raw perspective, so an
 *    invitation opened in Studio comes back twice and would be mailed twice.
 */

/** A hard ceiling on messages per run, so a data problem cannot become a mail storm. */
const MAX_EMAILS_PER_RUN = 50

/**
 * Proposal states worth chasing a co-speaker for. Everything else — rejected,
 * withdrawn, deleted — is a talk that is not happening.
 */
const CHASEABLE_PROPOSAL_STATUSES = [
  Status.draft,
  Status.submitted,
  Status.accepted,
  Status.waitlisted,
  Status.confirmed,
] as const

interface SweepConference {
  _id: string
  title: string
  city: string
  country: string
  startDate: string
  endDate: string
  domains: string[]
  organizer: string
  cfpEmail: string
  contactEmail?: string
  socialLinks?: string[]
  theme?: InvitationEmailContext['conference']['theme']
  organization?: { _ref: string }
}

type SweepRow = Omit<CoSpeakerInvitationFull, 'proposal'> & {
  organizerAlertedAt?: string
  proposal?: { _id: string; title?: string; status?: Status }
  sweepConference: SweepConference | null
}

/**
 * groq-global: cron sweep. This job runs for the PLATFORM, on a schedule, with
 * no request Host and no signed-in organizer, and its whole purpose is to find
 * lapsing invitations in EVERY tenant. Each row carries its own conference, and
 * every send below is made in that conference's context — the cross-tenant read
 * is the feature; a cross-tenant send would be the bug.
 */
const SWEEP_QUERY = groq`*[
  _type == "coSpeakerInvitation" &&
  !(_id in path("drafts.**")) &&
  status in ["pending", "expired"] &&
  expiresAt < $nudgeCutoff &&
  proposal->status in $chaseable &&
  conference->endDate >= $today
] | order(expiresAt asc) {
  _id,
  _rev,
  invitedEmail,
  invitedName,
  status,
  token,
  expiresAt,
  createdAt,
  lastRemindedAt,
  organizerAlertedAt,
  proposal-> { _id, title, status },
  invitedBy-> { _id, name, email },
  "sweepConference": conference-> {
    _id,
    title,
    city,
    country,
    startDate,
    endDate,
    domains,
    organizer,
    cfpEmail,
    contactEmail,
    socialLinks,
    theme,
    organization
  }
}`

/** The conference's own origin and host — never a request Host, never an env var. */
function tenantContext(
  conference: SweepConference,
): { context: InvitationEmailContext; origin: string } | null {
  const origin = conferenceBaseUrl(conference)
  try {
    return { context: { conference, domain: new URL(origin).host }, origin }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  noStore()
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      )
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('Invalid or missing authorization token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const nudgeCutoff = new Date(
      now.getTime() + INVITATION_NUDGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    const rows: SweepRow[] = await clientWrite.fetch(SWEEP_QUERY, {
      nudgeCutoff,
      chaseable: [...CHASEABLE_PROPOSAL_STATUSES],
      today: now.toISOString().slice(0, 10),
    })

    let nudged = 0
    let alerted = 0
    let failed = 0
    let emails = 0
    let capped = false

    const alertsByConference = new Map<string, SweepRow[]>()
    const nudgeCandidates: Array<{
      row: SweepRow
      conference: SweepConference
    }> = []

    for (const row of rows) {
      const conference = row.sweepConference
      if (!conference) {
        failed++
        console.error(
          `Co-speaker sweep: invitation ${row._id} has no readable conference; skipping`,
        )
        continue
      }

      if (isInvitationExpired(row)) {
        // Only a CONFIRMED talk has real consequences: the co-speaker is off
        // the programme and out of the ticket and badge runs.
        if (
          row.proposal?.status === Status.confirmed &&
          !row.organizerAlertedAt
        ) {
          const group = alertsByConference.get(conference._id) ?? []
          group.push(row)
          alertsByConference.set(conference._id, group)
        }
        continue
      }

      // Still open. One nudge per invitation window: an invitation that has
      // ever been reminded — by this job or by an organizer — is left alone.
      if (!isInvitationOpen(row) || row.lastRemindedAt) continue

      nudgeCandidates.push({ row, conference })
    }

    // ALERTS BEFORE NUDGES, deliberately. Both draw on one budget, and the two
    // are not equal: an alert reports a co-speaker already missing from the
    // programme with no ticket and no badge, while a nudge is a courtesy on an
    // invitation that is still live. Nudged first, a bulk of expiring
    // invitations (a CFP close, an import) would spend the whole budget and no
    // organizer would hear about the confirmed talks — every day, until the
    // backlog drained. Alerts are bounded by confirmed talks and collapse to
    // one digest per conference, so they cannot starve the nudges in turn.
    for (const [conferenceId, group] of alertsByConference) {
      if (emails >= MAX_EMAILS_PER_RUN) {
        capped = true
        break
      }

      const conference = group[0].sweepConference as SweepConference
      const tenant = tenantContext(conference)
      const to = conference.cfpEmail || conference.contactEmail
      if (!tenant || !to) {
        failed++
        console.error(
          `Co-speaker sweep: conference ${conferenceId} has no usable origin or organizer address; ${group.length} lapsed invitation(s) not reported`,
        )
        continue
      }

      // Claim BEFORE sending, conditioned on the revision read above, so a
      // concurrent write loses and no invitation is reported twice.
      const claimed: SweepRow[] = []
      for (const row of group) {
        try {
          await clientWrite
            .patch(row._id)
            .ifRevisionId(row._rev ?? '')
            .set({ organizerAlertedAt: now.toISOString() })
            .commit()
          claimed.push(row)
        } catch (claimError) {
          failed++
          console.error(
            `Co-speaker sweep: could not claim organizer alert for invitation ${row._id}`,
            claimError,
          )
        }
      }

      if (claimed.length === 0) continue

      const { eventName, eventLocation, eventDate, eventUrl } =
        buildEmailEventContext(conference, tenant.context.domain)

      const items: LapsedCoSpeakerItem[] = claimed.map((row) => ({
        proposalTitle: row.proposal?.title || 'Untitled proposal',
        invitedName: row.invitedName || row.invitedEmail,
        invitedEmail: row.invitedEmail,
        expiredOn: formatDate(row.expiresAt),
        proposalUrl: `${tenant.origin}/admin/proposals/${row.proposal?._id ?? ''}`,
      }))

      emails++
      const sent = await sendEmail({
        to,
        subject:
          claimed.length === 1
            ? 'A co-speaker invitation expired on a confirmed talk'
            : `${claimed.length} co-speaker invitations expired on confirmed talks`,
        // The SAME address this is addressed to. Splitting the two left `from`
        // as `Org <>` whenever the `cfpEmail` fallback fired — Resend rejects
        // that, the claims release, and the run repeats it every day forever.
        from: `${conference.organizer} <${to}>`,
        // Per invitation's OWN organization: one tenant's alert must never go
        // out on another tenant's Resend account.
        orgId: conference.organization?._ref,
        component: CoSpeakerLapsedAlertTemplate,
        props: {
          items,
          proposalsUrl: `${tenant.origin}/admin/proposals`,
          eventName,
          eventLocation,
          eventDate,
          eventUrl,
          socialLinks: conference.socialLinks || [],
          brandColor: emailBrandColor(conference.theme),
        },
      })

      if (sent.success) {
        alerted += claimed.length
      } else {
        failed++
        console.error(
          `Co-speaker sweep: organizer alert for conference ${conferenceId} failed to send`,
          sent.error,
        )
        // Release the claims so tomorrow's run reports them again.
        await Promise.all(
          claimed.map((row) =>
            clientWrite
              .patch(row._id)
              .unset(['organizerAlertedAt'])
              .commit()
              .catch((releaseError) =>
                console.error(
                  `Co-speaker sweep: could not release organizer alert claim on ${row._id}`,
                  releaseError,
                ),
              ),
          ),
        )
      }
    }

    for (const { row, conference } of nudgeCandidates) {
      if (emails >= MAX_EMAILS_PER_RUN) {
        capped = true
        break
      }

      const tenant = tenantContext(conference)
      if (!tenant) {
        failed++
        console.error(
          `Co-speaker sweep: conference ${conference._id} has no usable origin; skipping invitation ${row._id}`,
        )
        continue
      }

      emails++
      try {
        const result = await remindCoSpeakerInvitation(row, tenant.context)
        if (result.ok) {
          nudged++
        } else {
          // The claim is released by `remindCoSpeakerInvitation` on a failed
          // send, so a transient failure retries tomorrow.
          failed++
          console.error(
            `Co-speaker sweep: reminder for invitation ${row._id} refused (${result.reason})`,
          )
        }
      } catch (error) {
        failed++
        console.error(
          `Co-speaker sweep: reminder for invitation ${row._id} threw`,
          error,
        )
      }
    }

    if (capped) {
      console.warn(
        `Co-speaker sweep: hit the ${MAX_EMAILS_PER_RUN}-message cap; remaining work is left for the next run`,
      )
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      nudged,
      alerted,
      failed,
      emails,
      capped,
    })
  } catch (error) {
    console.error('Co-speaker invitation cron error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
