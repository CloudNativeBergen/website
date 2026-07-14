'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { ProposalExisting, Format } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalCoSpeaker } from './ProposalCoSpeaker'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'

interface CoSpeakerManagerProps {
  proposal: ProposalExisting
  /**
   * Speaker id of the user viewing the page. Only used to hide the
   * remove button on the viewer's own row (self-removal is blocked
   * server-side); the co-speaker list itself is viewer-independent.
   */
  currentUserSpeakerId: string
}

export function CoSpeakerManager({
  proposal,
  currentUserSpeakerId,
}: CoSpeakerManagerProps) {
  const router = useRouter()
  const [invitations, setInvitations] = useState<CoSpeakerInvitationMinimal[]>(
    proposal.coSpeakerInvitations || [],
  )

  const removeCoSpeakerMutation = api.proposal.removeCoSpeaker.useMutation()

  // Removal goes through the dedicated removeCoSpeaker mutation (the
  // standard proposal.update is locked when the CFP is closed and no
  // longer accepts speaker changes).
  const handleRemoveSpeaker = async (speakerId: string) => {
    await removeCoSpeakerMutation.mutateAsync({
      proposalId: proposal._id,
      speakerId,
    })
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <ProposalCoSpeaker
        // Semantics: "co-speakers" are all proposal speakers except the
        // primary speaker (speakers[0], matching ProposalForm). This is
        // viewer-independent, so the list and limit check stay correct
        // even when the viewer is not a speaker on the proposal (e.g. an
        // organizer impersonating a speaker).
        selectedSpeakers={(proposal.speakers || [])
          .filter(
            (s): s is Speaker =>
              typeof s === 'object' && s !== null && '_id' in s,
          )
          .slice(1)}
        currentUserSpeakerId={currentUserSpeakerId}
        onRemoveSpeaker={handleRemoveSpeaker}
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
