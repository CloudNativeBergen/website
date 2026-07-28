import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { router, adminProcedure, resolveConferenceId } from '../trpc'
import { clientReadUncached } from '@/lib/sanity/client'
import { normalizeDomain } from '@/lib/conference/domains'
import {
  getDomainVerification,
  listDomainVerificationViews,
  recheckDomainRecord,
  syncDomainVerifications,
  toDomainVerificationView,
} from '@/lib/domain-verification'

/**
 * Domain ownership verification, admin side (#683).
 *
 * TENANCY: every procedure resolves the conference SERVER-SIDE
 * (`resolveConferenceId`) and only ever touches hostnames that conference
 * actually claims in its own `domains[]`. A hostname is a global identifier, so
 * accepting one from the client without that check would let any organiser
 * re-check — or read the challenge token of — another tenant's domain.
 */

/** Minimum gap between manual re-checks of the same hostname. */
const RECHECK_COOLDOWN_MS = 10_000

/** The conference's claimed entries, read fresh (verification is never cached). */
async function claimedDomains(conferenceId: string): Promise<string[]> {
  const domains = await clientReadUncached.fetch<string[] | null>(
    // groq-global: keyed by the SERVER-resolved conference id, never client input.
    `*[_type == "conference" && _id == $id][0].domains`,
    { id: conferenceId },
  )
  return (domains ?? []).map(normalizeDomain).filter(Boolean)
}

export const domainVerificationRouter = router({
  /**
   * Verification state for every domain this conference claims, including the
   * exact TXT record to publish.
   */
  list: adminProcedure.query(async () => {
    const conferenceId = await resolveConferenceId()
    // Self-heal: a claim made before this feature existed (or whose best-effort
    // sync failed) has no record, so it would have no token to show. Minting it
    // here is safe — a fresh record starts `pending`, which grants nothing.
    const domains = await claimedDomains(conferenceId)
    await syncDomainVerifications(conferenceId, domains)
    return { domains: await listDomainVerificationViews(conferenceId, domains) }
  }),

  /**
   * Re-resolve one domain's TXT proof right now and persist the result through
   * the SAME policy the cron sweep uses — a manual check can never be more
   * lenient than the scheduled one, and it can delist just as readily.
   */
  recheck: adminProcedure
    .input(z.object({ hostname: z.string().min(1).max(253) }))
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      const hostname = normalizeDomain(input.hostname)
      const domains = await claimedDomains(conferenceId)
      if (!domains.includes(hostname)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'That domain is not claimed by this conference',
        })
      }

      const record = await getDomainVerification(hostname)
      if (!record || record.conferenceId !== conferenceId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No verification record for that domain',
        })
      }

      // Cheap anti-hammer guard: a re-check costs a live DNS query, and the
      // button is one click away.
      const last = record.lastCheckedAt ? Date.parse(record.lastCheckedAt) : 0
      if (last && Date.now() - last < RECHECK_COOLDOWN_MS) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Just checked — try again in a few seconds',
        })
      }

      const { record: updated } = await recheckDomainRecord(record)
      return { domain: toDomainVerificationView(hostname, updated) }
    }),
})
