'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { XCircleIcon } from '@heroicons/react/24/solid'
import { AdminButton } from '@/components/admin/AdminButton'
import { ErrorText } from '@/components/Form'
import { prepareReferenceArray } from '@/lib/sanity/helpers'
import {
  ProposalInput,
  ProposalExisting,
  Format,
  Language,
  Level,
} from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { validateExpandedTopics } from '@/lib/conference/validation'
import { Topic } from '@/lib/topic/types'
import { extractSpeakerIds } from '@/lib/proposal/utils'
import { validateProposalForAdmin } from '@/lib/proposal/validation'
import { ProposalCoSpeaker } from '@/components/cfp/ProposalCoSpeaker'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'
import { Speaker } from '@/lib/speaker/types'
import { extractSpeakersFromProposal } from '@/lib/proposal/utils'
import { api } from '@/lib/trpc/client'
import { useQueryClient } from '@tanstack/react-query'
import { ProposalDetailsForm } from '@/components/proposal/ProposalDetailsForm'
import {
  ProposalAdminCreateSchema,
  ProposalAdminUpdateSchema,
} from '@/server/schemas/proposal'
import { useNotification } from './NotificationProvider'
import { z } from 'zod'
import { ModalShell } from '@/components/ModalShell'

interface ProposalManagementModalProps {
  isOpen: boolean
  onClose: () => void
  editingProposal?: ProposalExisting | null
  conference: Conference
  onProposalCreated?: (proposal: ProposalExisting) => void
  onProposalUpdated?: (proposal: ProposalExisting) => void
}

