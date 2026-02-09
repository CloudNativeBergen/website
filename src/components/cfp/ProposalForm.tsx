'use client'

import { Conference } from '@/lib/conference/types'
import { api } from '@/lib/trpc/client'
import {
  Format,
  ProposalInput,
  ProposalExisting,
  Status,
  Action,
} from '@/lib/proposal/types'
import { SpeakerInput, Speaker } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { XCircleIcon } from '@heroicons/react/24/solid'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ProposalCoSpeaker } from './ProposalCoSpeaker'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'
import Link from 'next/link'
import { SpeakerDetailsForm } from './SpeakerDetailsForm'
import { ProposalDetailsForm } from '@/components/proposal/ProposalDetailsForm'
import { validateSpeakerConsent } from '@/lib/speaker/validation'

export function ProposalForm({
  initialProposal,
  initialSpeaker,
  proposalId,
  userEmail,
  conference,
  allowedFormats,
  currentUserSpeaker,
  mode = 'user',
  externalSpeakerIds,
  initialStatus,
}: {
  initialProposal: ProposalInput
  initialSpeaker: SpeakerInput
  proposalId?: string
  userEmail: string
  conference: Conference
  allowedFormats: Format[]
  currentUserSpeaker: Speaker
  mode?: 'user' | 'admin' | 'readOnly'
  externalSpeakerIds?: string[]
  initialStatus?: Status
}) {
  const [proposal, setProposal] = useState(initialProposal)
  const [speaker, setSpeaker] = useState(initialSpeaker)
  const [coSpeakers, setCoSpeakers] = useState<Speaker[]>(() => {
    if (initialProposal.speakers && Array.isArray(initialProposal.speakers)) {
      return initialProposal.speakers.filter(
        (s): s is Speaker =>
          typeof s === 'object' &&
          s &&
          '_id' in s &&
          s._id !== currentUserSpeaker._id,
      )
    }
    return []
  })

  const [coSpeakerInvitations, setCoSpeakerInvitations] = useState<
    CoSpeakerInvitationMinimal[]
  >(
    'coSpeakerInvitations' in initialProposal
      ? (initialProposal as ProposalExisting).coSpeakerInvitations || []
      : [],
  )

  const router = useRouter()

  const isReadOnly = mode === 'readOnly'

  const { data: emails } = api.speaker.getEmails.useQuery(undefined, {
    enabled: mode === 'user' && !isReadOnly,
  })

  const [lastAction, setLastAction] = useState<'draft' | 'submit' | null>(null)

  const createProposalMutation = api.proposal.create.useMutation({
    onSuccess: () => {
      router.push(
        lastAction === 'draft'
          ? '/cfp/list?draft=true'
          : '/cfp/list?success=true',
      )
    },
  })

  const updateProposalMutation = api.proposal.update.useMutation()

  const actionMutation = api.proposal.action.useMutation({
    onSuccess: () => {
      router.push('/cfp/list?success=true')
    },
  })

  const updateSpeakerMutation = api.speaker.update.useMutation()

  const isDraft = initialStatus === Status.draft || !proposalId
  const isExistingDraft = initialStatus === Status.draft && !!proposalId
  const buttonPrimary = proposalId && !isExistingDraft ? 'Update' : 'Submit'
  const buttonPrimaryLoading =
    proposalId && !isExistingDraft ? 'Updating...' : 'Submitting...'

  const handleInvitationSent = (invitation: CoSpeakerInvitationMinimal) => {
    setCoSpeakerInvitations((prev) => [...prev, invitation])
  }

  const handleInvitationCanceled = (invitationId: string) => {
    setCoSpeakerInvitations((prev) =>
      prev.filter((inv) => inv._id !== invitationId),
    )
  }

  const [proposalSubmitError, setProposalSubmitError] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const isMutating =
    createProposalMutation.isPending ||
    updateProposalMutation.isPending ||
    updateSpeakerMutation.isPending ||
    actionMutation.isPending

  const mutationError =
    createProposalMutation.error ||
    updateProposalMutation.error ||
    actionMutation.error

  const prepareTopicRefs = () =>
    (proposal.topics ?? [])
      .filter((t): t is Topic => typeof t === 'object' && '_id' in t)
      .map((t) => ({ _type: 'reference' as const, _ref: t._id }))

  const prepareProposalData = () => {
    const topicRefs = prepareTopicRefs()

    const allSpeakers =
      mode === 'admin' && externalSpeakerIds
        ? externalSpeakerIds
        : [currentUserSpeaker._id, ...coSpeakers.map((s) => s._id)]

    return {
      title: proposal.title,
      description: proposal.description,
      language: proposal.language,
      format: proposal.format,
      level: proposal.level,
      outline: proposal.outline,
      audiences: proposal.audiences,
      tos: proposal.tos,
      capacity: proposal.capacity,
      topics: topicRefs,
      speakers: allSpeakers.map((id) => ({
        _type: 'reference' as const,
        _ref: id,
      })),
    }
  }

  const handleSaveDraft = async () => {
    setProposalSubmitError('')
    setValidationErrors([])

    if (!proposal.title?.trim()) {
      setProposalSubmitError('Please enter a title before saving your draft.')
      window.scrollTo(0, 0)
      return
    }

    setLastAction('draft')
    const data = prepareProposalData()

    if (proposalId) {
      try {
        await updateProposalMutation.mutateAsync({ id: proposalId, data })
        router.push('/cfp/list?draft=true')
      } catch {
        window.scrollTo(0, 0)
      }
    } else {
      createProposalMutation.mutate({ data, status: Status.draft })
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (isReadOnly) {
      return
    }

    setProposalSubmitError('')
    setValidationErrors([])
    setLastAction('submit')

    if (mode === 'user') {
      const consentErrors = validateSpeakerConsent(speaker)
      if (consentErrors.length > 0) {
        setProposalSubmitError(
          'You must provide required consents to submit your proposal.',
        )
        setValidationErrors(consentErrors)
        window.scrollTo(0, 0)
        return
      }

      try {
        await updateSpeakerMutation.mutateAsync(speaker)
      } catch {
        window.scrollTo(0, 0)
        return
      }
    }

    const proposalData = prepareProposalData()

    if (proposalId && !isExistingDraft) {
      try {
        await updateProposalMutation.mutateAsync({
          id: proposalId,
          data: proposalData,
        })
        router.push('/cfp/list')
      } catch {
        window.scrollTo(0, 0)
      }
    } else if (isExistingDraft && proposalId) {
      try {
        await updateProposalMutation.mutateAsync({
          id: proposalId,
          data: proposalData,
        })
        await actionMutation.mutateAsync({
          id: proposalId,
          action: Action.submit,
        })
      } catch {
        window.scrollTo(0, 0)
      }
    } else {
      createProposalMutation.mutate({
        data: proposalData,
        status: Status.submitted,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-12">
        {(proposalSubmitError ||
          mutationError ||
          updateSpeakerMutation.error) && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800/50 dark:bg-red-900/20">
              <div className="flex">
                <div className="shrink-0">
                  <XCircleIcon
                    className="h-6 w-6 text-red-500 dark:text-red-400"
                    aria-hidden="true"
                  />
                </div>
                <div className="ml-4">
                  <h3 className="font-space-grotesk text-lg font-semibold text-red-800 dark:text-red-200">
                    Submission failed
                  </h3>
                  <div className="font-inter mt-2 text-red-700 dark:text-red-300">
                    {proposalSubmitError && <p>{proposalSubmitError}</p>}
                    {mutationError && <p>{mutationError.message}</p>}
                    {updateSpeakerMutation.error && (
                      <p>{updateSpeakerMutation.error.message}</p>
                    )}
                    {validationErrors.length > 0 && (
                      <ul className="font-inter mt-2 list-inside list-disc text-sm text-red-700 dark:text-red-300">
                        {validationErrors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        <ProposalDetailsForm
          proposal={proposal}
          setProposal={setProposal}
          conference={conference}
          allowedFormats={allowedFormats}
          readOnly={isReadOnly}
        />
        {mode === 'user' && !isReadOnly && (
          <>
            <div className="border-b border-brand-frosted-steel pb-12">
              <ProposalCoSpeaker
                selectedSpeakers={coSpeakers}
                onSpeakersChange={setCoSpeakers}
                format={proposal.format}
                proposalId={proposalId}
                pendingInvitations={coSpeakerInvitations}
                onInvitationSent={handleInvitationSent}
                onInvitationCanceled={handleInvitationCanceled}
              />
            </div>
            <SpeakerDetailsForm
              speaker={speaker}
              setSpeaker={setSpeaker}
              email={userEmail}
              emails={emails}
            />
          </>
        )}
        {isReadOnly && (
          <div className="space-y-6 border-t border-gray-200 pt-6 dark:border-gray-600">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Speakers
              </h3>
              <div className="mt-4 space-y-3">
                {proposal.speakers &&
                  Array.isArray(proposal.speakers) &&
                  proposal.speakers.length > 0 ? (
                  proposal.speakers.map((speaker, index) => {
                    if (
                      typeof speaker === 'object' &&
                      speaker &&
                      '_id' in speaker
                    ) {
                      return (
                        <div
                          key={speaker._id || index}
                          className="flex items-center gap-3 text-sm"
                        >
                          <span className="font-medium text-gray-900 dark:text-white">
                            {speaker.name}
                          </span>
                          {speaker.email && (
                            <span className="text-gray-600 dark:text-gray-400">
                              ({speaker.email})
                            </span>
                          )}
                        </div>
                      )
                    }
                    return null
                  })
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No speakers listed
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {mode === 'user' && !isReadOnly && (
        <div className="mt-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold">Note:</span> Don&apos;t worry. You
            will be able to edit your proposal after you have submitted it.
            Simply navigate to the{' '}
            <Link
              href="/cfp"
              className="text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover dark:text-blue-400 dark:hover:text-blue-300"
            >
              CFP page
            </Link>{' '}
            or click on your avatar in the top right corner of the page to
            access your proposals.
          </p>
        </div>
      )}

      {!isReadOnly && (
        <div className="mt-6 flex items-center justify-end gap-x-6">
          <Link
            href="/cfp"
            type="button"
            className="text-sm leading-6 font-semibold text-gray-600 transition-colors hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
          >
            Cancel
          </Link>
          {mode === 'user' && isDraft && (
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isMutating}
              className="font-space-grotesk cursor-pointer rounded-xl bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors ring-inset hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-600 dark:focus-visible:outline-gray-500"
            >
              {(createProposalMutation.isPending ||
                updateProposalMutation.isPending) &&
                lastAction === 'draft'
                ? 'Saving...'
                : 'Save Draft'}
            </button>
          )}
          <button
            type="submit"
            disabled={isMutating}
            className="font-space-grotesk cursor-pointer rounded-xl bg-brand-cloud-blue px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:outline-blue-500"
          >
            {(createProposalMutation.isPending ||
              updateProposalMutation.isPending ||
              updateSpeakerMutation.isPending) &&
              lastAction === 'submit'
              ? buttonPrimaryLoading
              : buttonPrimary}
          </button>
        </div>
      )}
    </form>
  )
}
