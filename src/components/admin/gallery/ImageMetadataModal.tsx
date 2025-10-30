'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
import { useTheme } from 'next-themes'
import {
  XMarkIcon,
  CheckIcon,
  ChevronUpDownIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from '../NotificationProvider'
import type {
  GalleryImageWithSpeakers,
  GalleryImageWithSpeakers as GalleryImage,
} from '@/lib/gallery/types'
import {
  extractDateFromISO,
  extractTimeFromISO,
  updateDateInISO,
  updateTimeInISO,
} from '@/lib/time'

interface ImageMetadataModalProps {
  image: GalleryImage
  isOpen: boolean
  onClose: () => void
  onUpdate: (image: GalleryImageWithSpeakers) => void
}

export function ImageMetadataModal({
  image,
  isOpen,
  onClose,
  onUpdate,
}: ImageMetadataModalProps) {
  const { showNotification } = useNotification()
  const [formData, setFormData] = useState({
    photographer: image.photographer,
    date: image.date,
    location: image.location,
    imageAlt: image.imageAlt || '',
    featured: image.featured,
  })
  const [selectedSpeakers, setSelectedSpeakers] = useState(image.speakers || [])
  const [speakerQuery, setSpeakerQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notifySpeakers, setNotifySpeakers] = useState(false)

  const { data: searchResults } = api.speakers.search.useQuery(
    { query: speakerQuery, includeFeatured: true },
    {
      enabled: speakerQuery.length > 0,
    },
  )

  const updateMutation = api.gallery.update.useMutation({
    onSuccess: (updatedImage: GalleryImageWithSpeakers) => {
      showNotification({ title: 'Image updated successfully', type: 'success' })
      onUpdate(updatedImage)
      setIsSubmitting(false)
    },
    onError: (error) => {
      showNotification({
        title: error.message || 'Failed to update image',
        type: 'error',
      })
      setIsSubmitting(false)
    },
  })

  useEffect(() => {
    setFormData({
      photographer: image.photographer,
      date: image.date,
      location: image.location,
      imageAlt: image.imageAlt || '',
      featured: image.featured,
    })
    setSelectedSpeakers(image.speakers || [])
    setNotifySpeakers(false)
  }, [image])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    updateMutation.mutate({
      id: image._id,
      ...formData,
      speakers: selectedSpeakers.map((s) => s._id),
      notifySpeakers,
    })
  }

  const removeSpeaker = (speakerId: string) => {
    setSelectedSpeakers((prev) => prev.filter((s) => s._id !== speakerId))
  }

  const addSpeaker = (speaker: {
    _id: string
    name: string
    slug?: string
    image?: string
  }) => {
    if (!selectedSpeakers.find((s) => s._id === speaker._id)) {
      setSelectedSpeakers((prev) => [
        ...prev,
        { ...speaker, slug: speaker.slug || '' },
      ])
    }
    setSpeakerQuery('')
  }

  const filteredSpeakers =
    searchResults?.filter(
      (speaker) => !selectedSpeakers.find((s) => s._id === speaker._id),
    ) || []

  const { theme } = useTheme()

  return (
    <Transition appear show={isOpen}>
      <Dialog
        as="div"
        className={`relative z-50 ${theme === 'dark' ? 'dark' : ''}`}
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
              <DialogPanel className="max-h-screen w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-lg dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                    Edit Image Metadata
                  </h3>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:bg-white/10 dark:text-gray-300 dark:hover:text-gray-200"
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <div className="space-y-4">
                    {image.imageUrl && (
                      <div className="relative h-64 w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                        <img
                          src={`${image.imageUrl}?w=1200&q=85&auto=format&fit=max`}
                          alt={formData.imageAlt}
                          className="h-full w-full object-contain"
                        />
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="photographer"
                          className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                        >
                          Photographer
                        </label>
                        <div className="mt-2">
                          <input
                            type="text"
                            id="photographer"
                            value={formData.photographer}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                photographer: e.target.value,
                              }))
                            }
                            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="date"
                            className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                          >
                            Date
                          </label>
                          <div className="mt-2">
                            <input
                              type="date"
                              id="date"
                              value={extractDateFromISO(formData.date)}
                              onChange={(e) => {
                                const newDate = e.target.value
                                  ? updateDateInISO(
                                      formData.date,
                                      e.target.value,
                                    )
                                  : formData.date
                                setFormData((prev) => ({
                                  ...prev,
                                  date: newDate,
                                }))
                              }}
                              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:[color-scheme:dark] dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor="time"
                            className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                          >
                            Time
                          </label>
                          <div className="mt-2">
                            <input
                              type="time"
                              id="time"
                              value={extractTimeFromISO(formData.date)}
                              onChange={(e) => {
                                const timeValue = e.target.value || '00:00'
                                setFormData((prev) => ({
                                  ...prev,
                                  date: updateTimeInISO(
                                    formData.date,
                                    timeValue,
                                  ),
                                }))
                              }}
                              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:[color-scheme:dark] dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="location"
                          className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                        >
                          Location
                        </label>
                        <div className="mt-2">
                          <input
                            type="text"
                            id="location"
                            value={formData.location}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                location: e.target.value,
                              }))
                            }
                            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="imageAlt"
                          className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                        >
                          Alt Text
                        </label>
                        <div className="mt-2">
                          <input
                            type="text"
                            id="imageAlt"
                            value={formData.imageAlt}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                imageAlt: e.target.value,
                              }))
                            }
                            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                            placeholder="Description for accessibility"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                        Tag Speakers
                      </label>
                      <div className="mt-2">
                        <Combobox
                          value={null}
                          onChange={(value) => value && addSpeaker(value)}
                        >
                          <div className="relative">
                            <ComboboxInput
                              className="w-full rounded-md bg-white py-1.5 pr-10 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                              displayValue={() => ''}
                              onChange={(event) =>
                                setSpeakerQuery(event.target.value)
                              }
                              placeholder="Search for speakers..."
                              value={speakerQuery}
                            />
                            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                              <ChevronUpDownIcon
                                className="h-5 w-5 text-gray-400 dark:text-gray-500"
                                aria-hidden="true"
                              />
                            </ComboboxButton>
                            {filteredSpeakers.length > 0 && (
                              <ComboboxOptions className="ring-opacity-5 absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black focus:outline-none sm:text-sm dark:bg-gray-800 dark:ring-gray-700">
                                {filteredSpeakers.map((speaker) => (
                                  <ComboboxOption
                                    key={speaker._id}
                                    value={speaker}
                                    className={({ active }) =>
                                      `relative cursor-default py-2 pr-4 pl-3 select-none ${
                                        active
                                          ? 'bg-indigo-600 text-white'
                                          : 'text-gray-900 dark:text-white'
                                      }`
                                    }
                                  >
                                    {({ selected, active }) => (
                                      <div className="flex items-center gap-3">
                                        {speaker.image ? (
                                          <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                            <img
                                              src={`${speaker.image}?w=64&h=64&q=85&auto=format&fit=crop`}
                                              alt={speaker.name}
                                              className="h-full w-full object-cover"
                                            />
                                          </div>
                                        ) : (
                                          <div
                                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${active ? 'bg-indigo-700' : 'bg-gray-200 dark:bg-gray-700'}`}
                                          >
                                            <span
                                              className={`text-xs font-medium ${active ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}
                                            >
                                              {speaker.name
                                                .charAt(0)
                                                .toUpperCase()}
                                            </span>
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span
                                              className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}
                                            >
                                              {speaker.name}
                                            </span>
                                            {speaker.is_organizer && (
                                              <span
                                                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${active ? 'bg-indigo-700 text-indigo-100' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'}`}
                                              >
                                                Organizer
                                              </span>
                                            )}
                                          </div>
                                          {speaker.title && (
                                            <span
                                              className={`block truncate text-xs ${active ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'}`}
                                            >
                                              {speaker.title}
                                            </span>
                                          )}
                                        </div>
                                        {selected && (
                                          <CheckIcon
                                            className={`h-5 w-5 flex-shrink-0 ${active ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </ComboboxOption>
                                ))}
                              </ComboboxOptions>
                            )}
                          </div>
                        </Combobox>

                        {selectedSpeakers.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedSpeakers.map((speaker) => (
                              <span
                                key={speaker._id}
                                className="inline-flex items-center gap-x-2 rounded-full bg-indigo-100 py-1 pr-2 pl-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400"
                              >
                                {speaker.image ? (
                                  <div className="relative h-5 w-5 flex-shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                    <img
                                      src={`${speaker.image}?w=40&h=40&q=85&auto=format&fit=crop`}
                                      alt={speaker.name}
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-200 dark:bg-indigo-500/20">
                                    <span className="text-[10px] font-medium text-indigo-700 dark:text-indigo-400">
                                      {speaker.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                                <span>{speaker.name}</span>
                                <button
                                  type="button"
                                  onClick={() => removeSpeaker(speaker._id)}
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-500/20"
                                >
                                  <XMarkIcon className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {selectedSpeakers.length > 0 && (
                        <div className="mt-3">
                          <label className="flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={notifySpeakers}
                              onChange={(e) =>
                                setNotifySpeakers(e.target.checked)
                              }
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-indigo-500 dark:focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Send email notification to newly tagged speakers
                            </span>
                          </label>
                          <p className="mt-1 ml-6 text-xs text-gray-500 dark:text-gray-400">
                            Speakers will receive an email letting them know
                            they appear in this photo
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={formData.featured}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              featured: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-indigo-500 dark:focus:ring-indigo-500"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                          Featured image
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-6">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold whitespace-nowrap text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700 dark:focus-visible:outline-indigo-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
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
