'use client'

import { useState, useEffect } from 'react'
import { Speaker, Flags } from '@/lib/speaker/types'
import { ExclamationCircleIcon } from '@heroicons/react/24/solid'
import { validateSpeaker } from '@/lib/speaker/validation'
import { useProfile } from '@/hooks/useProfile'

interface SpeakerProfileFormProps {
  speaker: Speaker
}

export function SpeakerProfileForm({ speaker }: SpeakerProfileFormProps) {
  const { updateProfile } = useProfile()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState('')

  // Initialize form data with speaker data directly
  const [formData, setFormData] = useState({
    name: speaker?.name || '',
    title: speaker?.title || '',
    bio: speaker?.bio || '',
    flags: (speaker?.flags || []) as Flags[],
  })

  // Update form when speaker prop changes
  useEffect(() => {
    if (speaker && speaker._id) {
      const newFormData = {
        name: speaker.name || '',
        title: speaker.title || '',
        bio: speaker.bio || '',
        flags: (speaker.flags || []) as Flags[],
      }
      setFormData(newFormData)
    }
  }, [speaker?._id, speaker?.name, speaker?.title, speaker?.bio, speaker?.flags])

  const handleFlagToggle = (flag: Flags) => {
    setFormData((prev) => ({
      ...prev,
      flags: prev.flags.includes(flag)
        ? prev.flags.filter((f) => f !== flag)
        : [...prev.flags, flag],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrors([])
    setSuccessMessage('')

    // Validate input
    const validationErrors = validateSpeaker({
      name: formData.name,
      title: formData.title,
      bio: formData.bio,
      links: speaker.links || [],
      flags: formData.flags,
    })

    if (validationErrors.length > 0) {
      setErrors(validationErrors.map((err) => err.message))
      setIsSubmitting(false)
      return
    }

    try {
      await updateProfile({
        name: formData.name,
        title: formData.title,
        bio: formData.bio,
        flags: formData.flags,
      })

      setSuccessMessage('Profile updated successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      console.error('Error updating profile:', error)
      setErrors([
        error instanceof Error ? error.message : 'Failed to update profile',
      ])
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <ExclamationCircleIcon
                className="h-5 w-5 text-red-400"
                aria-hidden="true"
              />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Please fix the following errors:
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <ul className="list-disc space-y-1 pl-5">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Name Field */}
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700"
        >
          Name *
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none sm:text-sm"
          required
        />
      </div>

      {/* Title Field */}
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-gray-700"
        >
          Title / Job Role
        </label>
        <input
          type="text"
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none sm:text-sm"
          placeholder="e.g. Senior Software Engineer at ACME Corp"
        />
      </div>

      {/* Bio Field */}
      <div>
        <label
          htmlFor="bio"
          className="block text-sm font-medium text-gray-700"
        >
          Bio
        </label>
        <textarea
          id="bio"
          rows={4}
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none sm:text-sm"
          placeholder="Tell us about yourself..."
        />
        <p className="mt-1 text-sm text-gray-500">
          This will be displayed on your public speaker profile.
        </p>
      </div>

      {/* Flags/Checkboxes */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-gray-700">
          Speaker Information
        </legend>

        <div className="flex items-start">
          <div className="flex h-5 items-center">
            <input
              id="local_speaker"
              type="checkbox"
              checked={formData.flags.includes(Flags.localSpeaker)}
              onChange={() => handleFlagToggle(Flags.localSpeaker)}
              className="h-4 w-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
            />
          </div>
          <div className="ml-3">
            <label
              htmlFor="local_speaker"
              className="text-sm font-medium text-gray-700"
            >
              Local speaker
            </label>
            <p className="text-sm text-gray-500">
              I&apos;m based in or near Bergen
            </p>
          </div>
        </div>

        <div className="flex items-start">
          <div className="flex h-5 items-center">
            <input
              id="first_time_speaker"
              type="checkbox"
              checked={formData.flags.includes(Flags.firstTimeSpeaker)}
              onChange={() => handleFlagToggle(Flags.firstTimeSpeaker)}
              className="h-4 w-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
            />
          </div>
          <div className="ml-3">
            <label
              htmlFor="first_time_speaker"
              className="text-sm font-medium text-gray-700"
            >
              First-time speaker
            </label>
            <p className="text-sm text-gray-500">
              Help us provide appropriate support for new speakers
            </p>
          </div>
        </div>

        <div className="flex items-start">
          <div className="flex h-5 items-center">
            <input
              id="travel_funding"
              type="checkbox"
              checked={formData.flags.includes(Flags.requiresTravelFunding)}
              onChange={() => handleFlagToggle(Flags.requiresTravelFunding)}
              className="h-4 w-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
            />
          </div>
          <div className="ml-3">
            <label
              htmlFor="travel_funding"
              className="text-sm font-medium text-gray-700"
            >
              Need travel assistance
            </label>
            <p className="text-sm text-gray-500">
              Let organizers know if you need help with travel expenses
            </p>
          </div>
        </div>

        <div className="flex items-start">
          <div className="flex h-5 items-center">
            <input
              id="diverse_speaker"
              type="checkbox"
              checked={formData.flags.includes(Flags.diverseSpeaker)}
              onChange={() => handleFlagToggle(Flags.diverseSpeaker)}
              className="h-4 w-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
            />
          </div>
          <div className="ml-3">
            <label
              htmlFor="diverse_speaker"
              className="text-sm font-medium text-gray-700"
            >
              Diverse speaker
            </label>
            <p className="text-sm text-gray-500">
              Help us build a diverse and inclusive conference
            </p>
          </div>
        </div>
      </fieldset>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center rounded-md border border-transparent bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-cloud-blue/90 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
              Updating...
            </>
          ) : (
            'Update Profile'
          )}
        </button>
      </div>
    </form>
  )
}
