import { eventBus } from '@/lib/events/bus'
import type { SponsorStatusPair } from '@/lib/events/types'
import type { ContractStatus, SponsorStatus } from './types'

/** What a write path knows about a sponsor's two statuses, before or after. */
interface PartialStatusPair {
  status?: SponsorStatus | null
  contractStatus?: ContractStatus | null
}

/** Whether a sponsor record just became signed: contract signed, or closed-won. */
export function becameSigned(
  previous: SponsorStatusPair,
  next: SponsorStatusPair,
): boolean {
  return (
    (next.contractStatus === 'contract-signed' &&
      previous.contractStatus !== 'contract-signed') ||
    (next.status === 'closed-won' && previous.status !== 'closed-won')
  )
}

/**
 * Publish `sponsor.status.changed` after a sponsor write has COMMITTED, when
 * the pipeline or contract status actually changed. Awaited, and the bus
 * never throws (each handler is isolated), so a caller's response is never
 * failed by a subscriber.
 */
export async function publishSponsorStatusChange(input: {
  conferenceId: string
  sponsorForConferenceId: string
  previous: PartialStatusPair
  next: PartialStatusPair
  source: string
  triggeredBy?: string
  /** Handlers that build work should leave it to the cron (bulk writes). */
  deferred?: boolean
}): Promise<void> {
  const previous: SponsorStatusPair = {
    status: input.previous.status ?? null,
    contractStatus: input.previous.contractStatus ?? null,
  }
  // A field the write did not touch keeps its previous value.
  const next: SponsorStatusPair = {
    status:
      input.next.status === undefined ? previous.status : input.next.status,
    contractStatus:
      input.next.contractStatus === undefined
        ? previous.contractStatus
        : input.next.contractStatus,
  }
  if (
    previous.status === next.status &&
    previous.contractStatus === next.contractStatus
  ) {
    return
  }
  try {
    await eventBus.publish({
      eventType: 'sponsor.status.changed',
      timestamp: new Date(),
      conferenceId: input.conferenceId,
      sponsorForConferenceId: input.sponsorForConferenceId,
      previous,
      next,
      metadata: {
        source: input.source,
        ...(input.triggeredBy ? { triggeredBy: input.triggeredBy } : {}),
        ...(input.deferred ? { deferred: true } : {}),
      },
    })
  } catch (error) {
    console.error('sponsor.status.changed: publish failed', error)
  }
}
