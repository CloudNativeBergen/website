'use client'

import { Conference } from '@/lib/conference/types'
import {
  getEmails,
  postImage,
  putEmail,
  putProfile,
} from '@/lib/profile/client'
import { ProfileEmail } from '@/lib/profile/types'
import { postProposal } from '@/lib/proposal/client'
import {
  addCoSpeaker,
  getCoSpeakers,
  removeCoSpeaker,
  sendCoSpeakerInvite,
} from '@/lib/proposal/co-speaker-client'
import {
  Audience,
  audiences as audiencesMap,
  CoSpeakerInvitation,
  CoSpeakerInvitationStatus,
  Format,
  formats,
  FormError,
  Language,
  languages,
  Level,
  levels,
  ProposalInput,
} from '@/lib/proposal/types'
import { Flags, Speaker, SpeakerInput } from '@/lib/speaker/types'
import { isValidEmail, normalizeEmail } from '@/lib/proposal/validation'
import { Topic } from '@/lib/topic/types'
import {
  UserCircleIcon,
  XCircleIcon,
  UserGroupIcon,
  EnvelopeIcon,
  PlusCircleIcon,
  MinusCircleIcon,
  ClockIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid'
import { PortableTextBlock } from '@portabletext/editor'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Checkbox,
  Dropdown,
  ErrorText,
  HelpText,
  Input,
  LinkInput,
  Multiselect,
  Textarea,
} from './Form'
import { PortableTextEditor } from './PortableTextEditor'
import Link from 'next/link'

