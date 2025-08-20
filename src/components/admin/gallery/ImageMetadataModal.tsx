'use client'

import { Fragment, useState, useEffect } from 'react'
import Image from 'next/image'
import { Dialog, Transition, Combobox } from '@headlessui/react'
import { XMarkIcon, CheckIcon, ChevronUpDownIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from '../NotificationProvider'
import type { GalleryImageWithSpeakers, GalleryImageWithSpeakers as GalleryImage } from '@/lib/gallery/types'

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

  const { data: searchResults } = api.speakers.search.useQuery(
    { query: speakerQuery, includeFeatured: true },
    { 
      enabled: speakerQuery.length > 0,
    }
  )

  const updateMutation = api.gallery.update.useMutation({
    onSuccess: (updatedImage: GalleryImageWithSpeakers) => {
      showNotification({ title: 'Image updated successfully', type: 'success' })
      onUpdate(updatedImage)
      setIsSubmitting(false)
    },
    onError: (error: Error) => {
      showNotification({ title: error.message || 'Failed to update image', type: 'error' })
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
  }, [image])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    updateMutation.mutate({
      id: image._id,
      ...formData,
      speakers: selectedSpeakers.map(s => s._id),
    })
  }

  const removeSpeaker = (speakerId: string) => {
    setSelectedSpeakers(prev => prev.filter(s => s._id !== speakerId))
  }

  const addSpeaker = (speaker: { _id: string; name: string; slug?: string; image?: string }) => {
    if (!selectedSpeakers.find(s => s._id === speaker._id)) {
      setSelectedSpeakers(prev => [...prev, { ...speaker, slug: speaker.slug || '' }])
    }
    setSpeakerQuery('')
  }

  const filteredSpeakers = searchResults?.filter(
    speaker => !selectedSpeakers.find(s => s._id === speaker._id)
  ) || []

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                <form onSubmit={handleSubmit}>
                  <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                    <div className="flex items-start justify-between">
                      <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                        Edit Image Metadata
                      </Dialog.Title>
                      <button
                        type="button"
                        className="rounded-md bg-white text-gray-400 hover:text-gray-500"
                        onClick={onClose}
                      >
                        <XMarkIcon className="h-6 w-6" />
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        {image.imageUrl && (
                          <div className="relative h-64 w-full overflow-hidden rounded-lg bg-gray-100">
                            <Image
                              src={image.imageUrl}
                              alt={formData.imageAlt}
                              fill
                              className="object-contain"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label htmlFor="photographer" className="block text-sm font-medium text-gray-700">
                          Photographer
                        </label>
                        <input
                          type="text"
                          id="photographer"
                          value={formData.photographer}
                          onChange={(e) => setFormData(prev => ({ ...prev, photographer: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                          Date
                        </label>
                        <input
                          type="date"
                          id="date"
                          value={formData.date}
                          onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                          Location
                        </label>
                        <input
                          type="text"
                          id="location"
                          value={formData.location}
                          onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="imageAlt" className="block text-sm font-medium text-gray-700">
                          Alt Text
                        </label>
                        <input
                          type="text"
                          id="imageAlt"
                          value={formData.imageAlt}
                          onChange={(e) => setFormData(prev => ({ ...prev, imageAlt: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          placeholder="Description for accessibility"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Tag Speakers
                        </label>
                        <Combobox value={null} onChange={(value) => value && addSpeaker(value)}>
                          <div className="relative mt-1">
                            <Combobox.Input
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                              displayValue={() => ''}
                              onChange={(event) => setSpeakerQuery(event.target.value)}
                              placeholder="Search for speakers..."
                              value={speakerQuery}
                            />
                            <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                              <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                            </Combobox.Button>
                            {filteredSpeakers.length > 0 && (
                              <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                {filteredSpeakers.map((speaker) => (
                                  <Combobox.Option
                                    key={speaker._id}
                                    value={speaker}
                                    className={({ active }) =>
                                      `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                        active ? 'bg-indigo-600 text-white' : 'text-gray-900'
                                      }`
                                    }
                                  >
                                    {({ selected, active }) => (
                                      <>
                                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                          {speaker.name}
                                        </span>
                                        {selected && (
                                          <span
                                            className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                              active ? 'text-white' : 'text-indigo-600'
                                            }`}
                                          >
                                            <CheckIcon className="h-5 w-5" />
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </Combobox.Option>
                                ))}
                              </Combobox.Options>
                            )}
                          </div>
                        </Combobox>
                        
                        {selectedSpeakers.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedSpeakers.map((speaker) => (
                              <span
                                key={speaker._id}
                                className="inline-flex items-center gap-x-1 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700"
                              >
                                {speaker.name}
                                <button
                                  type="button"
                                  onClick={() => removeSpeaker(speaker._id)}
                                  className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200"
                                >
                                  <XMarkIcon className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.featured}
                            onChange={(e) => setFormData(prev => ({ ...prev, featured: e.target.checked }))}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">Featured image</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 sm:ml-3 sm:w-auto"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}