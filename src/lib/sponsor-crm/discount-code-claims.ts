import 'server-only'
import { createHash } from 'node:crypto'
import { normalizeDiscountCode } from '@/lib/discounts/attribution'
import { organizationField } from '@/lib/organization/sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import {
  DiscountCodeLinkError,
  type ResolvedDiscountCode,
  type SponsorCodeLink,
} from './discount-codes'

/**
 * THE ATOMIC OWNERSHIP LOCK for a discount code (#1262, PR #1272 review).
 *
 * The stored link on `sponsorForConference.discountCodes` is what every
 * attribution reads, but a link is "check the other sponsors, then append to
 * mine" — two concurrent links of one code to two sponsors could both pass
 * the check and both append. The arbiter is a `discountCodeClaim` document
 * per (conference, code) with a DETERMINISTIC id: Sanity's `create` fails
 * when the id exists, so the first request to create it owns the code and
 * every later one is refused — before an email goes out, and before anything
 * is appended.
 *
 * Lifecycle: a send claims its codes before mailing and RELEASES them when
 * the send is refused or the provider rejects it; Assign and a sponsor-row
 * create claim before appending and release if the append fails. After a
 * successful send the claim stays with the sponsor even if the link write
 * failed (the organizer is told; a retry finds the claim already theirs).
 *
 * A claim is STALE when its holder no longer stores the code (a Studio edit
 * undoing a mistaken Assign, a deleted CRM row, a link write that failed) AND
 * it is older than {@link CLAIM_SETTLE_MS}. Younger claims are never taken
 * over: a request that has claimed but not yet appended looks exactly like a
 * stale one for the few seconds it is in flight, and that window is the race
 * this lock exists to close. A stale claim is taken over with `ifRevisionId`,
 * so two takeovers cannot both win either.
 */
export const CLAIM_SETTLE_MS = 15 * 60_000

/** Sanity ids allow `[A-Za-z0-9._-]`; a code may carry anything else. */
export function discountCodeClaimId(
  conferenceId: string,
  code: string,
): string {
  const normalized = normalizeDiscountCode(code)
  const safe = normalized.replace(/[^A-Za-z0-9_-]/g, '_')
  const tail =
    safe === normalized && safe.length <= 60
      ? safe
      : `${safe.slice(0, 40)}-${createHash('sha1').update(normalized).digest('hex').slice(0, 12)}`
  return `discountCodeClaim-${conferenceId}-${tail}`
}

interface ClaimDoc {
  _id: string
  _rev: string
  code?: string
  claimedAt?: string
  sponsorForConferenceId?: string
}

export interface ClaimHold {
  /** The codes this sponsor now holds (fresh, taken over, or held before). */
  held: ResolvedDiscountCode[]
  /** `onConflict: 'drop'` only — the codes another sponsor holds. */
  dropped: ResolvedDiscountCode[]
  /** Give back the claims THIS call created or took over. Best-effort. */
  release: () => Promise<void>
}

export async function claimDiscountCodes({
  conferenceId,
  orgRef,
  sponsorForConferenceId,
  codes,
  links,
  onConflict,
}: {
  conferenceId: string
  orgRef: string | null
  sponsorForConferenceId: string
  codes: readonly ResolvedDiscountCode[]
  /** The stored links as already read — to tell a stale claim from a live one. */
  links: readonly SponsorCodeLink[]
  /** `refuse`: throw CONFLICT and release. `drop`: leave that code out. */
  onConflict: 'refuse' | 'drop'
}): Promise<ClaimHold> {
  const fresh: string[] = []
  const held: ResolvedDiscountCode[] = []
  const dropped: ResolvedDiscountCode[] = []
  const release = async () => {
    for (const id of fresh.splice(0)) {
      try {
        await clientWrite.delete(id)
      } catch (error) {
        console.error('[discount-code-claims] release failed:', id, error)
      }
    }
  }
  const holderName = (sfcId: string | undefined) =>
    links.find((l) => l.sponsorForConferenceId === sfcId)?.name ||
    'another sponsor'
  const conflict = async (code: ResolvedDiscountCode, holder?: string) => {
    if (onConflict === 'drop') {
      dropped.push(code)
      return
    }
    await release()
    throw new DiscountCodeLinkError(
      `Discount code "${code.code}" is already linked to ${holderName(holder)}`,
      'CONFLICT',
    )
  }

  for (const code of codes) {
    const _id = discountCodeClaimId(conferenceId, code.code)
    const claimedAt = getCurrentDateTime()
    const ours = {
      sponsorForConference: {
        _type: 'reference' as const,
        _ref: sponsorForConferenceId,
        _weak: true,
      },
      claimedAt,
    }
    try {
      await clientWrite.create({
        _id,
        _type: 'discountCodeClaim',
        conference: { _type: 'reference', _ref: conferenceId, _weak: true },
        ...organizationField(orgRef),
        code: code.code,
        ...ours,
      })
      fresh.push(_id)
      held.push(code)
      continue
    } catch (error) {
      const existing = await clientReadUncached.fetch<ClaimDoc | null>(
        `*[_type == "discountCodeClaim" && conference._ref == $conferenceId && _id == $id][0]{
          _id, _rev, code, claimedAt, "sponsorForConferenceId": sponsorForConference._ref
        }`,
        { conferenceId, id: _id },
      )
      // Not a lost race — the write itself failed. Let the caller see it.
      if (!existing) throw error
      if (existing.sponsorForConferenceId === sponsorForConferenceId) {
        held.push(code)
        continue
      }
      const wanted = normalizeDiscountCode(code.code)
      const holderStores = links.some(
        (l) =>
          l.sponsorForConferenceId === existing.sponsorForConferenceId &&
          l.linkedCodes.some((c) => normalizeDiscountCode(c) === wanted),
      )
      const age = existing.claimedAt
        ? Date.parse(claimedAt) - Date.parse(existing.claimedAt)
        : 0
      if (holderStores || !(age >= CLAIM_SETTLE_MS)) {
        await conflict(code, existing.sponsorForConferenceId)
        continue
      }
      try {
        await clientWrite
          .patch(_id)
          .ifRevisionId(existing._rev)
          .set(ours)
          .commit()
        fresh.push(_id)
        held.push(code)
      } catch {
        await conflict(code, existing.sponsorForConferenceId)
      }
    }
  }
  return { held, dropped, release }
}