export function ProposalForm({
  initialProposal,
  initialSpeaker,
  proposalId,
  userEmail,
  conference,
  allowedFormats,
}: {
  initialProposal: ProposalInput
  initialSpeaker: SpeakerInput
  proposalId?: string
  userEmail: string
  conference: Conference
  allowedFormats: Format[]
}) {
  const [proposal, setProposal] = useState(initialProposal)
  const [speaker, setSpeaker] = useState(initialSpeaker)
  const [coSpeakers, setCoSpeakers] = useState<Speaker[]>([])
  const [coSpeakerInvitations, setCoSpeakerInvitations] = useState<CoSpeakerInvitation[]>([])
  const [pendingCoSpeakerEmails, setPendingCoSpeakerEmails] = useState<string[]>([])

  const buttonPrimary = proposalId ? 'Update' : 'Submit'
  const buttonPrimaryLoading = proposalId ? 'Updating...' : 'Submitting...'

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [proposalSubmitError, setProposalSubmitError] = useState(
    {} as FormError,
  )

  const [emails, setEmails] = useState<ProfileEmail[]>([])
  
  // Fetch emails on mount
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

  // Fetch co-speakers if editing existing proposal
  useEffect(() => {
    if (proposalId) {
      fetchCoSpeakers()
    }
  }, [proposalId])

  const fetchCoSpeakers = async () => {
    if (!proposalId) return
    
    const res = await getCoSpeakers(proposalId)
    if (!res.error && res.coSpeakers) {
      setCoSpeakers(res.coSpeakers)
    }
    // Also fetch invitations from the proposal data if available
    // This would come from the initial proposal data
    if (initialProposal.coSpeakerInvitations) {
      setCoSpeakerInvitations(initialProposal.coSpeakerInvitations)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)

    const proposalRes = await postProposal(
      proposal,
      proposalId,
      !proposalId ? pendingCoSpeakerEmails : undefined
    )
    if (proposalRes.error) {
      setProposalSubmitError(proposalRes.error)
      setIsSubmitting(false)
      window.scrollTo(0, 0)
    }

    const speakerRes = await putProfile(speaker)
    if (speakerRes.error) {
      setProposalSubmitError(speakerRes.error)
      setIsSubmitting(false)
      window.scrollTo(0, 0)
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
        <CoSpeakersSection
          proposalId={proposalId}
          format={proposal.format || Format.lightning_10}
          coSpeakers={coSpeakers}
          coSpeakerInvitations={coSpeakerInvitations}
          onUpdate={fetchCoSpeakers}
          pendingInvites={pendingCoSpeakerEmails}
          onPendingInvitesChange={setPendingCoSpeakerEmails}
        />
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

function SpeakerDetailsForm({
  speaker,
  setSpeaker,
  email,
  emails,
}: {
  speaker: SpeakerInput
  setSpeaker: (speaker: SpeakerInput) => void
  email: string
  emails: ProfileEmail[]
}) {
  const [speakerName, setSpeakerName] = useState(speaker?.name ?? '')
  const [speakerTitle, setSpeakerTitle] = useState(speaker?.title ?? '')
  const [speakerBio, setSpeakerBio] = useState(speaker?.bio ?? '')
  const [speakerEmail, setSpeakerEmail] = useState(email)
  const [speakerImage, setSpeakerImage] = useState(speaker?.image ?? '')
  const [speakerFlags, setSpeakerFlags] = useState(speaker?.flags ?? [])
  const [speakerLinks, setSpeakerLinks] = useState(
    speaker?.links?.length ? speaker.links : [''],
  )

  const [imageError, setImageError] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const emailOptions = new Map(
    emails.map((email) => [email.email, email.email]),
  )

  function updateSpeakerFlag(flag: Flags, value: boolean) {
    if (value) {
      setSpeakerFlags([...speakerFlags, flag])
    } else {
      setSpeakerFlags(speakerFlags.filter((f) => f !== flag))
    }
  }

  function updateSpeakerLink(i: number, val: string) {
    setSpeakerLinks(
      speakerLinks.map((link, index) => (index === i ? val : link)),
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function addSpeakerLink(i: number) {
    setSpeakerLinks([...speakerLinks, ''])
  }

  function removeSpeakerLink(i: number) {
    const links = speakerLinks.filter((link, index) => index !== i)
    if (links.length === 0) {
      links.push('')
    }
    setSpeakerLinks(links)
  }

  async function imageUploadHandler(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true)
      const { error, image } = await postImage(e.target.files[0])

      if (error) {
        setImageError(error.message)
      } else if (image) {
        setSpeakerImage(image.image)
      }

      setIsUploading(false)
    }
  }

  async function emailSelectHandler(email: string) {
    const res = await putEmail(email)
    if (res.error) {
      // @TODO: display error message
      console.error('Error updating email', res.error)
    } else {
      setSpeakerEmail(email)
    }
  }

  useEffect(() => {
    const links = speakerLinks.filter((link) => link.length > 0)

    setSpeaker({
      name: speakerName,
      title: speakerTitle,
      bio: speakerBio,
      flags: speakerFlags,
      links,
    })
  }, [
    speakerName,
    speakerTitle,
    speakerBio,
    speakerFlags,
    speakerLinks,
    setSpeaker,
  ])

  return (
    <div className="border-b border-brand-frosted-steel pb-12">
      <h2 className="font-space-grotesk text-lg leading-7 font-semibold text-brand-slate-gray">
        Speaker Information
      </h2>
      <p className="font-inter mt-1 text-sm leading-6 text-brand-cloud-gray">
        We need information about you as the speaker.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
        <div className="sm:col-span-4">
          <Input
            name="speaker_name"
            label="Name"
            value={speakerName}
            setValue={setSpeakerName}
          />
        </div>

        <div className="sm:col-span-4">
          <Input
            name="speaker_title"
            label="Title or affiliation"
            value={speakerTitle}
            setValue={setSpeakerTitle}
          />
        </div>

        <div className="col-span-full">
          <Textarea
            name="speaker_bio"
            label="Bio"
            rows={3}
            value={speakerBio}
            setValue={setSpeakerBio}
          />
          <HelpText>
            This is what will be displayed to the audience on the conference
            website. It should provide information about you as a speaker and
            your expertise.
          </HelpText>
        </div>

        <div className="sm:col-span-4">
          <Dropdown
            name="speaker_email"
            label="Email address"
            value={speakerEmail}
            setValue={emailSelectHandler}
            options={emailOptions}
          />
          <HelpText>
            Your email address will not be displayed publicly. It will only be
            used to contact you regarding your presentation.
          </HelpText>
        </div>

        <div className="col-span-full">
          <label
            htmlFor="photo"
            className="font-space-grotesk block text-sm leading-6 font-medium text-brand-slate-gray"
          >
            Photo
          </label>
          <div className="mt-2 flex items-center gap-x-3">
            {speakerImage ? (
              <Image
                src={`${speakerImage}?w=96&h=96&fit=crop`}
                alt="Speaker Image"
                width={48}
                height={48}
                className="h-12 w-12 rounded-full"
              />
            ) : (
              <UserCircleIcon
                className="h-12 w-12 text-gray-300"
                aria-hidden="true"
              />
            )}
            <input
              type="file"
              id="photo"
              className="sr-only"
              accept="image/*"
              onChange={imageUploadHandler}
            />
            {isUploading ? (
              <div className="flex items-center gap-x-2">
                <div className="h-5 w-5 animate-spin rounded-full border-t-2 border-b-2 border-brand-cloud-blue"></div>
                <p className="font-inter text-sm leading-6 font-medium text-brand-slate-gray">
                  Uploading...
                </p>
              </div>
            ) : (
              <label htmlFor="photo" className="cursor-pointer">
                <span className="font-inter text-sm leading-6 font-medium text-brand-cloud-blue hover:text-brand-cloud-blue-hover">
                  Upload Photo
                </span>
              </label>
            )}
          </div>
          {imageError ? (
            <ErrorText>{imageError}</ErrorText>
          ) : (
            <HelpText>
              Your photo will be displayed on the conference website.
            </HelpText>
          )}
        </div>

        <div className="sm:col-span-4">
          <fieldset>
            <legend className="font-space-grotesk text-sm leading-6 font-semibold text-brand-slate-gray">
              Social profiles and links
            </legend>
            <HelpText>
              Provide links to your social profiles, personal website or other
              relevant links you want to share with the audience.
            </HelpText>
            <div className="mt-6 space-y-6">
              {speakerLinks.map((link, index) => (
                <LinkInput
                  index={index}
                  key={`speaker_link_${index} `}
                  name={`speaker_link_${index} `}
                  value={link}
                  update={updateSpeakerLink}
                  remove={removeSpeakerLink}
                  add={addSpeakerLink}
                />
              ))}
            </div>
          </fieldset>
        </div>

        <div className="col-span-full">
          <fieldset>
            <legend className="font-space-grotesk text-sm leading-6 font-semibold text-brand-slate-gray">
              Speaker Details
            </legend>
            <div className="mt-6 space-y-6">
              <Checkbox
                name="local"
                label="I am a local speaker"
                value={speakerFlags.includes(Flags.localSpeaker)}
                setValue={(value: boolean) =>
                  updateSpeakerFlag(Flags.localSpeaker, value)
                }
              >
                <HelpText>
                  Please indicate if you are a local speaker to help us promote
                  local talent.
                </HelpText>
              </Checkbox>

              <Checkbox
                name="first-time"
                label="I am a first time speaker"
                value={speakerFlags.includes(Flags.firstTimeSpeaker)}
                setValue={(value: boolean) =>
                  updateSpeakerFlag(Flags.firstTimeSpeaker, value)
                }
              >
                <HelpText>
                  We encourage new speakers to submit to this conference and
                  will provide support and guidance if needed.
                </HelpText>
              </Checkbox>

              <Checkbox
                name="diverse"
                label="I am from an underrepresented group"
                value={speakerFlags.includes(Flags.diverseSpeaker)}
                setValue={(value: boolean) =>
                  updateSpeakerFlag(Flags.diverseSpeaker, value)
                }
              >
                <HelpText>
                  We are committed to increase diversity among our selected
                  speakers.
                </HelpText>
              </Checkbox>

              <Checkbox
                name="requires-funding"
                label="I require funding to attend the conference"
                value={speakerFlags.includes(Flags.requiresTravelFunding)}
                setValue={(value: boolean) =>
                  updateSpeakerFlag(Flags.requiresTravelFunding, value)
                }
              >
                <HelpText>
                  If you require funding to attend the conference, please
                  indicate it here.
                </HelpText>
              </Checkbox>
            </div>
          </fieldset>
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

function CoSpeakersSection({
  proposalId,
  format,
  coSpeakers,
  coSpeakerInvitations,
  onUpdate,
  pendingInvites,
  onPendingInvitesChange,
}: {
  proposalId?: string
  format: Format
  coSpeakers?: Speaker[]
  coSpeakerInvitations?: CoSpeakerInvitation[]
  onUpdate: () => void
  pendingInvites?: string[]
  onPendingInvitesChange?: (emails: string[]) => void
}) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [speakerError, setSpeakerError] = useState('')

  const canHaveCoSpeakers = format !== Format.lightning_10

  async function handleInvite() {
    if (!inviteName.trim()) {
      setInviteError('Please enter the co-speaker\'s name')
      return
    }

    if (!isValidEmail(inviteEmail)) {
      setInviteError('Please enter a valid email address')
      return
    }

    const normalizedEmail = normalizeEmail(inviteEmail)

    // If we don't have a proposalId yet, collect emails for later
    if (!proposalId) {
      if (pendingInvites && onPendingInvitesChange) {
        // Check if email is already in pending invites
        if (pendingInvites.includes(normalizedEmail)) {
          setInviteError('This email is already in the list')
          return
        }
        // Store both name and email for pending invites
        onPendingInvitesChange([...pendingInvites, `${inviteName.trim()}:${normalizedEmail}`])
        setInviteEmail('')
        setInviteName('')
        setInviteError('')
      }
      return
    }

    setIsInviting(true)
    setInviteError('')

    const res = await sendCoSpeakerInvite(proposalId, normalizedEmail, inviteName.trim())
    
    if (res.error) {
      setInviteError(res.error.message)
    } else {
      setInviteEmail('')
      setInviteName('')
      onUpdate()
    }
    
    setIsInviting(false)
  }

  function handleRemovePendingInvite(email: string) {
    if (pendingInvites && onPendingInvitesChange) {
      onPendingInvitesChange(pendingInvites.filter(e => e !== email))
    }
  }

  async function handleRemoveCoSpeaker(speakerId: string) {
    if (!proposalId) return

    const res = await removeCoSpeaker(proposalId, speakerId)
    if (res.error) {
      setSpeakerError(res.error.message)
    } else {
      onUpdate()
    }
  }

  if (!canHaveCoSpeakers) {
    return null
  }

  return (
    <div className="border-b border-brand-frosted-steel pb-12">
      <h2 className="font-space-grotesk text-lg leading-7 font-semibold text-brand-slate-gray flex items-center gap-2">
        <UserGroupIcon className="h-5 w-5" />
        Co-Speakers
      </h2>
      <p className="font-inter mt-1 text-sm leading-6 text-brand-cloud-gray">
        {proposalId
          ? 'Invite other speakers to present with you. They will receive an email invitation.'
          : 'Add co-speaker emails below. Invitations will be sent after you submit the proposal.'
        }
      </p>

      {speakerError && (
        <div className="mt-4 rounded-md bg-red-50 p-4">
          <div className="flex">
            <XCircleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
            <div className="ml-3">
              <p className="font-inter text-sm text-red-800">{speakerError}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {/* Existing Co-Speakers */}
        {coSpeakers && coSpeakers.length > 0 && (
          <div>
            <h3 className="font-inter text-sm font-medium text-brand-slate-gray mb-3">
              Current Co-Speakers
            </h3>
            <div className="space-y-3">
              {coSpeakers.map((speaker) => (
                <div
                  key={speaker._id}
                  className="flex items-center justify-between rounded-lg border border-brand-frosted-steel bg-white p-4"
                >
                  <div className="flex items-center gap-3">
                    {speaker.image ? (
                      <Image
                        src={`${speaker.image}?w=48&h=48&fit=crop`}
                        alt={speaker.name}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-full"
                      />
                    ) : (
                      <UserCircleIcon className="h-12 w-12 text-gray-300" />
                    )}
                    <div>
                      <p className="font-space-grotesk font-medium text-brand-slate-gray">
                        {speaker.name}
                      </p>
                      {speaker.title && (
                        <p className="font-inter text-sm text-brand-cloud-gray">
                          {speaker.title}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCoSpeaker(speaker._id)}
                    className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                  >
                    <MinusCircleIcon className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Invitations */}
        {coSpeakerInvitations && coSpeakerInvitations.length > 0 && (
          <div>
            <h3 className="font-inter text-sm font-medium text-brand-slate-gray mb-3">
              Co-Speaker Invitations
            </h3>
            <div className="space-y-3">
              {coSpeakerInvitations.map((invitation) => (
                <div
                  key={invitation.email}
                  className={`flex items-center justify-between rounded-lg border p-4 ${
                    invitation.status === CoSpeakerInvitationStatus.pending
                      ? 'border-brand-frosted-steel bg-brand-arctic-mist'
                      : invitation.status === CoSpeakerInvitationStatus.accepted
                      ? 'border-green-200 bg-green-50'
                      : invitation.status === CoSpeakerInvitationStatus.rejected
                      ? 'border-red-200 bg-red-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {invitation.status === CoSpeakerInvitationStatus.accepted ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-600" />
                    ) : invitation.status === CoSpeakerInvitationStatus.rejected ? (
                      <XCircleIcon className="h-5 w-5 text-red-600" />
                    ) : invitation.status === CoSpeakerInvitationStatus.expired ? (
                      <ClockIcon className="h-5 w-5 text-gray-500" />
                    ) : (
                      <EnvelopeIcon className="h-5 w-5 text-brand-cloud-gray" />
                    )}
                    <div>
                      <p className="font-inter text-sm text-brand-slate-gray">
                        {invitation.name ? (
                          <>
                            <span className="font-medium">{invitation.name}</span>
                            <span className="text-brand-cloud-gray"> ({invitation.email})</span>
                          </>
                        ) : (
                          invitation.email
                        )}
                      </p>
                      <p className="font-inter text-xs text-brand-cloud-gray flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        Sent {new Date(invitation.invitedAt).toLocaleDateString()}
                        {invitation.respondedAt && (
                          <> • Responded {new Date(invitation.respondedAt).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </div>
                  {invitation.status === CoSpeakerInvitationStatus.pending ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                      <ClockIcon className="h-3 w-3" />
                      Pending
                    </span>
                  ) : invitation.status === CoSpeakerInvitationStatus.accepted ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      <CheckCircleIcon className="h-3 w-3" />
                      Accepted
                    </span>
                  ) : invitation.status === CoSpeakerInvitationStatus.rejected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                      <XCircleIcon className="h-3 w-3" />
                      Declined
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                      <ClockIcon className="h-3 w-3" />
                      Expired
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Invitations (before proposal is saved) */}
        {!proposalId && pendingInvites && pendingInvites.length > 0 && (
          <div>
            <h3 className="font-inter text-sm font-medium text-brand-slate-gray mb-3">
              Pending Co-Speaker Invitations
            </h3>
            <div className="space-y-3">
              {pendingInvites.map((nameEmail) => {
                const [name, email] = nameEmail.split(':')
                return (
                  <div
                    key={nameEmail}
                    className="flex items-center justify-between rounded-lg border border-brand-frosted-steel bg-brand-arctic-mist p-4"
                  >
                    <div className="flex items-center gap-3">
                      <EnvelopeIcon className="h-5 w-5 text-brand-cloud-gray" />
                      <div>
                        <p className="font-inter text-sm text-brand-slate-gray">
                          <span className="font-medium">{name}</span>
                          <span className="text-brand-cloud-gray"> ({email})</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePendingInvite(nameEmail)}
                      className="text-brand-cloud-gray hover:text-red-600 transition-colors"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                )
              })}
              <p className="font-inter text-xs text-brand-cloud-gray">
                These invitations will be sent after you submit the proposal.
              </p>
            </div>
          </div>
        )}

        {/* Invite New Co-Speaker */}
        <div>
          <h3 className="font-inter text-sm font-medium text-brand-slate-gray mb-3">
            {proposalId ? 'Invite Co-Speaker' : 'Add Co-Speaker'}
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Input
                  name="co_speaker_name"
                  label="Name"
                  value={inviteName}
                  setValue={setInviteName}
                />
              </div>
              <div>
                <Input
                  name="co_speaker_email"
                  label="Email"
                  type="email"
                  value={inviteEmail}
                  setValue={setInviteEmail}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleInvite}
              disabled={!inviteEmail || !inviteName || isInviting || !!coSpeakers?.length}
              className="font-space-grotesk rounded-xl bg-brand-cloud-blue px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
            >
              {isInviting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"></div>
                  {proposalId ? 'Sending...' : 'Adding...'}
                </>
              ) : (
                <>
                  <PlusCircleIcon className="h-4 w-4" />
                  {proposalId ? 'Send Invite' : 'Add Co-Speaker'}
                </>
              )}
            </button>
          </div>
          {inviteError && (
            <ErrorText>{inviteError}</ErrorText>
          )}
          <HelpText>
            {proposalId
              ? 'Enter the name and email address of the person you want to invite as a co-speaker. They will receive an invitation to join your proposal.'
              : 'Enter the name and email address of the person you want to invite as a co-speaker. The invitation will be sent after you submit the proposal.'
            }
          </HelpText>
        </div>
      </div>
    </div>
  )
}