export function ProposalManagementModal({
  isOpen,
  onClose,
  editingProposal,
  conference,
  onProposalCreated,
  onProposalUpdated,
}: ProposalManagementModalProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { showNotification } = useNotification()

  // State declarations must come before useEffect that uses them
  const getInitialProposalData = (): ProposalInput => {
    if (editingProposal) {
      const topicsArray = editingProposal.topics || []
      const validTopics = topicsArray.filter(
        (topic): topic is Topic =>
          topic &&
          typeof topic === 'object' &&
          '_id' in topic &&
          'title' in topic,
      )
      return {
        title: editingProposal.title || '',
        description: editingProposal.description || [],
        language: editingProposal.language || Language.norwegian,
        format:
          editingProposal.format ||
          conference.formats?.[0] ||
          Format.lightning_10,
        level: editingProposal.level || Level.beginner,
        audiences: editingProposal.audiences || [],
        topics: validTopics,
        outline: editingProposal.outline || '',
        tos: true,
      }
    }
    return {
      title: '',
      description: [],
      language: Language.norwegian,
      format: conference.formats?.[0] || Format.lightning_10,
      level: Level.beginner,
      audiences: [],
      topics: [],
      outline: '',
      tos: false,
    }
  }

  const getInitialSpeakerIds = (): string[] => {
    return extractSpeakerIds(editingProposal?.speakers)
  }

  const [proposalData, setProposalData] = useState<ProposalInput>(
    getInitialProposalData(),
  )
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({})

  const getInitialSpeakers = (): Speaker[] =>
    editingProposal ? extractSpeakersFromProposal(editingProposal) : []

  // One ordered list, primary first — the same array the server stores.
  const [speakers, setSpeakers] = useState<Speaker[]>(getInitialSpeakers())
  /**
   * What is already persisted server-side. The dirty-close guard compares
   * against THIS, not against the list the modal opened with: removing a
   * co-speaker and creating a profile both commit immediately, and comparing
   * to the opening state warned about changes that were already saved.
   */
  const [savedSpeakerIds, setSavedSpeakerIds] = useState<string[]>(
    getInitialSpeakerIds(),
  )
  const [invitations, setInvitations] = useState<CoSpeakerInvitationMinimal[]>(
    editingProposal?.coSpeakerInvitations || [],
  )

  const selectedSpeakerIds = speakers.map((s) => s._id)

  // Validate that topics are properly expanded - this will throw a helpful error
  // if the parent page forgot to pass `topics: true` to getConferenceForCurrentDomain
  useEffect(() => {
    try {
      validateExpandedTopics(conference, 'ProposalManagementModal')
    } catch (error) {
      console.error(error)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        error instanceof Error
          ? error.message
          : 'Conference topics are not properly loaded',
      )
    }
  }, [conference, setError])

  // tRPC mutations
  const createMutation = api.proposal.admin.create.useMutation({
    onSuccess: (proposal) => {
      queryClient.invalidateQueries({ queryKey: [['proposal']] })
      showNotification({
        type: 'success',
        title: 'Proposal created',
        message: 'The proposal has been created successfully.',
      })
      onProposalCreated?.(proposal)
      onClose()
    },
    onError: (error) => {
      const errorMessage = error.message || 'Failed to create proposal'
      setError(errorMessage)
      showNotification({
        type: 'error',
        title: 'Failed to create proposal',
        message: errorMessage,
      })
    },
  })

  const updateMutation = api.proposal.admin.update.useMutation({
    onSuccess: (proposal) => {
      queryClient.invalidateQueries({ queryKey: [['proposal']] })
      showNotification({
        type: 'success',
        title: 'Proposal updated',
        message: 'The proposal has been updated successfully.',
      })
      onProposalUpdated?.(proposal)
      onClose()
    },
    onError: (error) => {
      const errorMessage = error.message || 'Failed to update proposal'
      setError(errorMessage)
      showNotification({
        type: 'error',
        title: 'Failed to update proposal',
        message: errorMessage,
      })
    },
  })

  const removeCoSpeakerMutation = api.proposal.removeCoSpeaker.useMutation()

  // Removal must go through the dedicated mutation so the matching
  // accepted invitation is canceled atomically with the speaker unset —
  // persisting the trimmed speakers[] via admin.update would leave a
  // stale "accepted" invitation row behind.
  const handleRemoveCoSpeaker = async (speakerId: string) => {
    if (!editingProposal) return
    await removeCoSpeakerMutation.mutateAsync({
      proposalId: editingProposal._id,
      speakerId,
    })
    setSpeakers((prev) => prev.filter((s) => s._id !== speakerId))
    setSavedSpeakerIds((prev) => prev.filter((id) => id !== speakerId))
    queryClient.invalidateQueries({ queryKey: [['proposal']] })
    // The modal's hosts render from server props, so the tRPC cache alone
    // leaves the page behind after a remove-then-cancel.
    router.refresh()
  }

  /**
   * The direct-create path has ALREADY persisted the speaker and appended it to
   * the proposal server-side, so this only mirrors that into local state (the
   * modal stays open) and refreshes the server-rendered hosts. The minimal
   * shape the mutation returns is a subset of `Speaker`; the list below renders
   * name and title only.
   */
  const handleCoSpeakerProfileCreated = ({
    speaker,
    supersededInvitationIds,
  }: {
    speaker: { _id: string; name: string; email: string; title?: string }
    supersededInvitationIds: string[]
  }) => {
    setSpeakers((prev) =>
      prev.some((s) => s._id === speaker._id)
        ? prev
        : [...prev, speaker as Speaker],
    )
    setSavedSpeakerIds((prev) =>
      prev.includes(speaker._id) ? prev : [...prev, speaker._id],
    )
    // The server canceled any pending invitation to the same address in the
    // same transaction; drop it here so the list does not keep offering it.
    if (supersededInvitationIds.length > 0) {
      setInvitations((prev) =>
        prev.filter((inv) => !supersededInvitationIds.includes(inv._id ?? '')),
      )
    }
    queryClient.invalidateQueries({ queryKey: [['proposal']] })
    router.refresh()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  // Snapshot the pristine form so the dirty-close guard only arms once the
  // organizer has actually changed the proposal fields or its speakers.
  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        proposalData: getInitialProposalData(),
        speakerIds: savedSpeakerIds,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editingProposal & conference are the only inputs to the initial builders
    [editingProposal, conference, savedSpeakerIds],
  )

  const isDirty =
    JSON.stringify({
      proposalData,
      speakerIds: selectedSpeakerIds,
    }) !== initialSnapshot

  // Reset form when modal opens or when editing a different proposal
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null)
      setValidationErrors({})
      // Reinitialize form data when modal opens or editing proposal changes
      const topicsArray = editingProposal?.topics || []

      const validTopics = topicsArray.filter(
        (topic): topic is Topic =>
          topic &&
          typeof topic === 'object' &&
          '_id' in topic &&
          'title' in topic,
      )
      setProposalData(
        editingProposal
          ? {
              title: editingProposal.title || '',
              description: editingProposal.description || [],
              language: editingProposal.language || Language.norwegian,
              format:
                editingProposal.format ||
                conference.formats?.[0] ||
                Format.lightning_10,
              level: editingProposal.level || Level.beginner,
              audiences: editingProposal.audiences || [],
              topics: validTopics,
              outline: editingProposal.outline || '',
              tos: true,
            }
          : {
              title: '',
              description: [],
              language: Language.norwegian,
              format: conference.formats?.[0] || Format.lightning_10,
              level: Level.beginner,
              audiences: [],
              topics: [],
              outline: '',
              tos: false,
            },
      )
      setSavedSpeakerIds(extractSpeakerIds(editingProposal?.speakers) || [])
      setSpeakers(
        editingProposal ? extractSpeakersFromProposal(editingProposal) : [],
      )
      setInvitations(editingProposal?.coSpeakerInvitations || [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conference.formats and editingProposal are stable, isOpen triggers reset
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey

      if (isCmdOrCtrl && event.key.toLowerCase() === 's') {
        event.preventDefault()

        if (isPending) return

        const errors = validateProposalForAdmin(
          proposalData,
          selectedSpeakerIds,
        )
        if (Object.keys(errors).length > 0) {
          setValidationErrors(errors)
          return
        }

        setError(null)
        setValidationErrors({})

        if (editingProposal) {
          const updateData = {
            ...proposalData,
            speakers: selectedSpeakerIds,
            topics: prepareReferenceArray(
              proposalData.topics as Array<{ _id: string }> | undefined,
              'topic',
            ),
          } as z.infer<typeof ProposalAdminUpdateSchema>

          updateMutation.mutate({
            id: editingProposal._id,
            data: updateData,
          })
        } else {
          const createData = {
            ...proposalData,
            speakers: selectedSpeakerIds,
            conferenceId: conference._id,
            topics: prepareReferenceArray(
              proposalData.topics as Array<{ _id: string }> | undefined,
              'topic',
            ),
          } as z.infer<typeof ProposalAdminCreateSchema>

          createMutation.mutate(createData)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isOpen,
    isPending,
    proposalData,
    selectedSpeakerIds,
    editingProposal,
    conference._id,
    updateMutation,
    createMutation,
    setError,
    setValidationErrors,
  ])

  const validateForm = (): Record<string, string> => {
    return validateProposalForAdmin(proposalData, selectedSpeakerIds)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setError(null)
    setValidationErrors({})

    if (editingProposal) {
      // Prepare update data - admin routes accept speaker IDs as strings
      // Transform topics from full objects to Sanity references
      const updateData = {
        ...proposalData,
        speakers: selectedSpeakerIds,
        topics: prepareReferenceArray(
          proposalData.topics as Array<{ _id: string }> | undefined,
          'topic',
        ),
      } as z.infer<typeof ProposalAdminUpdateSchema>

      updateMutation.mutate({
        id: editingProposal._id,
        data: updateData,
      })
    } else {
      // Prepare creation data - admin routes accept speaker IDs as strings
      // Transform topics from full objects to Sanity references
      const createData = {
        ...proposalData,
        speakers: selectedSpeakerIds,
        conferenceId: conference._id,
        topics: prepareReferenceArray(
          proposalData.topics as Array<{ _id: string }> | undefined,
          'topic',
        ),
      } as z.infer<typeof ProposalAdminCreateSchema>

      createMutation.mutate(createData)
    }
  }

  const allowedFormats = conference.formats || [
    Format.lightning_10,
    Format.presentation_20,
    Format.presentation_40,
    Format.workshop_120,
  ]

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="4xl"
      padded={false}
      title={editingProposal ? 'Edit Proposal' : 'Create New Proposal'}
      className="border border-brand-frosted-steel bg-brand-glacier-white dark:border-gray-700"
      confirmOnDirtyClose
      isDirty={isDirty && !isPending}
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-6">
          {/* One Speakers list: primary, co-speakers and open invitations */}
          <div className="mb-6">
            <ProposalCoSpeaker
              speakers={speakers}
              onSpeakersChange={setSpeakers}
              // Only an existing proposal has a server-side speakers array to
              // remove from; before that, removal is local until Create.
              onRemoveSpeaker={
                editingProposal ? handleRemoveCoSpeaker : undefined
              }
              format={proposalData.format}
              proposalId={editingProposal?._id}
              invitations={invitations}
              onInvitationSent={(inv) =>
                setInvitations((prev) => [...prev, inv])
              }
              onInvitationCanceled={(id) =>
                setInvitations((prev) => prev.filter((inv) => inv._id !== id))
              }
              // ADMIN CONTEXT. The same component is rendered to speakers in
              // the CFP form, where neither path may appear; the server's
              // `adminProcedure` is the real gate.
              allowPickExisting
              allowDirectProfileCreation
              // Organizers may exceed the per-format limit (#1030).
              enforceFormatLimit={false}
              onSpeakerCreated={handleCoSpeakerProfileCreated}
            />
            {validationErrors.speakers && (
              <ErrorText>{validationErrors.speakers}</ErrorText>
            )}
          </div>

          {/* Proposal Details Section */}
          <ProposalDetailsForm
            proposal={proposalData}
            setProposal={setProposalData}
            conference={conference}
            allowedFormats={allowedFormats}
          />
          {validationErrors.title && (
            <ErrorText>{validationErrors.title}</ErrorText>
          )}
          {validationErrors.format && (
            <ErrorText>{validationErrors.format}</ErrorText>
          )}
          {validationErrors.level && (
            <ErrorText>{validationErrors.level}</ErrorText>
          )}
          {validationErrors.tos && (
            <ErrorText>{validationErrors.tos}</ErrorText>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <XCircleIcon className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="border-t border-gray-200 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 dark:border-gray-700">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={isPending}
              className="min-h-11"
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="brand"
              size="md"
              disabled={isPending}
              className="min-h-11 min-w-35"
              title="Save changes"
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  {editingProposal ? 'Updating...' : 'Creating...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>
                    {editingProposal ? 'Update Proposal' : 'Create Proposal'}
                  </span>
                  <kbd className="rounded border border-white/40 bg-white/20 px-1.5 py-0.5 text-xs font-semibold text-white">
                    ⌘S
                  </kbd>
                </span>
              )}
            </AdminButton>
          </div>
        </div>
      </form>
    </ModalShell>
  )
}
