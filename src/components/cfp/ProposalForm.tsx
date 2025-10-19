'use client'

import { Conference } from '@/lib/conference/types'
import { getEmails, putProfile } from '@/lib/profile/client'
import { ProfileEmail } from '@/lib/profile/types'
import { postProposal } from '@/lib/proposal'
import {
  Format,
  FormError,
  ProposalInput,
  ProposalExisting,
} from '@/lib/proposal/types'
import { SpeakerInput, Speaker } from '@/lib/speaker/types'
import { XCircleIcon } from '@heroicons/react/24/solid'
import { redirect } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ProposalCoSpeaker } from './ProposalCoSpeaker'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'
import Link from 'next/link'
import { SpeakerDetailsForm } from './SpeakerDetailsForm'
import { ProposalDetailsForm } from '@/components/proposal/ProposalDetailsForm'

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

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [proposalSubmitError, setProposalSubmitError] = useState(
    {} as FormError,
  )

  const [emails, setEmails] = useState<ProfileEmail[]>([])
  useEffect(() => {
    if (mode === 'user') {
      const fetchEmails = async () => {
        const emailResponse = await getEmails()
        if (emailResponse.error) {
          setProposalSubmitError(emailResponse.error)
          window.scrollTo(0, 0)
        } else {
          setEmails(emailResponse.emails)
        }
      }
      fetchEmails()
    }
  }, [mode])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)

    if (mode === 'user') {
      if (!speaker.consent?.dataProcessing?.granted) {
        setProposalSubmitError({
          type: 'Validation Error',
          message:
            'You must consent to data processing to submit your proposal.',
          validationErrors: [
            {
              field: 'consent',
              message:
                'Data processing consent is required to submit your speaker application.',
            },
          ],
        })
        setIsSubmitting(false)
        window.scrollTo(0, 0)
        return
      }

      if (!speaker.consent?.publicProfile?.granted) {
        setProposalSubmitError({
          type: 'Validation Error',
          message:
            'You must consent to public profile display to be a conference speaker.',
          validationErrors: [
            {
              field: 'consent',
              message:
                'Public profile consent is required as speakers must be displayed publicly on the conference website.',
            },
          ],
        })
        setIsSubmitting(false)
        window.scrollTo(0, 0)
        return
      }
    }

    const allSpeakers =
      mode === 'admin' && externalSpeakerIds
        ? externalSpeakerIds
        : [currentUserSpeaker._id, ...coSpeakers.map((s) => s._id)]
    const proposalWithSpeakers = {
      ...proposal,
      speakers: allSpeakers.map((id) => ({ _type: 'reference', _ref: id })),
    }

    const proposalRes = await postProposal(proposalWithSpeakers, proposalId)
    if (proposalRes.error) {
      setProposalSubmitError(proposalRes.error)
      setIsSubmitting(false)
      window.scrollTo(0, 0)
      return
    }

    if (mode === 'user') {
      const speakerRes = await putProfile(speaker)
      if (speakerRes.error) {
        setProposalSubmitError(speakerRes.error)
        setIsSubmitting(false)
        window.scrollTo(0, 0)
        return
      }
    }

    if (mode === 'user') {
      if (!proposalRes.error) {
        redirect(`/cfp/list${!proposalId ? '?success=true' : ''}`)
      }
    } else {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-12">
        {proposalSubmitError.type && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <XCircleIcon
                  className="h-6 w-6 text-red-500"
                  aria-hidden="true"
                />
              </div>
              <div className="ml-4">
                <h3 className="font-space-grotesk text-lg font-semibold text-red-800">
                  Submission failed: {proposalSubmitError.type}
                </h3>
                <div className="font-inter mt-2 text-red-700">
                  <p>{proposalSubmitError.message}</p>
                  {proposalSubmitError.validationErrors &&
                    proposalSubmitError.validationErrors.length > 0 && (
                      <ul className="font-inter mt-2 list-inside list-disc text-sm text-red-700">
                        {proposalSubmitError.validationErrors.map((error) => (
                          <li key={error.field}>{error.message}</li>
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
          disabled={isSubmitting}
          className="font-space-grotesk rounded-xl bg-brand-cloud-blue px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:outline-blue-500"
        >
          {isSubmitting ? buttonPrimaryLoading : buttonPrimary}
        </button>
      </div>
    </form>
  )
}
