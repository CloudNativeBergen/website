'use client'

import { useEffect, useRef } from 'react'
import { api } from '@/lib/trpc/client'
import { ConversationThread } from '@/components/messaging'
import { sponsorConversationId } from '@/lib/messaging/links'

export function SponsorMessagesPanel({
  sponsorForConferenceId,
}: {
  sponsorForConferenceId: string
}) {
  const conversationId = sponsorConversationId(sponsorForConferenceId)
  const utils = api.useUtils()
  const ensure = api.message.ensureSponsorThread.useMutation({
    onSuccess: () => {
      utils.message.getConversation.invalidate({ id: conversationId })
      utils.message.listMessages.invalidate({ conversationId })
    },
  })

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
