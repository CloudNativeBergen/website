/**
 * What a service hands to konf-notifications' `Notifications` entrypoint
 * (epic #2215). Ids only: the service re-reads the proposal and derives the
 * recipients. `orgId`/`conferenceId` are the CALLER's verified tenant; the
 * service refuses a proposal outside it. `id` is the dedupe key.
 */
interface ProposalEventBase {
  id: string
  orgId: string
  conferenceId: string
  proposalId: string
  /** The acting speaker's Sanity id: never notified about their own action. */
  actorSpeakerId: string
}

export type NotificationEvent =
  | (ProposalEventBase & { type: 'proposal.submitted' })
  | (ProposalEventBase & {
      type: 'proposal.withdrawn'
      /** Status before the withdrawal: a confirmed talk lists tickets to cancel. */
      previousStatus: string
    })

/** The RPC surface a caller binds. Never rejects. */
export interface NotificationsBinding {
  send(event: NotificationEvent): Promise<void>
}
