'use client'

import { useState, useEffect } from 'react'
import { DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { XCircleIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/Button'
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
import { SpeakerMultiSelect } from '@/components/admin/SpeakerMultiSelect'
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
  const [selectedSpeakerIds, setSelectedSpeakerIds] = useState<string[]>(
    getInitialSpeakerIds(),
  )
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({})

  // Validate that topics are properly expanded - this will throw a helpful error
  // if the parent page forgot to pass `topics: true` to getConferenceForCurrentDomain
  useEffect(() => {
    try {
      validateExpandedTopics(conference, 'ProposalManagementModal')
    } catch (error) {
      console.error(error)
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

  const isPending = createMutation.isPending || updateMutation.isPending

  // Reset form when modal opens or when editing a different proposal
  useEffect(() => {
    if (isOpen) {
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
      setSelectedSpeakerIds(extractSpeakerIds(editingProposal?.speakers) || [])
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
      className="transform overflow-hidden border border-brand-frosted-steel bg-brand-glacier-white text-left align-middle transition-all dark:border-gray-700"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <DialogTitle className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-white">
          {editingProposal ? 'Edit Proposal' : 'Create New Proposal'}
        </DialogTitle>
        <button
          type="button"
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800"
          onClick={onClose}
          disabled={isPending}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable Content Area */}
      <form onSubmit={handleSubmit}>
        <div className="max-h-[calc(90vh-200px)] overflow-y-auto px-6 py-6">
          {/* Speaker Selection Section */}
          <div className="mb-6">
            <SpeakerMultiSelect
              selectedSpeakerIds={selectedSpeakerIds}
              onChange={setSelectedSpeakerIds}
              conferenceId={conference._id}
              maxSpeakers={5}
              label="Speakers"
              required={true}
              error={validationErrors.speakers}
            />
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
        <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isPending}
              className="min-w-35"
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
                  <kbd className="rounded border border-indigo-400 bg-indigo-500 px-1.5 py-0.5 text-xs font-semibold text-white dark:border-indigo-600 dark:bg-indigo-700">
                    ⌘S
                  </kbd>
                </span>
              )}
            </Button>
          </div>
        </div>
      </form>
    </ModalShell>
  )
}
