'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { useTheme } from 'next-themes'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { SpeakerDetailsForm } from '@/components/cfp/SpeakerDetailsForm'
import { Button } from '@/components/Button'
import { Input, ErrorText } from '@/components/Form'
import { SpeakerInput, Speaker } from '@/lib/speaker/types'
import { api } from '@/lib/trpc/client'
import { useQueryClient } from '@tanstack/react-query'
import { validateSpeakerForAdmin } from '@/lib/speaker/validation'
import { useSpeakerImageUpload } from '@/hooks/useSpeakerImageUpload'

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
  const { theme } = useTheme()
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
    <Transition appear show={isOpen}>
      <Dialog
        as="div"
        className={`relative z-10 ${theme === 'dark' ? 'dark' : ''}`}
        onClose={onClose}
      >
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="bg-opacity-25 fixed inset-0 bg-black" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="max-h-[90vh] w-full max-w-3xl transform overflow-hidden rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-6 shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-900">
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
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isPending}
                    >
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
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
