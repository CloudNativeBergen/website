import { router, adminProcedure } from '../trpc'
// Import-safe: `email/from` and `email/sender-policy` read env only inside
// functions. `email/config` (which asserts RESEND_API_KEY at load) stays lazy.
import { conferenceSenders } from '@/lib/email/from'
import { describeSenderPolicy } from '@/lib/email/sender-policy'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { buildConferenceStatusSummary } from '@/lib/status/summary'
import { buildSystemChecks } from '@/lib/system-status/checks'
import {
  postSlackMessage,
  escapeMrkdwn,
  type SlackMessage,
} from '@/lib/slack/client'
import { resolveConferenceSlackToken } from '@/lib/slack/token'
import { clientWrite } from '@/lib/sanity/client'
import { TRPCError } from '@trpc/server'

/**
 * Per-organizer, per-probe cooldown so a self-check button can't be hammered
 * (each probe actually sends a Slack message / email / Sanity write). Same
 * size-capped, insertion-ordered `Map` eviction as `push.claimTestCooldown`.
 */
const PROBE_COOLDOWN_MS = 30_000
const MAX_COOLDOWN_ENTRIES = 10_000
const lastProbeAt = new Map<string, number>()

function claimProbeCooldown(speakerId: string, probe: string): boolean {
  const key = `${speakerId}:${probe}`
  const now = Date.now()
  const previous = lastProbeAt.get(key)
  if (previous !== undefined && now - previous < PROBE_COOLDOWN_MS) {
    return false
  }
  lastProbeAt.delete(key)
  if (lastProbeAt.size >= MAX_COOLDOWN_ENTRIES) {
    const oldest = lastProbeAt.keys().next().value
    if (oldest !== undefined) lastProbeAt.delete(oldest)
  }
  lastProbeAt.set(key, now)
  return true
}

function requireCooldown(speakerId: string, probe: string): void {
  if (!claimProbeCooldown(speakerId, probe)) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Please wait 30 seconds before running this probe again.',
    })
  }
}

/** Errors from Slack/Resend/Sanity do not echo credentials, but keep messages short. */
function probeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

async function requireConference() {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve conference from domain',
    })
  }
  return conference
}

export const statusRouter = router({
  admin: router({
    summary: adminProcedure.query(async () => {
      const { conference, error } = await getConferenceForCurrentDomain({
        organizers: true,
        sponsors: true,
      })

      if (error || !conference?._id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not resolve conference from domain',
        })
      }

      return buildConferenceStatusSummary(conference)
    }),

    // Passive registry, including the live Sanity read probe + subscription count.
    systemChecks: adminProcedure.query(async () => {
      const conference = await requireConference()
      return buildSystemChecks(conference)
    }),

    // Post a test message to the same Slack channel the weekly update uses.
    //
    // TOKEN FIRST, CHANNEL SECOND. Whether Slack is available to this
    // organization at all is resolved BEFORE anything about the conference's
    // configuration is reported, so an org without Slack is told it is not
    // enabled rather than being sent to fix a channel field that would change
    // nothing. `slack-mirror` is `readiness: 'internal'`, so `notEnabled` is a
    // neutral statement of fact with no upsell — there is nothing to buy.
    //
    // It also removes a lie: `postSlackMessage` no-op-warns when no token
    // resolves, so the old order returned `ok: true` ("Posted to #channel") for
    // a send that never happened.
    probeSlack: adminProcedure.mutation(async ({ ctx }) => {
      requireCooldown(ctx.speaker._id, 'slack')
      const conference = await requireConference()
      const botToken = await resolveConferenceSlackToken(conference)
      if (!botToken) {
        return {
          ok: false as const,
          notEnabled: true as const,
          error: 'Slack is not enabled for this organization.',
        }
      }
      const channel = conference.salesNotificationChannel
      if (!channel) {
        return {
          ok: false as const,
          error:
            'No weekly-update Slack channel is configured for this conference.',
        }
      }
      const body = `Test message from the admin status page (sent by ${escapeMrkdwn(ctx.speaker.name)})`
      const message: SlackMessage = {
        text: body,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: body } }],
      }
      try {
        await postSlackMessage(message, { channel, forceSlack: true, botToken })
        return { ok: true as const, channel }
      } catch (err) {
        return { ok: false as const, error: probeError(err) }
      }
    }),

    // Send a minimal test email to the acting organizer's own address.
    //
    // It sends from the conference's WORST sender, not from `cfpEmail`: the
    // three sender fields can sit on different domains (see
    // `CONFERENCE_SENDER_FIELDS`), and a probe that always picked one of them
    // would come back green off a healthy address while another was being
    // rejected — the same lie the "Effective senders" check exists to avoid.
    // Which sender was used is reported back, so a green result names what it
    // actually proved.
    probeEmail: adminProcedure.mutation(async ({ ctx }) => {
      requireCooldown(ctx.speaker._id, 'email')
      const conference = await requireConference()
      const senders = conferenceSenders(conference)
      const rank: Record<string, number> = {
        unconfigured: 0,
        'platform-rewritten': 1,
        'tenant-verified': 2,
      }
      const worst = senders.reduce((acc, sender) =>
        rank[describeSenderPolicy(sender.from).decision] <
        rank[describeSenderPolicy(acc.from).decision]
          ? sender
          : acc,
      )
      const from = worst.from
      const sentAs = `${worst.label} ${worst.address}`
      const to = ctx.speaker.email
      if (!to) {
        return {
          ok: false as const,
          error: 'Your account has no email address on file.',
        }
      }
      try {
        // DELIBERATELY the PLATFORM client, not `resolveEmailSender(ctx.orgId)`
        // — the only such send left in the codebase (#843), allowlisted in
        // `src/lib/email/platform-client-usage.test.ts`. This probe's SUBJECT is
        // the platform account's own deliverability; resolving per org would
        // silently report a different account's health, which is the opposite of
        // what an operator clicking "send a test email" is asking.
        //
        // Lazy import: `@/lib/email/config` asserts RESEND_API_KEY at module load.
        const { resend } = await import('@/lib/email/config')
        const { data, error } = await resend.emails.send({
          from,
          to,
          subject: 'Admin status page — test email',
          text: `This is a test email triggered from the admin status page by ${ctx.speaker.name}.`,
        })
        if (error) {
          return {
            ok: false as const,
            error: `${error.message} (sending as ${sentAs})`,
          }
        }
        return { ok: true as const, id: data?.id, sentAs }
      } catch (err) {
        return { ok: false as const, error: probeError(err) }
      }
    }),

    // Round-trip a scratch document through the write client, then remove it.
    probeSanityWrite: adminProcedure.mutation(async ({ ctx }) => {
      requireCooldown(ctx.speaker._id, 'sanityWrite')
      const start = Date.now()
      try {
        await clientWrite.createOrReplace({
          _id: 'system.probe',
          _type: 'systemProbe',
          at: new Date().toISOString(),
        })
        await clientWrite.delete('system.probe')
        return { ok: true as const, latencyMs: Date.now() - start }
      } catch (err) {
        return {
          ok: false as const,
          latencyMs: Date.now() - start,
          error: probeError(err),
        }
      }
    }),
  }),
})
