'use client'

import { useState, useEffect, useRef } from 'react'
import { SpeakerInput, Flags } from '@/lib/speaker/types'
import { ProfileEmail } from '@/lib/profile/types'
import { postImage, putEmail } from '@/lib/profile/client'
import { UserCircleIcon } from '@heroicons/react/24/solid'
import Image from 'next/image'
import {
  Input,
  Dropdown,
  Textarea,
  HelpText,
  ErrorText,
  Checkbox,
  LinkInput,
} from '../Form'

interface SpeakerDetailsFormProps {
  speaker: SpeakerInput
  setSpeaker: (speaker: SpeakerInput) => void
  email?: string
  emails?: ProfileEmail[]
  mode?: 'proposal' | 'profile'
  showEmailField?: boolean
  showImageUpload?: boolean
  showLinks?: boolean
  className?: string
  onImageUpload?: (file: File) => Promise<{ assetId: string; url: string }>
}

export function SpeakerDetailsForm({
  speaker,
  setSpeaker,
  email,
  emails = [],
  mode = 'proposal',
  showEmailField = true,
  showImageUpload = true,
  showLinks = true,
  className = '',
  onImageUpload,
}: SpeakerDetailsFormProps) {
  const [speakerName, setSpeakerName] = useState(speaker?.name ?? '')
  const [speakerTitle, setSpeakerTitle] = useState(speaker?.title ?? '')
  const [speakerCompany, setSpeakerCompany] = useState(speaker?.company ?? '')
  const [speakerBio, setSpeakerBio] = useState(speaker?.bio ?? '')
  const [speakerEmail, setSpeakerEmail] = useState(email ?? '')
  const [speakerImage, setSpeakerImage] = useState(speaker?.image ?? '')
  const [speakerImagePreviewUrl, setSpeakerImagePreviewUrl] = useState<
    string | null
  >(speaker?.image && speaker.image.startsWith('http') ? speaker.image : null)
  const [speakerFlags, setSpeakerFlags] = useState(speaker?.flags ?? [])
  const [speakerLinks, setSpeakerLinks] = useState(
    speaker?.links?.length ? speaker.links : [''],
  )

  const [dataProcessingConsent, setDataProcessingConsent] = useState(
    speaker?.consent?.dataProcessing?.granted ?? false,
  )
  const [marketingConsent, setMarketingConsent] = useState(
    speaker?.consent?.marketing?.granted ?? false,
  )
  const [publicProfileConsent, setPublicProfileConsent] = useState(
    speaker?.consent?.publicProfile?.granted ?? false,
  )
  const [photographyConsent, setPhotographyConsent] = useState(
    speaker?.consent?.photography?.granted ?? false,
  )

  const [imageError, setImageError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const isMounted = useRef(false)
  const previousSpeakerRef = useRef(speaker)

  // Initialize local state from props only on mount or when switching speakers
  useEffect(() => {
    // Skip the effect after initial mount if speaker hasn't meaningfully changed
    if (isMounted.current) {
      // Check if we're switching to a different speaker (by comparing key properties)
      const hasSignificantChange =
        previousSpeakerRef.current?.name !== speaker?.name &&
        (speaker?.name || speaker?.bio || speaker?.title)

      if (!hasSignificantChange) {
        return
      }
    }

    setSpeakerName(speaker?.name ?? '')
    setSpeakerTitle(speaker?.title ?? '')
    setSpeakerCompany(speaker?.company ?? '')
    setSpeakerBio(speaker?.bio ?? '')
    setSpeakerImage(speaker?.image ?? '')
    setSpeakerImagePreviewUrl(
      speaker?.image && speaker.image.startsWith('http') ? speaker.image : null
    )
    setSpeakerFlags(speaker?.flags ?? [])
    setSpeakerLinks(speaker?.links?.length ? speaker.links : [''])
    setDataProcessingConsent(
      speaker?.consent?.dataProcessing?.granted ?? false
    )
    setMarketingConsent(speaker?.consent?.marketing?.granted ?? false)
    setPublicProfileConsent(
      speaker?.consent?.publicProfile?.granted ?? false
    )
    setPhotographyConsent(speaker?.consent?.photography?.granted ?? false)

    previousSpeakerRef.current = speaker
    isMounted.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaker?.name, email])

  // Update email when email prop changes
  useEffect(() => {
    setSpeakerEmail(email ?? '')
  }, [email])

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

  function addSpeakerLink() {
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
      setImageError('')

      const file = e.target.files[0]

      if (onImageUpload) {
        try {
          const { assetId, url } = await onImageUpload(file)
          setSpeakerImage(assetId)
          setSpeakerImagePreviewUrl(url)
        } catch (error) {
          setImageError(
            error instanceof Error ? error.message : 'Failed to upload image',
          )
        }
      } else {
        const { error, image } = await postImage(file)
        if (error) {
          setImageError(error.message)
        } else if (image) {
          setSpeakerImage(image.image)
        }
      }

      setIsUploading(false)
    }
  }

  async function emailSelectHandler(email: string) {
    const res = await putEmail(email)
    if (res.error) {
    } else {
      setSpeakerEmail(email)
    }
  }

  useEffect(() => {
    const links = speakerLinks.filter((link) => link.length > 0)

    setSpeaker({
      name: speakerName,
      title: speakerTitle,
      company: speakerCompany,
      bio: speakerBio,
      flags: speakerFlags,
      links,
      ...(speakerImage && { image: speakerImage }),
      consent: {
        dataProcessing: {
          granted: dataProcessingConsent,
          ...(dataProcessingConsent && { grantedAt: new Date().toISOString() }),
        },
        marketing: {
          granted: marketingConsent,
          ...(marketingConsent && { grantedAt: new Date().toISOString() }),
        },
        publicProfile: {
          granted: publicProfileConsent,
          ...(publicProfileConsent && { grantedAt: new Date().toISOString() }),
        },
        photography: {
          granted: photographyConsent,
          ...(photographyConsent && { grantedAt: new Date().toISOString() }),
        },
        privacyPolicyVersion: '2025-09-02',
      },
    })
    // setSpeaker is intentionally omitted from deps to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    speakerName,
    speakerTitle,
    speakerCompany,
    speakerBio,
    speakerFlags,
    speakerLinks,
    speakerImage,
    dataProcessingConsent,
    marketingConsent,
    publicProfileConsent,
    photographyConsent,
  ])

  const isProfileMode = mode === 'profile'
  const sectionClassName = isProfileMode
    ? `${className}`
    : 'border-b border-brand-frosted-steel pb-12 dark:border-gray-600'

  return (
    <div className={sectionClassName}>
      {!isProfileMode && (
        <>
          <h2 className="text-lg leading-7 font-semibold text-gray-900 dark:text-white">
            Speaker Information
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
            We need information about you as the speaker.
          </p>
        </>
      )}

      <div
        className={`${!isProfileMode ? 'mt-10' : ''}grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6`}
      >
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

        <div className="sm:col-span-4">
          <Input
            name="speaker_company"
            label="Company"
            value={speakerCompany}
            setValue={setSpeakerCompany}
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
            {isProfileMode
              ? 'This will be displayed on your public speaker profile.'
              : 'This is what will be displayed to the audience on the conference website. It should provide information about you as a speaker and your expertise.'}
          </HelpText>
        </div>

        {showEmailField && emails.length > 0 && (
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
        )}

        {showImageUpload && (
          <div className="col-span-full">
            <label
              htmlFor="photo"
              className="block text-sm leading-6 font-medium text-gray-900 dark:text-white"
            >
              Photo
            </label>
            <div className="mt-2 flex items-center gap-x-3">
              {speakerImagePreviewUrl || speakerImage ? (
                <Image
                  src={
                    speakerImagePreviewUrl ||
                    (speakerImage.startsWith('http')
                      ? `${speakerImage}?w=96&h=96&fit=crop`
                      : speakerImage)
                  }
                  alt="Speaker Image"
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full"
                />
              ) : (
                <UserCircleIcon
                  className="h-12 w-12 text-gray-300 dark:text-gray-500"
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
                  <div className="h-5 w-5 animate-spin rounded-full border-t-2 border-b-2 border-brand-cloud-blue dark:border-blue-400"></div>
                  <p className="text-sm leading-6 font-medium text-gray-900 dark:text-white">
                    Uploading...
                  </p>
                </div>
              ) : (
                <label htmlFor="photo" className="cursor-pointer">
                  <span className="font-inter text-sm leading-6 font-medium text-brand-cloud-blue hover:text-brand-cloud-blue-hover dark:text-blue-400 dark:hover:text-blue-300">
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
        )}

        {showLinks && (
          <div className="sm:col-span-4">
            <fieldset>
              <legend className="text-sm leading-6 font-semibold text-gray-900 dark:text-white">
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
                    key={`speaker_link_${index}`}
                    name={`speaker_link_${index}`}
                    value={link}
                    update={updateSpeakerLink}
                    remove={removeSpeakerLink}
                    add={addSpeakerLink}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <div className="col-span-full">
          <fieldset>
            <legend className="text-sm leading-6 font-semibold text-gray-900 dark:text-white">
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
                  {isProfileMode
                    ? "I'm based in or near Bergen"
                    : 'Please indicate if you are a local speaker to help us promote local talent.'}
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
                  {isProfileMode
                    ? 'Help us provide appropriate support for new speakers'
                    : 'We encourage new speakers to submit to this conference and will provide support and guidance if needed.'}
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
                  {isProfileMode
                    ? 'Help us build a diverse and inclusive conference'
                    : 'We are committed to increase diversity among our selected speakers.'}
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
                  {isProfileMode
                    ? 'Let organizers know if you need help with travel expenses'
                    : 'If you require funding to attend the conference, please indicate it here.'}
                </HelpText>
              </Checkbox>
            </div>
          </fieldset>

          {/* GDPR Consent Section */}
          <fieldset className="border-t border-gray-200 pt-6 dark:border-gray-700">
            <legend className="sr-only">Privacy and Data Processing</legend>
            <div>
              <h3 className="text-base leading-6 font-semibold text-gray-900 dark:text-white">
                Privacy and Data Processing
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Please review our{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Privacy Policy
                </a>{' '}
                for details on how we handle your data. We process speaker data
                to organize the conference under contract and our legitimate
                interests.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <Checkbox
                name="data-processing-consent"
                label="I have read and understand the Privacy Policy"
                value={dataProcessingConsent}
                setValue={setDataProcessingConsent}
              >
                <HelpText>
                  <span className="text-red-600 dark:text-red-400">
                    Required:
                  </span>{' '}
                  We process speaker data to organize the conference under
                  contract and legitimate interests. Your rights are described
                  in our Privacy Policy.
                </HelpText>
              </Checkbox>

              <Checkbox
                name="public-profile-consent"
                label="I understand my speaker profile will be displayed publicly as part of the programme"
                value={publicProfileConsent}
                setValue={setPublicProfileConsent}
              >
                <HelpText>
                  <span className="text-red-600 dark:text-red-400">
                    Required:
                  </span>{' '}
                  This includes your name, title, bio, photo, and links on the
                  conference website and promotional materials. Public display
                  is necessary for conference speakers.
                </HelpText>
              </Checkbox>

              <Checkbox
                name="photography-consent"
                label="I agree to the Speaker Media Terms"
                value={photographyConsent}
                setValue={setPhotographyConsent}
              >
                <HelpText>
                  Allows us to record, edit, and publish your talk on our
                  official online channels/platforms. You retain your IP; we
                  will credit you and consider reasonable takedown or redaction
                  requests where feasible. Read the{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Speaker Media Terms
                  </a>
                  .
                </HelpText>
              </Checkbox>

              <Checkbox
                name="marketing-consent"
                label="I would like to receive marketing communications about future events"
                value={marketingConsent}
                setValue={setMarketingConsent}
              >
                <HelpText>
                  You can unsubscribe at any time. We&rsquo;ll only send
                  relevant information about Cloud Native Bergen events.
                </HelpText>
              </Checkbox>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  )
}
