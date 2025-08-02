'use client'

import { useState, useEffect } from 'react'
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
}: SpeakerDetailsFormProps) {
  const [speakerName, setSpeakerName] = useState(speaker?.name ?? '')
  const [speakerTitle, setSpeakerTitle] = useState(speaker?.title ?? '')
  const [speakerBio, setSpeakerBio] = useState(speaker?.bio ?? '')
  const [speakerEmail, setSpeakerEmail] = useState(email ?? '')
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
      setImageError('')
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
      ...(speakerImage && { image: speakerImage }),
    })
    // setSpeaker is intentionally omitted from deps to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    speakerName,
    speakerTitle,
    speakerBio,
    speakerFlags,
    speakerLinks,
    speakerImage,
  ])

  const isProfileMode = mode === 'profile'
  const sectionClassName = isProfileMode
    ? `${className}`
    : 'border-b border-brand-frosted-steel pb-12'

  return (
    <div className={sectionClassName}>
      {!isProfileMode && (
        <>
          <h2 className="font-space-grotesk text-lg leading-7 font-semibold text-brand-slate-gray">
            Speaker Information
          </h2>
          <p className="font-inter mt-1 text-sm leading-6 text-brand-cloud-gray">
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
        )}

        {showLinks && (
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
        </div>
      </div>
    </div>
  )
}
