'use client'

import { useState, useEffect, useRef } from 'react'
import {
  SpeakerInput,
  Flags,
  genderOptions,
  genderPreferToSelfDescribe,
  type Gender,
} from '@/lib/speaker/types'
import { ProfileEmail } from '@/lib/profile/types'
import { useSpeakerImageUpload } from '@/hooks/useSpeakerImageUpload'
import { api } from '@/lib/trpc/client'
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

// Derived purely from the module-level `genderOptions`; allocate once.
const genderOptionsMap = new Map(genderOptions.map((g) => [g, g]))

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
  onEmailSelect?: (email: string) => Promise<void>
  /**
   * WHOSE profile this is, for the tag opt-out only (#1148).
   *
   * `self` (default) AUTOSAVES the checkbox through a narrow mutation and keeps
   * it out of the bulk payload, because `ProposalForm`'s Save Draft never
   * writes the speaker at all.
   *
   * `organizer` cannot autosave somebody else's document, so the value rides
   * the admin payload — but ONLY after a real toggle (a stale cached row must
   * never be replayed over a fresher value), and the control is one-way,
   * because only the speaker may withdraw an opt-out.
   */
  socialTagActor?: 'self' | 'organizer'
  /**
   * Overrides the `self` autosave write, the way `onEmailSelect` overrides the
   * email one. Lets a story or a host exercise the control without a network
   * call; the default is the narrow `speaker.setSocialTagOptOut` mutation.
   */
  onSocialTagOptOutChange?: (value: boolean) => Promise<void>
  /**
   * The opt-out AS THE SERVER HOLDS IT — deliberately a prop of its own rather
   * than a field of `speaker` (#1148).
   *
   * `speaker` is the parent's PENDING BULK PAYLOAD: parents merge this form's
   * partial updates into it and submit the whole object. Anything this form
   * reads from there it has effectively also queued for saving, which is how a
   * withdrawn opt-out came back — the loaded `true` sat in that object and rode
   * the next bulk save. Reading the displayed value from a separate prop breaks
   * that coupling: the checkbox can show the truth without the truth being
   * resubmitted.
   */
  storedSocialTagOptOut?: boolean
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
  onEmailSelect,
  socialTagActor = 'self',
  onSocialTagOptOutChange,
  storedSocialTagOptOut,
}: SpeakerDetailsFormProps) {
  const defaultImageUpload = useSpeakerImageUpload()
  const [speakerName, setSpeakerName] = useState(speaker?.name ?? '')
  const [speakerTitle, setSpeakerTitle] = useState(speaker?.title ?? '')
  const [speakerBio, setSpeakerBio] = useState(speaker?.bio ?? '')
  const [speakerEmail, setSpeakerEmail] = useState(email ?? '')
  const [speakerImage, setSpeakerImage] = useState(speaker?.image ?? '')
  const [imageChanged, setImageChanged] = useState(false)
  const [speakerImagePreviewUrl, setSpeakerImagePreviewUrl] = useState<
    string | null
  >(speaker?.image && speaker.image.startsWith('http') ? speaker.image : null)
  const [speakerFlags, setSpeakerFlags] = useState(speaker?.flags ?? [])
  const [speakerGender, setSpeakerGender] = useState<Gender | ''>(
    speaker?.gender ?? '',
  )
  const [speakerGenderSelfDescribe, setSpeakerGenderSelfDescribe] = useState(
    speaker?.genderSelfDescribe ?? '',
  )
  const [speakerCountry, setSpeakerCountry] = useState(speaker?.country ?? '')
  const [speakerLinks, setSpeakerLinks] = useState(
    speaker?.links?.length ? speaker.links : [''],
  )
  // "Don't tag me in social posts" (#1148). NOT a consent grant, so it is not
  // grouped with the consent checkboxes below — those record permissions the
  // speaker gave, this records one they withheld. Absent means not opted out.
  //
  // `boolean | undefined`, NOT `boolean`, and the difference is the whole
  // safety property. `undefined` means THIS FORM WAS NEVER TOLD, and the emit
  // below then omits the key entirely, so the save says nothing about the
  // opt-out and the writer leaves it alone. Collapsing that to `false` would
  // make a speaker loaded through a projection that does not carry the field —
  // or an admin list row that went stale — submit a WITHDRAWAL nobody asked
  // for, which for the speaker's own save is silent data loss and for an
  // organizer's is a refusal they cannot explain. Any click on the checkbox
  // makes it a boolean, so a real answer is always emitted.
  const [socialTagOptOut, setSocialTagOptOut] = useState<boolean | undefined>(
    storedSocialTagOptOut,
  )
  // Whether the person at the keyboard actually touched the control in this
  // session. An untouched organizer save must send NOTHING: its row comes from
  // a cached list and can be stale, and replaying a stale `true` would restore
  // an opt-out the speaker has since withdrawn — which only they may do.
  const [socialTagTouched, setSocialTagTouched] = useState(false)
  // Whether the control was CLICKED AT ALL this session, which is a different
  // question from whether its value now differs from the loaded one. A save
  // with no click must put nothing in the payload; a click that was undone
  // must put an explicit `undefined` there, to overwrite what the first click
  // already merged into the parent. Omission cannot do the second job.
  const [socialTagInteracted, setSocialTagInteracted] = useState(false)
  const [socialTagSaveState, setSocialTagSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const socialTagMutation = api.speaker.setSocialTagOptOut.useMutation()
  // ONE-WAY for an organizer: they may set an opt-out on a speaker's behalf but
  // never withdraw one, so once it is set the control stops being an action
  // they can take. Without this the form invites a click the server answers
  // with FORBIDDEN, failing the whole profile edit.
  const socialTagLocked =
    socialTagActor === 'organizer' && storedSocialTagOptOut === true

  async function handleSocialTagOptOutChange(next: boolean) {
    setSocialTagOptOut(next)
    // TOUCHED means "differs from what was loaded", not "was clicked".
    //
    // An organizer who ticks this and unticks it again has asked for nothing,
    // but a click-counter would still emit `socialTagOptOut: false` — and if
    // the speaker opted out since that (cached, stale) admin row was read, the
    // server sees an organizer trying to CLEAR an opt-out and refuses the
    // whole profile edit with FORBIDDEN. The organizer cannot explain a
    // refusal for a control they put back.
    //
    // Compared as booleans on purpose: the loaded value is `undefined` when
    // the field is absent, and absent and `false` are the same answer here.
    setSocialTagTouched((next === true) !== (storedSocialTagOptOut === true))
    setSocialTagInteracted(true)
    // An organizer's value travels with the admin save; there is no self-write
    // endpoint for someone else's document.
    if (socialTagActor !== 'self') return

    setSocialTagSaveState('saving')
    try {
      if (onSocialTagOptOutChange) {
        await onSocialTagOptOutChange(next)
      } else {
        await socialTagMutation.mutateAsync({ socialTagOptOut: next })
      }
      setSocialTagSaveState('saved')
    } catch {
      // Put the box back: the stored value did not change, and a checkbox that
      // stays ticked after a failed write is a promise we did not keep.
      setSocialTagOptOut(!next)
      setSocialTagSaveState('error')
    }
  }

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
  const [emailError, setEmailError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const isMounted = useRef(false)
  const previousSpeakerRef = useRef(speaker)
  const updateEmailMutation = api.speaker.updateEmail.useMutation()

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
    setSpeakerBio(speaker?.bio ?? '')
    setSpeakerImage(speaker?.image ?? '')
    setSpeakerImagePreviewUrl(
      speaker?.image && speaker.image.startsWith('http') ? speaker.image : null,
    )
    setSpeakerFlags(speaker?.flags ?? [])
    setSpeakerGender(speaker?.gender ?? '')
    setSpeakerGenderSelfDescribe(speaker?.genderSelfDescribe ?? '')
    setSpeakerCountry(speaker?.country ?? '')
    setSpeakerLinks(speaker?.links?.length ? speaker.links : [''])
    setDataProcessingConsent(speaker?.consent?.dataProcessing?.granted ?? false)
    setMarketingConsent(speaker?.consent?.marketing?.granted ?? false)
    setPublicProfileConsent(speaker?.consent?.publicProfile?.granted ?? false)
    setPhotographyConsent(speaker?.consent?.photography?.granted ?? false)

    previousSpeakerRef.current = speaker
    isMounted.current = true
  }, [speaker, email])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeakerEmail(email ?? '')
  }, [email])

  // RESYNCED ON ITS OWN, deliberately outside the big initialiser above, whose
  // early return fires only when the NAME changes. For the same person that
  // effect never runs again, so a value refreshed from the server — the speaker
  // clearing their opt-out in another tab — would never reach this checkbox.
  // Keyed on the VALUE, so a re-render that changes nothing cannot clobber a
  // toggle in flight.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocialTagOptOut(storedSocialTagOptOut)
    setSocialTagTouched(false)
  }, [storedSocialTagOptOut])

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

      const upload = onImageUpload ?? defaultImageUpload.uploadImage
      try {
        const { assetId, url } = await upload(file)
        setSpeakerImage(assetId)
        setSpeakerImagePreviewUrl(url)
        setImageChanged(true)
      } catch (error) {
        setImageError(
          error instanceof Error ? error.message : 'Failed to upload image',
        )
      }

      setIsUploading(false)
    }
  }

  async function emailSelectHandler(email: string) {
    setEmailError('')

    if (onEmailSelect) {
      try {
        await onEmailSelect(email)
        setSpeakerEmail(email)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to update email'
        setEmailError(errorMessage)
        console.error('Email selection failed:', error)
      }
    } else {
      try {
        await updateEmailMutation.mutateAsync({ email })
        setSpeakerEmail(email)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to update email'
        setEmailError(errorMessage)
        console.error('Email update failed:', error)
      }
    }
  }

  useEffect(() => {
    const links = speakerLinks.filter((link) => link.length > 0)

    const isSelfDescribe = speakerGender === genderPreferToSelfDescribe

    setSpeaker({
      name: speakerName,
      title: speakerTitle,
      bio: speakerBio,
      flags: speakerFlags,
      links,
      // Emit `null` (not `undefined`) when empty so the cleared value survives
      // JSON serialization and is unset in Sanity by updateSpeaker.
      gender: speakerGender || null,
      genderSelfDescribe:
        isSelfDescribe && speakerGenderSelfDescribe
          ? speakerGenderSelfDescribe
          : null,
      country: speakerCountry || null,
      // The SELF path autosaves this field and never puts it here, so a Save
      // Draft that writes only the proposal cannot lose it. The ORGANIZER path
      // sends it only after a real toggle, so an untouched (possibly stale)
      // admin row is never replayed. Either way an omitted key means "no
      // opinion" to the writer, and only `false` withdraws.
      // The organizer path ALWAYS carries the key, and sends `undefined` when
      // the control was not touched or was put back where it was found.
      //
      // Omitting it is not the same as reverting it, because every parent
      // MERGES this object into state it already holds: the first tick emits
      // `true`, that lands in the parent, and a later omission cannot take it
      // back — the save would set an opt-out the organizer had visibly undone.
      // An explicit `undefined` overwrites it, and the input schema strips the
      // key, so the writer still hears "no opinion" and leaves the stored
      // value alone. `false` reaches the server only as a deliberate
      // withdrawal, which it refuses for an organizer anyway.
      ...(socialTagActor === 'organizer' &&
        socialTagInteracted && {
          socialTagOptOut:
            socialTagTouched && typeof socialTagOptOut === 'boolean'
              ? socialTagOptOut
              : undefined,
        }),
      ...(speakerImage && imageChanged && { image: speakerImage }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSpeaker is stable callback prop
  }, [
    speakerName,
    speakerTitle,
    speakerBio,
    speakerFlags,
    speakerGender,
    speakerGenderSelfDescribe,
    speakerCountry,
    speakerLinks,
    socialTagOptOut,
    socialTagTouched,
    socialTagActor,
    speakerImage,
    imageChanged,
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
            name="speaker_country"
            label="Country (optional)"
            value={speakerCountry}
            setValue={setSpeakerCountry}
          />
          <HelpText>
            Your country of residence. Optional, and used only to help
            organizers understand travel needs.
          </HelpText>
        </div>

        <div className="sm:col-span-4">
          <Dropdown
            name="speaker_gender"
            label="Gender (optional)"
            value={speakerGender}
            setValue={(value: string) => setSpeakerGender(value as Gender | '')}
            options={genderOptionsMap}
            placeholder="Select…"
            clearable
          />
          <HelpText>
            Optional. Collected only for aggregate diversity reporting and never
            shown on your public profile.
          </HelpText>
          {speakerGender === genderPreferToSelfDescribe && (
            <div className="mt-4">
              <Input
                name="speaker_gender_self_describe"
                label="Self-describe (optional)"
                value={speakerGenderSelfDescribe}
                setValue={setSpeakerGenderSelfDescribe}
              />
            </div>
          )}
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
            {emailError ? (
              <ErrorText>{emailError}</ErrorText>
            ) : (
              <HelpText>
                Your email address will not be displayed publicly. It will only
                be used to contact you regarding your presentation.
              </HelpText>
            )}
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
              <div className="mt-6 border-t border-brand-frosted-steel pt-6 dark:border-gray-600">
                <Checkbox
                  name="social-tag-opt-out"
                  label="Don't tag me in social posts"
                  value={socialTagOptOut === true}
                  setValue={handleSocialTagOptOutChange}
                  disabled={socialTagLocked || socialTagSaveState === 'saving'}
                >
                  <HelpText>
                    We promote the programme on social media, and we are
                    preparing to <strong>tag (@-mention)</strong> the accounts
                    you list above in posts about you or your talk &mdash; you
                    gave us those links for your public profile and for
                    promotion, and a tag puts the post in your followers&rsquo;
                    feeds so you can reshare it.{' '}
                    <strong>Tagging is not in general use yet.</strong> Tick
                    this box and we never will: your name is written out in
                    plain text instead, in every post not yet published. It
                    changes nothing else about your profile.
                  </HelpText>
                  {socialTagLocked && (
                    <HelpText>
                      This speaker asked not to be tagged. You can set this on
                      someone&rsquo;s behalf, but only they can undo it.
                    </HelpText>
                  )}
                  {/*
                   * A LIVE REGION, mounted for the whole life of the control
                   * rather than only while there is something to say. This
                   * autosave IS the persistence for this checkbox — there is no
                   * save button to confirm it — so a speaker using a screen
                   * reader would otherwise get no confirmation that their
                   * opt-out stuck. A region inserted at the same moment as its
                   * text is unreliably announced; one that is already there and
                   * changes is not. Empty and unstyled when idle, so it adds no
                   * layout.
                   */}
                  {socialTagActor === 'self' && (
                    <div role="status" aria-live="polite">
                      {socialTagSaveState !== 'idle' && (
                        <HelpText>
                          {socialTagSaveState === 'saving' && 'Saving…'}
                          {socialTagSaveState === 'saved' &&
                            'Saved. This applies to every post not yet published.'}
                          {socialTagSaveState === 'error' && (
                            <span className="text-red-600 dark:text-red-400">
                              Could not save that just now &mdash; nothing
                              changed. Please try again.
                            </span>
                          )}
                        </HelpText>
                      )}
                    </div>
                  )}
                </Checkbox>
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
                    ? "I'm based locally or nearby"
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
                  relevant information about our events.
                </HelpText>
              </Checkbox>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  )
}
