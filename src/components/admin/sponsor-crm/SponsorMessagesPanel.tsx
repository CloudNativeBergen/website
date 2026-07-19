'use client'

import { useEffect, useRef } from 'react'
import { api } from '@/lib/trpc/client'
import { ConversationThread } from '@/components/messaging'
import { sponsorConversationId } from '@/lib/messaging/links'

/**
 * The sponsor CRM "Messages" sub-view (messaging G2b): the sponsor↔organizer
 * thread embedded by its deterministic id. On open it ENSURES the thread exists
 * (organizer-initiated create with the acting organizer as `createdBy`) so the
 * organizer can start the conversation before the sponsor has posted — then
 * mounts {@link ConversationThread} for the organizer audience. The sponsor
 * reads/answers the same thread through their portal.
 */
export function SponsorMessagesPanel({
  sponsorForConferenceId,
}: {
  sponsorForConferenceId: string
}) {
  const conversationId = sponsorConversationId(sponsorForConferenceId)
  const utils = api.useUtils()
  const ensure = api.message.ensureSponsorThread.useMutation({
    onSuccess: () => {
      // The doc now exists — let the thread's queries pick it up.
      utils.message.getConversation.invalidate({ id: conversationId })
      utils.message.listMessages.invalidate({ conversationId })
    },
  })

  // Ensure exactly once per mount.
  const ensuredRef = useRef(false)
  const ensureMutate = ensure.mutate
  useEffect(() => {
    if (ensuredRef.current) return
    ensuredRef.current = true
    ensureMutate({ sponsorForConferenceId })
  }, [ensureMutate, sponsorForConferenceId])

  return (
    <div className="py-2">
      <ConversationThread
        conversationId={conversationId}
        audience="organizer"
      />
    </div>
  )
}
