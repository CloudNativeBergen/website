import { Conference } from '@/lib/conference/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Action, Status } from '@/lib/proposal/types'

export interface ProposalStatusChangeEvent {
  eventType: 'proposal.status.changed'
  timestamp: Date
  proposal: ProposalExisting
  previousStatus: Status
  newStatus: Status
  action: Action
  conference: Conference
  speakers: Speaker[]
  metadata: {
    triggeredBy: {
      speakerId: string
      isOrganizer: boolean
    }
    shouldNotify?: boolean
    comment?: string
    domain: string
  }
}
