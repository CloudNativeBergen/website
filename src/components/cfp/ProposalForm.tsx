'use client'

import { Conference } from '@/lib/conference/types'
import { getEmails, putProfile } from '@/lib/profile/client'
import { ProfileEmail } from '@/lib/profile/types'
import { postProposal } from '@/lib/proposal'
import {
  Audience,
  audiences as audiencesMap,
  Format,
  formats,
  FormError,
  Language,
  languages,
  Level,
  levels,
  ProposalInput,
  ProposalExisting,
} from '@/lib/proposal/types'
import { SpeakerInput, Speaker } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { XCircleIcon } from '@heroicons/react/24/solid'
import { PortableTextBlock } from '@portabletext/editor'
import { redirect } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Checkbox,
  Dropdown,
  HelpText,
  Input,
  Multiselect,
  Textarea,
} from '../Form'
import { PortableTextEditor } from '../PortableTextEditor'
import { ProposalCoSpeaker } from './ProposalCoSpeaker'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'
import Link from 'next/link'
import { SpeakerDetailsForm } from './SpeakerDetailsForm'

export function ProposalForm({
  initialProposal,
  initialSpeaker,
  proposalId,
  userEmail,
  conference,
  allowedFormats,
  currentUserSpeaker,
}: {
  initialProposal: ProposalInput
  initialSpeaker: SpeakerInput
  proposalId?: string
  userEmail: string
  conference: Conference
  allowedFormats: Format[]
  currentUserSpeaker: Speaker
}) {
  const [proposal, setProposal] = useState(initialProposal)
  const [speaker, setSpeaker] = useState(initialSpeaker)
  // Initialize co-speakers from existing proposal (exclude current user)
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

  // State for co-speaker invitations
  const [coSpeakerInvitations, setCoSpeakerInvitations] = useState<
    CoSpeakerInvitationMinimal[]
  >(
    'coSpeakerInvitations' in initialProposal
      ? (initialProposal as ProposalExisting).coSpeakerInvitations || []
      : [],
  )

  const buttonPrimary = proposalId ? 'Update' : 'Submit'
  const buttonPrimaryLoading = proposalId ? 'Updating...' : 'Submitting...'

  // Handlers for co-speaker invitations
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
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)

    // Create the proposal with speakers array (current user first, then co-speakers)
    const allSpeakers = [currentUserSpeaker, ...coSpeakers]
    const proposalWithSpeakers = {
      ...proposal,
      speakers: allSpeakers.map((s) => ({ _type: 'reference', _ref: s._id })),
    }

    const proposalRes = await postProposal(proposalWithSpeakers, proposalId)
    if (proposalRes.error) {
      setProposalSubmitError(proposalRes.error)
      setIsSubmitting(false)
      window.scrollTo(0, 0)
      return
    }

    const speakerRes = await putProfile(speaker)
    if (speakerRes.error) {
      setProposalSubmitError(speakerRes.error)
      setIsSubmitting(false)
      window.scrollTo(0, 0)
      return
    }

    if (!proposalRes.error && !speakerRes.error) {
      redirect(`/cfp/list${!proposalId ? '?success=true' : ''}`)
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
      </div>

      <div className="mt-6">
        <p className="font-inter text-sm text-brand-slate-gray">
          <span className="font-semibold">Note:</span> Don&apos;t worry. You
          will be able to edit your proposal after you have submitted it. Simply
          navigate to the{' '}
          <Link
            href="/cfp"
            className="text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover"
          >
            CFP page
          </Link>{' '}
          or click on your avatar in the top right corner of the page to access
          your proposals.
        </p>
      </div>

      <div className="mt-6 flex items-center justify-end gap-x-6">
        <Link
          href="/cfp"
          type="button"
          className="font-inter text-sm leading-6 font-semibold text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="font-space-grotesk rounded-xl bg-brand-cloud-blue px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? buttonPrimaryLoading : buttonPrimary}
        </button>
      </div>
    </form>
  )
}

