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
} from '@/lib/proposal/types'
import { Flags, SpeakerInput } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { UserCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import {
  defineSchema,
  EditorProvider,
  PortableTextBlock,
  PortableTextEditable,
  RenderDecoratorFunction,
  RenderStyleFunction,
  useEditor,
} from '@portabletext/editor'
import { EventListenerPlugin } from '@portabletext/editor/plugins'
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

export function ProposalForm({
  initialProposal,
  initialSpeaker,
  proposalId,
  userEmail,
  conference,
}: {
  initialProposal: ProposalInput
  initialSpeaker: SpeakerInput
  proposalId?: string
  userEmail: string
  conference: Conference
}) {
  const [proposal, setProposal] = useState(initialProposal)
  const [speaker, setSpeaker] = useState(initialSpeaker)

  const buttonPrimary = proposalId ? 'Update' : 'Submit'
  const buttonPrimaryLoading = proposalId ? 'Updating...' : 'Submitting...'

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

    const proposalRes = await postProposal(proposal, proposalId)
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
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <XCircleIcon
                  className="h-5 w-5 text-red-400"
                  aria-hidden="true"
                />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Submission failed: {proposalSubmitError.type}
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{proposalSubmitError.message}</p>
                  {proposalSubmitError.validationErrors &&
                    proposalSubmitError.validationErrors.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-sm text-red-700">
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
        />
        <SpeakerDetailsForm
          speaker={speaker}
          setSpeaker={setSpeaker}
          email={userEmail}
          emails={emails}
        />
      </div>

      <div className="mt-6">
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Note:</span> Don&apos;t worry. You
          will be able to edit your proposal after you have submitted it. Simply
          navigate to the{' '}
          <a
            href="/cfp/list"
            className="text-indigo-500 underline hover:text-indigo-700"
          >
            CFP list
          </a>{' '}
          or click on your avatar in the top right corner of the page to access
          your proposals.
        </p>
      </div>

      <div className="mt-6 flex items-center justify-end gap-x-6">
        <a
          href="/cfp/list"
          type="button"
          className="text-sm leading-6 font-semibold text-gray-900"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
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
}: {
  proposal: ProposalInput
  setProposal: (proposal: ProposalInput) => void
  conference: Conference
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
    <div className="border-b border-gray-900/10 pb-12">
      <h2 className="text-base leading-7 font-semibold text-gray-900">
        Presentation Details
      </h2>
      <p className="mt-1 text-sm leading-6 text-gray-600">
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
            options={new Map(
              Array.from(formats).filter(
                ([key]) => key !== Format.presentation_25 && key !== Format.presentation_45
              )
            )}
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
            label="I agree to the CNCF Code of Conduct"
            value={tos}
            setValue={setTos}
          >
            <HelpText>
              You must agree to the{' '}
              <a
                href={conference.coc_link}
                className="text-indigo-500 underline hover:text-indigo-700"
              >
                CNCF Code of Conduct
              </a>{' '}
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
  const [speakerLinks, setSpeakerLinks] = useState(speaker?.links ?? [''])

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
    <div className="border-b border-gray-900/10 pb-12">
      <h2 className="text-base leading-7 font-semibold text-gray-900">
        Speaker Information
      </h2>
      <p className="mt-1 text-sm leading-6 text-gray-600">
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
            className="block text-sm leading-6 font-medium text-gray-900"
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
                <div className="h-5 w-5 animate-spin rounded-full border-t-2 border-b-2 border-gray-500"></div>
                <p className="text-sm leading-6 font-medium text-gray-900">
                  Uploading...
                </p>
              </div>
            ) : (
              <label htmlFor="photo" className="cursor-pointer">
                <span className="text-sm leading-6 font-medium text-gray-900">
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
            <legend className="text-sm leading-6 font-semibold text-gray-900">
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
            <legend className="text-sm leading-6 font-semibold text-gray-900">
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

// TODO: Generalize portable text editor
const descriptionSchemaDefinition = defineSchema({
  // Decorators are simple marks that don't hold any data
  decorators: [{ name: 'strong' }, { name: 'em' }, { name: 'underline' }],
  // Styles apply to entire text blocks
  // There's always a 'normal' style that can be considered the paragraph style
  styles: [
    { name: 'normal' },
    { name: 'h1' },
    { name: 'h2' },
    { name: 'h3' },
    { name: 'blockquote' },
  ],

  // The types below are left empty for this example.
  // See the rendering guide to learn more about each type.

  // Annotations are more complex marks that can hold data (for example, hyperlinks).
  annotations: [],
  // Lists apply to entire text blocks as well (for example, bullet, numbered).
  lists: [],
  // Inline objects hold arbitrary data that can be inserted into the text (for example, custom emoji).
  inlineObjects: [],
  // Block objects hold arbitrary data that live side-by-side with text blocks (for example, images, code blocks, and tables).
  blockObjects: [],
})

const renderStyle: RenderStyleFunction = (props) => {
  if (props.schemaType.value === 'h1') {
    return (
      <h1 className="text-3xl leading-9 font-bold text-gray-900 sm:text-4xl">
        {props.children}
      </h1>
    )
  }
  if (props.schemaType.value === 'h2') {
    return (
      <h2 className="text-2xl leading-8 text-gray-900 sm:text-3xl">
        {props.children}
      </h2>
    )
  }
  if (props.schemaType.value === 'h3') {
    return (
      <h3 className="text-1xl leading-7 text-gray-900 sm:text-2xl">
        {props.children}
      </h3>
    )
  }
  if (props.schemaType.value === 'blockquote') {
    return <blockquote>{props.children}</blockquote>
  }
  return <>{props.children}</>
}

const renderDecorator: RenderDecoratorFunction = (props) => {
  if (props.value === 'strong') {
    return <strong>{props.children}</strong>
  }
  if (props.value === 'em') {
    return <em>{props.children}</em>
  }
  if (props.value === 'underline') {
    return <u>{props.children}</u>
  }
  return <>{props.children}</>
}

function Toolbar() {
  // useEditor provides access to the PTE
  const editor = useEditor()

  // Iterate over the schema (defined earlier), or manually create buttons.
  const styleButtons = descriptionSchemaDefinition.styles.map((style) => (
    <button
      key={style.name}
      onClick={() => {
        // Send style toggle event
        editor.send({
          type: 'style.toggle',
          style: style.name,
        })
        editor.send({
          type: 'focus',
        })
      }}
    >
      {style.name}
    </button>
  ))

  const decoratorButtons = descriptionSchemaDefinition.decorators.map(
    (decorator) => (
      <button
        key={decorator.name}
        className="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground inline-flex h-9 w-9 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
        onClick={() => {
          // Send decorator toggle event
          editor.send({
            type: 'decorator.toggle',
            decorator: decorator.name,
          })
          editor.send({
            type: 'focus',
          })
        }}
      >
        {decorator.name}
      </button>
    ),
  )
  return (
    <>
      {styleButtons}
      {decoratorButtons}
    </>
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
    <>
      <EditorProvider
        initialConfig={{
          schemaDefinition: descriptionSchemaDefinition,
          initialValue: description,
        }}
      >
        <EventListenerPlugin
          on={(event) => {
            if (event.type === 'mutation') {
              setDescription(event.value ?? [])
            }
          }}
        />

        <Toolbar />
        <PortableTextEditable
          // Add an optional style to see it more easily on the page
          style={{ border: '1px solid black', padding: '0.5em' }}
          renderStyle={renderStyle}
          renderDecorator={renderDecorator}
          renderBlock={(props) => <div>{props.children}</div>}
          renderListItem={(props) => <>{props.children}</>}
        />
      </EditorProvider>

      <HelpText>
        This is what will be displayed to the audience on the conference
        website. It should make the reader want to attend your presentation.
      </HelpText>
    </>
  )
}
