'use client'

import { Conference } from '@/lib/conference/types'
import { api } from '@/lib/trpc/client'
import { Format, ProposalInput, ProposalExisting } from '@/lib/proposal/types'
import { SpeakerInput, Speaker } from '@/lib/speaker/types'
import { createReference } from '@/lib/sanity/helpers'
import { ProposalInputSchema } from '@/server/schemas/proposal'
import { XCircleIcon } from '@heroicons/react/24/solid'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { z } from 'zod'
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
}: {
  initialProposal: ProposalInput
  initialSpeaker: SpeakerInput
  proposalId?: string
  userEmail: string
  conference: Conference
  allowedFormats: Format[]
  currentUserSpeaker: Speaker
  mode?: 'user' | 'admin'
  externalSpeakerIds?: string[]
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

  const { data: emails } = api.speaker.getEmails.useQuery(undefined, {
    enabled: mode === 'user',
  })

  const createProposalMutation = api.proposal.create.useMutation({
    onSuccess: () => {
      router.push('/cfp/list?success=true')
    },
  })

  const updateProposalMutation = api.proposal.update.useMutation({
    onSuccess: () => {
      router.push('/cfp/list')
    },
  })

  const updateSpeakerMutation = api.speaker.update.useMutation()

  const buttonPrimary = proposalId ? 'Update' : 'Submit'
  const buttonPrimaryLoading = proposalId ? 'Updating...' : 'Submitting...'

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

  // Get current mutation based on mode
  const proposalMutation = proposalId
    ? updateProposalMutation
    : createProposalMutation

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setProposalSubmitError('')
    setValidationErrors([])

    if (mode === 'user') {
      // Validate speaker consent using shared utility
      const consentErrors = validateSpeakerConsent(speaker)
      if (consentErrors.length > 0) {
        setProposalSubmitError(
          'You must provide required consents to submit your proposal.',
        )
        setValidationErrors(consentErrors)
        window.scrollTo(0, 0)
        return
      }

      // Update speaker profile first
      try {
        await updateSpeakerMutation.mutateAsync(speaker)
      } catch {
        window.scrollTo(0, 0)
        return
      }
    }

    const allSpeakers =
      mode === 'admin' && externalSpeakerIds
        ? externalSpeakerIds
        : [currentUserSpeaker._id, ...coSpeakers.map((s) => s._id)]

    // Prepare proposal data with proper Sanity references
    // Type assertion is safe as the data structure matches ProposalInputSchema
    // and will be validated by tRPC at runtime
    const proposalWithSpeakers = {
      ...proposal,
      speakers: allSpeakers.map(createReference),
    } as z.infer<typeof ProposalInputSchema>

    if (proposalId) {
      updateProposalMutation.mutate({
        id: proposalId,
        data: proposalWithSpeakers,
      })
    } else {
      createProposalMutation.mutate(proposalWithSpeakers)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-12">
        {(proposalSubmitError ||
          proposalMutation.error ||
          updateSpeakerMutation.error) && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800/50 dark:bg-red-900/20">
              <div className="flex">
                <div className="flex-shrink-0">
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
                    {proposalMutation.error && (
                      <p>{proposalMutation.error.message}</p>
                    )}
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
        />
        {mode === 'user' && (
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
      </div>

      {mode === 'user' && (
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

      <div className="mt-6 flex items-center justify-end gap-x-6">
        <Link
          href="/cfp"
          type="button"
          className="text-sm leading-6 font-semibold text-gray-600 transition-colors hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={
            proposalMutation.isPending || updateSpeakerMutation.isPending
          }
          className="font-space-grotesk rounded-xl bg-brand-cloud-blue px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:outline-blue-500"
        >
          {proposalMutation.isPending || updateSpeakerMutation.isPending
            ? buttonPrimaryLoading
            : buttonPrimary}
        </button>
      </div>
    </form>
  )
}
