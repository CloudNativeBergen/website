/**
 * THE BATCH MINT (short-links spec §2.2) and the mutation-time backfill.
 *
 * `materializeTask` is pure and builds whole batches, so it cannot mint. Every
 * path that creates Tasks — seed, expansion, Triggers, copy-to-new-edition,
 * add-task, add-built-in-Campaign, attach-Recipe — calls
 * {@link shortCodeMinterFor} ONCE, gets a `() => string`, and passes it in
 * exactly as it already passes `newId`.
 *
 * Sanity has no unique constraint, so this is a check-and-redraw, not a claim.
 * At 887 million codes per conference against a plan's few hundred, the
 * accepted residual risk is two CONCURRENT mints drawing the same code (§2.2's
 * known hole); this module removes everything else.
 */

import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { createShortCodeMinter, normalizeShortCode } from './short-code'

/**
 * Every code the conference already holds, across both document types, in ONE
 * query. Drafts and versions are deliberately INCLUDED: a draft's code is
 * still spoken for, and minting over it would make the published twin's code
 * ambiguous the moment the draft is published.
 *
 * `clientReadUncached`, not the CDN client: a mint must see the codes the
 * previous mint just wrote.
 */
export async function conferenceShortCodes(
  conferenceId: string,
): Promise<string[]> {
  const codes = await scopedFetch<unknown>(
    clientReadUncached,
    { conferenceId },
    `*[_type in ["socialPostVariant", "marketingTask"] && defined(shortCode)].shortCode`,
    {},
    { cache: 'no-store' },
  )
  // Sanity always answers a `.shortCode` projection with an array. Anything
  // else is treated as "no codes known" rather than thrown: a mint that cannot
  // read the existing codes still draws from 887 million, and failing here
  // would fail the whole mutation it rides on.
  if (!Array.isArray(codes)) return []
  return codes.filter((c): c is string => typeof c === 'string')
}

/**
 * A batch mint for one conference: draws a code, checks it against the
 * conference's existing codes AND against everything this batch has already
 * handed out, and redraws a hit.
 */
export async function shortCodeMinterFor(
  conferenceId: string,
): Promise<() => string> {
  return createShortCodeMinter(await conferenceShortCodes(conferenceId))
}

/**
 * What {@link shortCodeForMutation} resolved, and WHETHER IT MINTED.
 *
 * `minted` is the whole point of the shape. The conference's code INDEX (the
 * membership set `/go/<code>` answers unknown codes from) only changes when a
 * code comes into existence. A mutation that merely re-reads the code a
 * document already had leaves the set identical, so expiring the index there
 * throws away a cached read for nothing — on every save, approve, update and
 * send. Callers gate `expireShortLinkIndex` on this flag.
 */
export interface MutationShortCode {
  code: string
  /** `true` only when this call created a code that did not exist before. */
  minted: boolean
}

/**
 * The code a document should carry, for a mutation that is about to need its
 * link: the one it already has, or a freshly minted one.
 *
 * §2.2: a variant or outreach Task that predates the field gets its code in
 * the first MUTATION that needs the link — never in a query, and never
 * client-side. Callers write the returned code with the rest of their patch,
 * so the backfill rides the transaction it belongs to.
 */
export async function shortCodeForMutation(
  conferenceId: string,
  existing: string | null | undefined,
): Promise<MutationShortCode> {
  const current = normalizeShortCode(existing)
  if (current) return { code: current, minted: false }
  return { code: (await shortCodeMinterFor(conferenceId))(), minted: true }
}
