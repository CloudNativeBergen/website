import { router, adminProcedure } from '../trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { buildConferenceStatusSummary } from '@/lib/status/summary'
import { buildSystemChecks } from '@/lib/system-status/checks'
import {
  postSlackMessage,
  escapeMrkdwn,
  type SlackMessage,
} from '@/lib/slack/client'
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
    probeSlack: adminProcedure.mutation(async ({ ctx }) => {
      requireCooldown(ctx.speaker._id, 'slack')
      const conference = await requireConference()
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
        await postSlackMessage(message, { channel, forceSlack: true })
        return { ok: true as const, channel }
      } catch (err) {
        return { ok: false as const, error: probeError(err) }
      }
    }),

    // Send a minimal test email to the acting organizer's own address.
    probeEmail: adminProcedure.mutation(async ({ ctx }) => {
      requireCooldown(ctx.speaker._id, 'email')
      const conference = await requireConference()
      const from = `${conference.organizer || 'Cloud Native Days'} <${conference.cfpEmail}>`
      const to = ctx.speaker.email
      if (!to) {
        return {
          ok: false as const,
          error: 'Your account has no email address on file.',
        }
      }
      try {
        // Lazy import: `@/lib/email/config` asserts RESEND_API_KEY at module load.
        const { resend } = await import('@/lib/email/config')
        const { data, error } = await resend.emails.send({
          from,
          to,
          subject: 'Admin status page — test email',
          text: `This is a test email triggered from the admin status page by ${ctx.speaker.name}.`,
        })
        if (error) {
          return { ok: false as const, error: error.message }
        }
        return { ok: true as const, id: data?.id }
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
