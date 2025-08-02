'use client'

import { useState, useEffect, useRef } from 'react'
import { Format } from '@/lib/proposal/types'
import { getCoSpeakerLimit } from './constants'
import { CoSpeakerInvitationMinimal, toMinimalInvitation } from './types'
import {
  sendInvitations,
  cancelInvitation as cancelInvitationApi,
  getValidEmails,
} from './client'

export interface InviteField {
  email: string
  name: string
}

export interface UseInviteFieldsReturn {
  inviteFields: InviteField[]
  setInviteFields: React.Dispatch<React.SetStateAction<InviteField[]>>
  handleFieldChange: (
    index: number,
    field: keyof InviteField,
    value: string,
  ) => void
  clearField: (index: number) => void
  getValidInviteEmails: () => string[]
  getValidInviteFields: () => { email: string; name: string }[]
  isAnyFieldFilled: () => boolean
}

export function useInviteFields(format: Format): UseInviteFieldsReturn {
  const maxCoSpeakers = getCoSpeakerLimit(format)

  const [inviteFields, setInviteFields] = useState<InviteField[]>(() =>
    Array(maxCoSpeakers)
      .fill(null)
      .map(() => ({ email: '', name: '' })),
  )

  const prevMaxCoSpeakers = useRef(maxCoSpeakers)
  useEffect(() => {
    if (prevMaxCoSpeakers.current !== maxCoSpeakers) {
      setInviteFields(
        Array(maxCoSpeakers)
          .fill(null)
          .map((_, index) => inviteFields[index] || { email: '', name: '' }),
      )
      prevMaxCoSpeakers.current = maxCoSpeakers
    }
  }, [maxCoSpeakers, inviteFields])

  const handleFieldChange = (
    index: number,
    field: keyof InviteField,
    value: string,
  ) => {
    setInviteFields((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    )
  }

  const clearField = (index: number) => {
    setInviteFields((prev) =>
      prev.map((item, i) => (i === index ? { email: '', name: '' } : item)),
    )
  }

  const getValidInviteEmails = () => {
    const emails = inviteFields.map((field) => field.email)
    return getValidEmails(emails)
  }

  const getValidInviteFields = () => {
    return inviteFields
      .filter(
        (field) =>
          field.email.trim() !== '' && getValidEmails([field.email]).length > 0,
      )
      .map((field) => ({
        email: field.email.trim(),
        name: field.name.trim(),
      }))
  }

  const isAnyFieldFilled = () => {
    return getValidInviteEmails().length > 0
  }

  return {
    inviteFields,
    setInviteFields,
    handleFieldChange,
    clearField,
    getValidInviteEmails,
    getValidInviteFields,
    isAnyFieldFilled,
  }
}

export interface UseInvitationsReturn {
  isSendingInvite: boolean
  inviteError: string
  inviteSuccess: string
  cancelingInvitationId: string | null
  sendInvites: (
    proposalId: string,
    inviteFields: { email: string; name: string }[],
  ) => Promise<CoSpeakerInvitationMinimal[]>
  cancelInvite: (proposalId: string, invitationId: string) => Promise<void>
  clearMessages: () => void
}

export function useInvitations(
  onInvitationSent?: (invitation: CoSpeakerInvitationMinimal) => void,
  onInvitationCanceled?: (invitationId: string) => void,
): UseInvitationsReturn {
  const [isSendingInvite, setIsSendingInvite] = useState(false)
  const [inviteError, setInviteError] = useState<string>('')
  const [inviteSuccess, setInviteSuccess] = useState<string>('')
  const [cancelingInvitationId, setCancelingInvitationId] = useState<
    string | null
  >(null)

  const clearMessages = () => {
    setInviteError('')
    setInviteSuccess('')
  }

  const sendInvites = async (
    proposalId: string,
    inviteFields: { email: string; name: string }[],
  ): Promise<CoSpeakerInvitationMinimal[]> => {
    if (inviteFields.length === 0) {
      setInviteError('Please enter at least one valid email address')
      return []
    }

    if (!proposalId) {
      setInviteError('Please save your proposal before inviting co-speakers')
      return []
    }

    setIsSendingInvite(true)
    clearMessages()

    try {
      const result = await sendInvitations(proposalId, inviteFields)

      if (!result.success) {
        throw new Error(result.error)
      }

      setInviteSuccess(
        `Invitation${result.sentEmails.length > 1 ? 's' : ''} sent to ${result.sentEmails.join(', ')}`,
      )

      // Convert full invitations to minimal format
      const minimalInvitations = result.invitations.map(toMinimalInvitation)

      if (onInvitationSent) {
        minimalInvitations.forEach((invitation) => {
          onInvitationSent(invitation)
        })
      }

      return minimalInvitations
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : 'Failed to send invitation(s)',
      )
      return []
    } finally {
      setIsSendingInvite(false)
    }
  }

  const cancelInvite = async (
    proposalId: string,
    invitationId: string,
  ): Promise<void> => {
    if (!proposalId) return

    setCancelingInvitationId(invitationId)
    clearMessages()

    try {
      await cancelInvitationApi(proposalId, invitationId)
      setInviteSuccess('Invitation canceled successfully')

      if (onInvitationCanceled) {
        onInvitationCanceled(invitationId)
      }
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : 'Failed to cancel invitation',
      )
    } finally {
      setCancelingInvitationId(null)
    }
  }

  return {
    isSendingInvite,
    inviteError,
    inviteSuccess,
    cancelingInvitationId,
    sendInvites,
    cancelInvite,
    clearMessages,
  }
}