function ProposalDetailsForm({
  proposal,
  setProposal,
  conference,
  allowedFormats,
}: {
  proposal: ProposalInput
  setProposal: (proposal: ProposalInput) => void
  conference: Conference
  allowedFormats: Format[]
}) {
  const [title, setTitle] = useState(proposal?.title ?? '')
  const [language, setLanguage] = useState(
    proposal?.language ?? Language.norwegian,
  )
  const [description, setDescription] = useState(proposal?.description ?? [])
  const [format, setFormat] = useState(proposal?.format ?? Format.lightning_10)
  const [level, setLevel] = useState(proposal?.level ?? Level.beginner)
  const [audiences, setAudiences] = useState<Audience[]>(
    proposal?.audiences ?? [],
  )
  const [topics, setTopics] = useState<Topic[]>(
    Array.isArray(proposal?.topics)
      ? proposal.topics.filter((topic): topic is Topic => '_id' in topic)
      : [],
  )
  const [outline, setOutline] = useState(proposal?.outline ?? '')
  const [tos, setTos] = useState(proposal?.tos ?? false)

  useEffect(() => {
    setProposal({
      title,
      language,
      description,
      format,
      level,
      audiences,
      topics,
      outline,
      tos,
    })
  }, [
    title,
    language,
    description,
    format,
    level,
    audiences,
    topics,
    outline,
    tos,
    setProposal,
  ])

  return (
    <div className="border-b border-brand-frosted-steel pb-12">
      <h2 className="font-space-grotesk text-lg leading-7 font-semibold text-brand-slate-gray">
        Presentation Details
      </h2>
      <p className="font-inter mt-1 text-sm leading-6 text-brand-cloud-gray">
        Please provide the following details about your presentation.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
        <div className="col-span-full">
          <Input name="title" label="Title" value={title} setValue={setTitle} />
        </div>

        <div className="sm:col-span-3">
          <Dropdown
            name="language"
            label="Language"
            value={language}
            setValue={setLanguage}
            options={languages}
          />
        </div>

        <div className="col-span-full">
          <DescriptionField
            description={description}
            setDescription={setDescription}
          />
        </div>

        <div className="sm:col-span-3">
          <Dropdown
            name="format"
            label="Presentation Format"
            value={format}
            setValue={setFormat}
            options={
              new Map(
                Array.from(formats).filter(([key]) =>
                  allowedFormats.includes(key as Format),
                ),
              )
            }
          />
        </div>

        <div className="sm:col-span-3">
          <Dropdown
            name="level"
            label="Skill Level"
            value={level}
            setValue={setLevel}
            options={levels}
          />
        </div>

        <div className="sm:col-span-full">
          <Multiselect
            name="audiences"
            label="Audience"
            maxItems={5}
            placeholder="Select audience"
            options={Array.from(audiencesMap, ([id, title]) => ({ id, title }))}
            value={audiences as string[]}
            setValue={(val: string[]) => setAudiences(val as Audience[])}
          />
        </div>

        <div className="sm:col-span-full">
          <Multiselect
            name="topics"
            label="Topics"
            maxItems={2}
            placeholder="Select topics"
            options={(conference.topics ?? []).map((topic) => ({
              id: topic._id,
              title: topic.title,
              color: topic.color,
            }))}
            value={topics.map((topic) => topic._id)}
            setValue={(val: string[]) => {
              const selectedTopics = val
                .map((id) =>
                  conference.topics?.find((topic) => topic._id === id),
                )
                .filter((topic): topic is Topic => !!topic)
              setTopics(selectedTopics)
            }}
          />
        </div>

        <div className="col-span-full">
          <Textarea
            name="outline"
            label="Outline (not public)"
            rows={3}
            value={outline}
            setValue={setOutline}
          />
          <HelpText>
            Provide a detailed outline of the content of your presentation. How
            do you plan to structure the presentation and what is the expected
            takeaways for the participants. This will only be visible to the
            organizers and not displayed on the website.
          </HelpText>
        </div>

        <div className="col-span-full">
          <Checkbox
            name="tos"
            label="I agree to the Cloud Native Bergen Code of Conduct"
            value={tos}
            setValue={setTos}
          >
            <HelpText>
              You must agree to the{' '}
              <Link
                href="/conduct"
                className="text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover"
              >
                Cloud Native Bergen Code of Conduct
              </Link>{' '}
              to submit your presentation.
            </HelpText>
          </Checkbox>
        </div>
      </div>
    </div>
  )
}

function DescriptionField({
  description,
  setDescription,
}: {
  description: PortableTextBlock[] | undefined
  setDescription: (value: PortableTextBlock[]) => void
}) {
  return (
    <PortableTextEditor
      label="Abstract"
      value={description}
      onChange={setDescription}
      helpText={
        <>
          This is what will be displayed to the audience on the conference
          website. It should make the reader want to attend your presentation.
        </>
      }
    />
  )
}
