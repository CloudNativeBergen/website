import { groq } from 'next-sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'

/** How long an erasure audit record is kept. */
export const PRIVACY_ERASURE_LOG_RETENTION_DAYS = 3 * 365

/**
 * Write the audit record of an admin Privacy page erasure
 * (`privacyErasureLog`): who, when, counts and outcome. No address and no
 * subject id. Best effort: a failed write is logged and never hides the
 * erasure's own outcome.
 */
export async function writePrivacyErasureLog(
  orgId: string,
  actor: string,
  status: 'clean' | 'residual' | 'failed',
  counts: Record<string, number>,
): Promise<void> {
  try {
    await clientWrite.create({
      _type: 'privacyErasureLog',
      organization: { _type: 'reference', _ref: orgId, _weak: true },
      actor,
      status,
      counts: Object.entries(counts).map(([kind, count]) => ({
        _key: kind,
        kind,
        count,
      })),
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[privacy-erasure] audit record not written', {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Delete audit records older than the retention period. For the daily cron;
 * `dryRun` only counts them.
 */
export async function deleteExpiredPrivacyErasureLogs(
  dryRun = false,
  now: number = Date.now(),
): Promise<{ deleted: number }> {
  const before = new Date(
    now - PRIVACY_ERASURE_LOG_RETENTION_DAYS * 86_400_000,
  ).toISOString()
  const ids =
    (await clientReadUncached.fetch<string[]>(
      // groq-global: a retention sweep over every tenant's audit records.
      groq`*[_type == "privacyErasureLog" && createdAt < $before][0...500]._id`,
      { before },
      { cache: 'no-store' },
    )) ?? []
  if (!dryRun && ids.length > 0) {
    const tx = clientWrite.transaction()
    for (const id of ids) tx.delete(id)
    await tx.commit()
  }
  return { deleted: ids.length }
}
