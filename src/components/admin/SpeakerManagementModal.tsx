'use client'

import { useState, useEffect } from 'react'
import { DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { SpeakerDetailsForm } from '@/components/cfp/SpeakerDetailsForm'
import { Button } from '@/components/Button'
import { Input, ErrorText } from '@/components/Form'
import { SpeakerInput, Speaker } from '@/lib/speaker/types'
import { api } from '@/lib/trpc/client'
import { useQueryClient } from '@tanstack/react-query'
import { validateSpeakerForAdmin } from '@/lib/speaker/validation'
import { useSpeakerImageUpload } from '@/hooks/useSpeakerImageUpload'
import { ModalShell } from '@/components/ModalShell'

interface SpeakerManagementModalProps {
  isOpen: boolean
  onClose: () => void
  editingSpeaker?: Speaker | null
  onSpeakerCreated?: (speaker: Speaker) => void
  onSpeakerUpdated?: (speaker: Speaker) => void
}

export function SpeakerManagementModal({
  isOpen,
  onClose,
  editingSpeaker,
  onSpeakerCreated,
  onSpeakerUpdated,
}: SpeakerManagementModalProps) {
  const queryClient = useQueryClient()

  const [speakerData, setSpeakerData] = useState<SpeakerInput>({
    name: '',
    bio: '',
    title: '',
    consent: {
      dataProcessing: { granted: false },
      publicProfile: { granted: false },
    },
  })
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({})

  // Custom hook for image upload
  const {
    uploadImage,
    isUploading,
    error: uploadError,
  } = useSpeakerImageUpload({
    speakerId: editingSpeaker?._id,
  })

  // tRPC mutations
  const createMutation = api.speaker.admin.create.useMutation({
    onSuccess: (speaker) => {
      queryClient.invalidateQueries({ queryKey: [['speaker']] })
      onSpeakerCreated?.(speaker)
      onClose()
    },
    onError: (error) => {
      setError(error.message || 'Failed to create speaker')
    },
  })

  const updateMutation = api.speaker.admin.update.useMutation({
    onSuccess: (speaker) => {
      queryClient.invalidateQueries({ queryKey: [['speaker']] })
      onSpeakerUpdated?.(speaker)
      onClose()
    },
    onError: (error) => {
      setError(error.message || 'Failed to update speaker')
    },
  })

  const updateEmailMutation = api.speaker.admin.updateEmail.useMutation({
    onError: (error) => {
      setError(error.message || 'Failed to update email')
    },
  })

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    updateEmailMutation.isPending ||
    isUploading

  useEffect(() => {
    if (isOpen) {
      if (editingSpeaker) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize form from editing speaker
        setSpeakerData({
          name: editingSpeaker.name || '',
          bio: editingSpeaker.bio || '',
          title: editingSpeaker.title || '',
          image: editingSpeaker.image,
          links: editingSpeaker.links,
          consent: editingSpeaker.consent || {
            dataProcessing: { granted: false },
            publicProfile: { granted: false },
          },
        })
        setEmail(editingSpeaker.email || '')
      } else {
        setSpeakerData({
          name: '',
          bio: '',
          title: '',
          consent: {
            dataProcessing: { granted: false },
            publicProfile: { granted: false },
          },
        })
        setEmail('')
      }
      setError(null)
      setValidationErrors({})
    }
  }, [isOpen, editingSpeaker])

  const validateForm = () => {
    return validateSpeakerForAdmin(speakerData, email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setError(null)
    setValidationErrors({})

    if (editingSpeaker) {
      // Update speaker profile
      updateMutation.mutate(
        {
          id: editingSpeaker._id,
          data: speakerData,
        },
        {
          onSuccess: async () => {
            // If email changed, update it separately
            if (email && email !== editingSpeaker.email) {
              updateEmailMutation.mutate({
                id: editingSpeaker._id,
                email,
              })
            }
          },
        },
      )
    } else {
      createMutation.mutate({
        ...speakerData,
        email,
      })
    }
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="3xl"
      className="max-h-[90vh] transform overflow-hidden border border-brand-frosted-steel bg-brand-glacier-white transition-all dark:border-gray-700"
    >
      <div className="mb-6 flex items-start justify-between">
        <DialogTitle className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-white">
          {editingSpeaker ? 'Edit Speaker' : 'Create New Speaker'}
        </DialogTitle>
        <button
          type="button"
          className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          onClick={onClose}
          aria-label="Close"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-h-[calc(90vh-200px)] overflow-y-auto py-6">
          <div className="mb-6">
            <Input
              name="email"
              label="Email Address"
              type="email"
              value={email}
              setValue={setEmail}
            />
            {validationErrors.email && (
              <ErrorText>{validationErrors.email}</ErrorText>
            )}
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              This email will be used to contact the speaker and for
              authentication.
            </p>
          </div>

          <SpeakerDetailsForm
            speaker={speakerData}
            setSpeaker={setSpeakerData}
            email={email}
            emails={[]}
            mode="profile"
            showEmailField={false}
            showImageUpload={true}
            showLinks={true}
            className=""
            onImageUpload={uploadImage}
          />

          {validationErrors.dataProcessing && (
            <ErrorText>{validationErrors.dataProcessing}</ErrorText>
          )}
          {validationErrors.publicProfile && (
            <ErrorText>{validationErrors.publicProfile}</ErrorText>
          )}
        </div>

        {(error || uploadError) && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error || uploadError}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending
              ? editingSpeaker
                ? 'Updating...'
                : 'Creating...'
              : editingSpeaker
                ? 'Update Speaker'
                : 'Create Speaker'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
