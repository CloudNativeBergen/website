'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProposalExisting, Format } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalCoSpeaker } from './ProposalCoSpeaker'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'

interface CoSpeakerManagerProps {
  proposal: ProposalExisting
}

export function CoSpeakerManager({ proposal }: CoSpeakerManagerProps) {
  const router = useRouter()
  const [invitations, setInvitations] = useState<CoSpeakerInvitationMinimal[]>(
    proposal.coSpeakerInvitations || [],
  )

  // In this read-only context, we don't allow removing speakers directly
  // they must accept invitations. If we wanted to allow removing already
  // added co-speakers, we would need a dedicated mutation for that
  // as the standard proposal.update is locked when CFP is closed.
  const handleSpeakersChange = () => {
    // No-op or show a message that they can't remove confirmed speakers here
    console.log('Manual speaker removal not supported in this view')
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <ProposalCoSpeaker
        selectedSpeakers={
          proposal.speakers?.filter(
            (s): s is Speaker =>
              typeof s === 'object' && s !== null && '_id' in s,
          ) || []
        }
        onSpeakersChange={handleSpeakersChange}
        format={proposal.format as Format}
        proposalId={proposal._id}
        pendingInvitations={invitations}
        onInvitationSent={(inv) => {
          setInvitations((prev) => [...prev, inv])
          router.refresh()
        }}
        onInvitationCanceled={(id) => {
          setInvitations((prev) => prev.filter((inv) => inv._id !== id))
          router.refresh()
        }}
      />
    </div>
  )
}
