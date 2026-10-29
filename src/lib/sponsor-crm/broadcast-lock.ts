import { clientWrite } from '@/lib/sanity/client'

/**
 * One sponsor broadcast or audience sync at a time per conference (#1704 C1).
 * Every send narrows the conference's ONE shared Resend sponsor audience to
 * its own filters, so two at once would each mail the other's recipients.
 *
 * The lock is a claim document per conference. `create` fails if it exists,
 * so only one caller wins. A claim past its `expiresAt` belongs to a run that
 * crashed, and is taken over with `ifRevisionId` so two callers cannot both
 * take it. Every later write is revision-bound too: `extend` and `release`
 * fail once someone else holds the claim, and `holds` says whether we still
 * do. `rev` is updated in place by each successful write.
 */
export const BROADCAST_LOCK_TTL_MS = 30 * 60 * 1000

export const broadcastLockId = (conferenceId: string) =>
  `sponsorBroadcastLock-${conferenceId}`

export interface BroadcastLock {
  conferenceId: string
  rev: string
}

/** Thrown to abort a run that has lost its claim to another run. */
export class BroadcastLockLostError extends Error {
  constructor() {
    super('The sponsor send lock was taken over by another run')
    this.name = 'BroadcastLockLostError'
  }
}

interface LockDoc {
  _id: string
  _rev: string
  expiresAt: string
}

const isConflict = (error: unknown) => {
  const e = error as { statusCode?: number; message?: string }
  return e?.statusCode === 409 || /already exists/i.test(e?.message ?? '')
}

const expiry = (now: number) =>
  new Date(now + BROADCAST_LOCK_TTL_MS).toISOString()

/** Our claim, or `null` when another run holds it. */
export async function acquireBroadcastLock(
  conferenceId: string,
  now = Date.now(),
): Promise<BroadcastLock | null> {
  const _id = broadcastLockId(conferenceId)
  try {
    const created = await clientWrite.create({
      _id,
      _type: 'sponsorBroadcastLock',
      conference: { _type: 'reference', _ref: conferenceId, _weak: true },
      expiresAt: expiry(now),
    })
    return { conferenceId, rev: created._rev }
  } catch (error) {
    if (!isConflict(error)) throw error
  }
  const existing = await clientWrite.getDocument<LockDoc>(_id)
  if (!existing || Date.parse(existing.expiresAt) > now) return null
  try {
    const taken = await clientWrite
      .patch(_id)
      .ifRevisionId(existing._rev)
      .set({ expiresAt: expiry(now) })
      .commit<LockDoc>()
    return { conferenceId, rev: taken._rev }
  } catch (error) {
    if (!isConflict(error)) throw error
    return null // another caller took the expired claim first
  }
}

/** Whether the claim is still ours (nobody has taken it over). */
export async function holdsBroadcastLock(lock: BroadcastLock) {
  const current = await clientWrite.getDocument<LockDoc>(
    broadcastLockId(lock.conferenceId),
  )
  return current?._rev === lock.rev
}

/** Pushes the expiry out again; `false` once the claim is no longer ours. */
export async function extendBroadcastLock(
  lock: BroadcastLock,
  now = Date.now(),
): Promise<boolean> {
  try {
    const extended = await clientWrite
      .patch(broadcastLockId(lock.conferenceId))
      .ifRevisionId(lock.rev)
      .set({ expiresAt: expiry(now) })
      .commit<LockDoc>()
    lock.rev = extended._rev
    return true
  } catch (error) {
    if (!isConflict(error)) throw error
    return false
  }
}

/** Ends the claim; a failure is logged, since the TTL frees it anyway. */
export async function releaseBroadcastLock(lock: BroadcastLock) {
  try {
    await clientWrite
      .patch(broadcastLockId(lock.conferenceId))
      .ifRevisionId(lock.rev)
      .set({ expiresAt: new Date(0).toISOString() })
      .commit()
  } catch (error) {
    console.warn('[sponsor send lock] release failed:', error)
  }
}
