import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { adminProcedure, resolveConferenceId, router } from '../trpc'
import { searchUnified } from '@/lib/search/sanity'
import { MIN_SEARCH_QUERY_LENGTH } from '@/lib/search/types'
import type { UnifiedSearchPayload } from '@/lib/search/types'

/**
 * THE ⌘K COMMAND PALETTE'S SEARCH.
 *
 * ONE procedure, ONE authorization resolution, ONE Sanity round-trip — replacing
 * a per-keystroke fan-out to `proposal.admin.search` + `sponsor.list` +
 * `speaker.admin.search`, each of which re-ran the waist and its own uncached
 * GROQ (five Sanity reads and three conference resolutions per debounce tick).
 *
 * AUTHORIZATION IS NOT COLLAPSED — THERE WAS NOTHING TO COLLAPSE. All three
 * replaced procedures were `adminProcedure`: the single org-scoped organizer
 * waist in `src/server/trpc.ts`, which resolves the request's organization from
 * the DOMAIN conference and denies a caller who is not an organizer of THAT org,
 * and denies outright when the org cannot be resolved. The three sources
 * therefore had exactly one permission requirement between them, and this
 * procedure carries the same one. (They differ in tenant SCOPE, not in
 * permission, and each source keeps its own scope predicate — see
 * `src/lib/search/sanity.ts`.)
 *
 * The originals remain and are unchanged: `proposal.admin.search` and
 * `speaker.admin.search` are used by other admin surfaces, and `sponsor.list`
 * is the sponsor picker. This is an addition, not a replacement of their
 * contracts.
 */
export const searchRouter = router({
  unified: adminProcedure
    .input(
      z.object({
        /**
         * THE FLOOR IS ENFORCED HERE, not only in the palette. A one-character
         * search matches most of the dataset and answers nothing; the client
         * declines to send one, and this refuses to serve one, so a future
         * client edit cannot reinstate the per-character fan-out.
         */
        query: z.string().trim().min(MIN_SEARCH_QUERY_LENGTH),
      }),
    )
    .query(async ({ ctx, input }): Promise<UnifiedSearchPayload> => {
      // Resolved ONCE for all three sources. `ctx.orgId` is the org the waist
      // already gated on (never client input, never session-derived); it is
      // non-null by construction, because `requireAdmin` denies a request whose
      // org does not resolve. The explicit refusal below is the belt to that
      // braces: a search must fail CLOSED rather than run without a tenant key,
      // which for sponsors would mean every tenant's sponsor list.
      const orgId = ctx.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Search requires a resolvable organization',
        })
      }
      const conferenceId = await resolveConferenceId()

      try {
        return await searchUnified({
          query: input.query,
          conferenceId,
          orgId,
        })
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to perform search',
          cause: error,
        })
      }
    }),
})
