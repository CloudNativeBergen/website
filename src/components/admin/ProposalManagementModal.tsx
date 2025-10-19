'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { useTheme } from 'next-themes'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { XCircleIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/Button'
import { ErrorText } from '@/components/Form'
import {
  ProposalInput,
  ProposalExisting,
  Format,
  Language,
  Level,
} from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { Topic } from '@/lib/topic/types'
import { extractSpeakerIds } from '@/lib/proposal/utils'
import { SpeakerMultiSelect } from '@/components/admin/SpeakerMultiSelect'
import {
  createProposalAsAdmin,
  updateProposalAsAdmin,
} from '@/app/(admin)/admin/proposals/actions'
import { ProposalDetailsForm } from '@/components/proposal/ProposalDetailsForm'

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
  const { theme } = useTheme()
  const [isPending, startTransition] = useTransition()

  const getInitialProposalData = (): ProposalInput => {
    if (editingProposal) {
      const topicsArray = editingProposal.topics || []
      const validTopics = topicsArray.filter((topic): topic is Topic =>
        topic && typeof topic === 'object' && '_id' in topic && 'title' in topic
      )
      return {
        title: editingProposal.title || '',
        description: editingProposal.description || [],
        language: editingProposal.language || Language.norwegian,
        format: editingProposal.format || conference.formats?.[0] || Format.lightning_10,
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

  const [proposalData, setProposalData] = useState<ProposalInput>(getInitialProposalData())
  const [selectedSpeakerIds, setSelectedSpeakerIds] = useState<string[]>(getInitialSpeakerIds())
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({})

  useEffect(() => {
    if (isOpen) {
      setError(null)
      setValidationErrors({})
    }
  }, [isOpen])

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {}

    if (!proposalData.title || proposalData.title.trim() === '') {
      errors.title = 'Title is required'
    }
    if (!proposalData.format) {
      errors.format = 'Format is required'
    }
    if (!proposalData.level) {
      errors.level = 'Level is required'
    }
    if (!proposalData.tos) {
      errors.tos = 'You must accept the terms of service'
    }
    if (!selectedSpeakerIds || selectedSpeakerIds.length === 0) {
      errors.speakers = 'At least one speaker is required'
    }

    return errors
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

    startTransition(async () => {
      try {
        let result

        if (editingProposal) {
          result = await updateProposalAsAdmin(
            editingProposal._id,
            proposalData,
            selectedSpeakerIds,
          )
        } else {
          result = await createProposalAsAdmin(
            proposalData,
            conference._id,
            selectedSpeakerIds,
          )
        }

        if (!result.success) {
          setError(result.error || 'An error occurred')
          return
        }

        if (editingProposal) {
          onProposalUpdated?.(result.proposal!)
        } else {
          onProposalCreated?.(result.proposal!)
        }
        onClose()
      } catch (err) {
        setError('An unexpected error occurred. Please try again.')
      }
    })
  }

  const allowedFormats = conference.formats || [
    Format.lightning_10,
    Format.presentation_20,
    Format.presentation_40,
    Format.workshop_120,
  ]

  return (
    <Transition appear show={isOpen}>
      <Dialog
        as="div"
        className={`relative z-10 ${theme === 'dark' ? 'dark' : ''}`}
        onClose={onClose}
      >
        {/* Backdrop */}
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="bg-opacity-25 fixed inset-0 bg-black" />
        </TransitionChild>

        {/* Dialog Container */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white text-left align-middle shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-900">
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
                      key={editingProposal?._id || 'new'}
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
                        <XCircleIcon className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                        <p className="text-sm text-red-800 dark:text-red-200">
                          {error}
                        </p>
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
                        className="min-w-[140px]"
                      >
                        {isPending ? (
                          <span className="flex items-center gap-2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            {editingProposal ? 'Updating...' : 'Creating...'}
                          </span>
                        ) : (
                          <span>
                            {editingProposal
                              ? 'Update Proposal'
                              : 'Create Proposal'}
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
