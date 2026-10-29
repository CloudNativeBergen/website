import { clientWrite } from '@/lib/sanity/client'

/**
 * One sponsor broadcast at a time per conference (#1704 C1). Every send
 * narrows the conference's ONE shared Resend sponsor audience to its own
 * filters, so two sends at once would each mail the other's recipients.
 *
 * The lock is a claim document per conference. `create` fails if it exists,
 * so only one caller wins. A claim older than `BROADCAST_LOCK_TTL_MS` belongs
 * to a send that crashed, and is taken over with `ifRevisionId` so two callers
 * cannot both take it. Release is also revision-bound: a send that outlived
 * its claim cannot release a newer one.
 */
export const BROADCAST_LOCK_TTL_MS = 5 * 60 * 1000

export const broadcastLockId = (conferenceId: string) =>
  `sponsorBroadcastLock-${conferenceId}`

interface LockDoc {
  _id: string
  _rev: string
  expiresAt: string
}

/** The claim's revision when it is ours, `null` when another send holds it. */
export async function acquireBroadcastLock(
  conferenceId: string,
  now = Date.now(),
): Promise<string | null> {
  const _id = broadcastLockId(conferenceId)
  const expiresAt = new Date(now + BROADCAST_LOCK_TTL_MS).toISOString()
  try {
    const created = await clientWrite.create({
      _id,
      _type: 'sponsorBroadcastLock',
      conference: { _type: 'reference', _ref: conferenceId, _weak: true },
      expiresAt,
    })
    return created._rev
  } catch {
    // Exists already (or the write failed): see whether it has expired.
  }
  const existing = await clientWrite.getDocument<LockDoc>(_id)
  if (!existing || Date.parse(existing.expiresAt) > now) return null
  try {
    const taken = await clientWrite
      .patch(_id)
      .ifRevisionId(existing._rev)
      .set({ expiresAt })
      .commit<LockDoc>()
    return taken._rev
  } catch {
    return null // another caller took the expired claim first
  }
}

/** Ends the claim; a failure is logged, since the TTL frees it anyway. */
export async function releaseBroadcastLock(conferenceId: string, rev: string) {
  try {
    await clientWrite
      .patch(broadcastLockId(conferenceId))
      .ifRevisionId(rev)
      .set({ expiresAt: new Date(0).toISOString() })
      .commit()
  } catch (error) {
    console.warn('[broadcastEmail] releasing the send lock failed:', error)
  }
}
