'use client'

import { useState, useEffect, useTransition } from 'react'
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
import {
  createSpeakerAsAdmin,
  updateSpeakerAsAdmin,
} from '@/app/(admin)/admin/speakers/actions'

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
  const [isPending, startTransition] = useTransition()
  const [speakerData, setSpeakerData] = useState<SpeakerInput>({
    name: '',
    bio: '',
    company: '',
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

  useEffect(() => {
    if (isOpen) {
      if (editingSpeaker) {
        setSpeakerData({
          name: editingSpeaker.name || '',
          bio: editingSpeaker.bio || '',
          company: editingSpeaker.company || '',
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
          company: '',
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

  const handleImageUpload = async (
    file: File,
  ): Promise<{ assetId: string; url: string }> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/admin/speaker-image', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to upload image')
    }

    const result = await response.json()
    return result
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!speakerData.name) {
      errors.name = 'Name is required'
    }

    if (!editingSpeaker) {
      if (!email) {
        errors.email = 'Email is required for new speakers'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = 'Please enter a valid email address'
      }
    } else {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = 'Please enter a valid email address'
      }
    }

    if (!speakerData.consent?.dataProcessing?.granted) {
      errors.dataProcessing = 'Data processing consent is required'
    }

    if (!speakerData.consent?.publicProfile?.granted) {
      errors.publicProfile = 'Public profile consent is required'
    }

    return errors
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

    startTransition(async () => {
      try {
        let result
        if (editingSpeaker) {
          result = await updateSpeakerAsAdmin(
            editingSpeaker._id,
            speakerData,
            email,
          )
        } else {
          result = await createSpeakerAsAdmin(speakerData, email)
        }

        if (!result.success) {
          setError(result.error || 'An error occurred')
        } else if (result.speaker) {
          if (editingSpeaker) {
            onSpeakerUpdated?.(result.speaker)
          } else {
            onSpeakerCreated?.(result.speaker)
          }
          onClose()
        }
      } catch (err) {
        console.error('Failed to save speaker:', err)
        setError('Failed to save speaker. Please try again.')
      }
    })
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
                      onImageUpload={handleImageUpload}
                    />

                    {validationErrors.dataProcessing && (
                      <ErrorText>{validationErrors.dataProcessing}</ErrorText>
                    )}
                    {validationErrors.publicProfile && (
                      <ErrorText>{validationErrors.publicProfile}</ErrorText>
                    )}
                  </div>

                  {error && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                      {error}
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
