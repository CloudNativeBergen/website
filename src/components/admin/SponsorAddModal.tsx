'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react'
import {
  XMarkIcon,
  BuildingOffice2Icon,
  ExclamationTriangleIcon,
  CheckIcon,
  ChevronUpDownIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { ConferenceSponsor } from '@/lib/conference/types'
import {
  SponsorExisting,
  SponsorInput,
  SponsorTierExisting,
} from '@/lib/sponsor/types'
import {
  fetchSponsors,
  createSponsor,
  addSponsorToConference,
} from '@/lib/sponsor/client'
import { InlineSvgPreviewComponent } from '@starefossen/sanity-plugin-inline-svg-input'

interface AddSponsorModalProps {
  isOpen: boolean
  onClose: () => void
  sponsorTiers: SponsorTierExisting[]
  preselectedTierId?: string
  onSponsorAdded: (sponsor: ConferenceSponsor) => void
}

interface SponsorFormData extends SponsorInput {
  tierId: string
}

const DEFAULT_SVG = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#f3f4f6"/>
  <text x="50" y="50" text-anchor="middle" dy="0.3em" font-family="sans-serif" font-size="12" fill="#9ca3af">LOGO</text>
</svg>`

export default function SponsorAddModal({
  isOpen,
  onClose,
  sponsorTiers,
  preselectedTierId,
  onSponsorAdded,
}: AddSponsorModalProps) {
  console.log(
    'Modal component rendered with preselectedTierId:',
    preselectedTierId,
    'isOpen:',
    isOpen,
  )
  const [formData, setFormData] = useState<SponsorFormData>({
    name: '',
    website: '',
    logo: DEFAULT_SVG,
    tierId: '',
  })
  const [selectedSponsor, setSelectedSponsor] =
    useState<SponsorExisting | null>(null)
  const [sponsors, setSponsors] = useState<SponsorExisting[]>([])
  const [filteredSponsors, setFilteredSponsors] = useState<SponsorExisting[]>(
    [],
  )
  const [sponsorQuery, setSponsorQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [isLoadingSponsors, setIsLoadingSponsors] = useState(false)

  // Load sponsors on mount
  useEffect(() => {
    if (isOpen) {
      loadSponsors()
    }
  }, [isOpen])

  // Filter sponsors based on query
  useEffect(() => {
    if (sponsorQuery === '') {
      setFilteredSponsors(sponsors.slice(0, 10)) // Show first 10 by default
    } else {
      const filtered = sponsors.filter((sponsor) =>
        sponsor.name.toLowerCase().includes(sponsorQuery.toLowerCase()),
      )
      setFilteredSponsors(filtered.slice(0, 10))
    }
  }, [sponsorQuery, sponsors])

  // Reset form when modal opens/closes or preselectedTierId changes
  useEffect(() => {
    if (isOpen) {
      const selectedTierId = preselectedTierId || sponsorTiers[0]?._id || ''
      console.log(
        'Modal opened with preselectedTierId:',
        preselectedTierId,
        'selectedTierId:',
        selectedTierId,
      )
      setFormData({
        name: '',
        website: '',
        logo: DEFAULT_SVG,
        tierId: selectedTierId,
      })
      setSelectedSponsor(null)
      setSponsorQuery('')
      setIsCreatingNew(false)
      setError('')
    }
  }, [isOpen, sponsorTiers, preselectedTierId])

  // Update tierId when preselectedTierId changes (even if modal is already open)
  useEffect(() => {
    if (isOpen && preselectedTierId && preselectedTierId !== formData.tierId) {
      console.log(
        'Updating tierId from',
        formData.tierId,
        'to',
        preselectedTierId,
      )
      setFormData((prev) => ({
        ...prev,
        tierId: preselectedTierId,
      }))
    }
  }, [preselectedTierId, isOpen, formData.tierId])

  const loadSponsors = async () => {
    setIsLoadingSponsors(true)
    try {
      const sponsors = await fetchSponsors()
      setSponsors(sponsors)
    } catch (err) {
      console.error('Failed to load sponsors:', err)
      setSponsors([])
    } finally {
      setIsLoadingSponsors(false)
    }
  }

  const handleSponsorSelect = (sponsor: SponsorExisting | null) => {
    setSelectedSponsor(sponsor)
    if (sponsor) {
      setFormData((prev) => ({
        ...prev,
        name: sponsor.name,
        website: sponsor.website,
        logo: sponsor.logo,
      }))
      setIsCreatingNew(false)
    } else {
      setFormData((prev) => ({
        ...prev,
        name: sponsorQuery,
        website: '',
        logo: DEFAULT_SVG,
      }))
      setIsCreatingNew(true)
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.type !== 'image/svg+xml') {
        setError('Please upload an SVG file')
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const svgContent = e.target?.result as string
        setFormData((prev) => ({ ...prev, logo: svgContent }))
      }
      reader.readAsText(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      let sponsorId = selectedSponsor?._id

      // Create new sponsor if needed
      if (isCreatingNew || !sponsorId) {
        const sponsor = await createSponsor({
          name: formData.name,
          website: formData.website,
          logo: formData.logo,
        })
        sponsorId = sponsor._id
      }

      // Add sponsor to conference
      await addSponsorToConference({
        sponsorId,
        tierId: formData.tierId,
      })

      // Find the tier for the added sponsor
      const selectedTier = sponsorTiers.find(
        (tier) => tier._id === formData.tierId,
      )

      // Create the ConferenceSponsor object to pass back
      const addedSponsor: ConferenceSponsor = {
        sponsor: {
          name: formData.name,
          website: formData.website,
          logo: formData.logo,
        },
        tier: {
          title: selectedTier?.title || '',
          tagline: selectedTier?.tagline || '',
        },
      }

      onSponsorAdded(addedSponsor)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Transition show={isOpen}>
      <Dialog className="relative z-50" onClose={onClose}>
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity" />
        </TransitionChild>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-2 text-center sm:items-center sm:p-4">
            <TransitionChild
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="relative w-full max-w-2xl transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:p-6">
                <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                {/* Mobile close button */}
                <div className="absolute top-0 right-0 pt-4 pr-4 sm:hidden">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mt-3 w-full text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <DialogTitle
                      as="h3"
                      className="text-base leading-6 font-semibold text-gray-900 sm:text-lg"
                    >
                      Add Sponsor
                    </DialogTitle>

                    {error && (
                      <div className="mt-4 rounded-md bg-red-50 p-4">
                        <div className="flex">
                          <div className="flex-shrink-0">
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                          </div>
                          <div className="ml-3">
                            <p className="text-sm text-red-800">{error}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <form
                      onSubmit={handleSubmit}
                      className="mt-4 space-y-4 sm:mt-6 sm:space-y-6"
                    >
                      {/* Sponsor Selection */}
                      <div>
                        <label className="block text-sm/6 font-medium text-gray-900">
                          Select Sponsor
                        </label>
                        <div className="mt-2">
                          <Combobox
                            value={selectedSponsor}
                            onChange={handleSponsorSelect}
                          >
                            <div className="relative">
                              <ComboboxInput
                                className="w-full rounded-md bg-white py-1.5 pr-10 pl-3 text-left text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                                displayValue={(
                                  sponsor: SponsorExisting | null,
                                ) => sponsor?.name || sponsorQuery}
                                onChange={(event) =>
                                  setSponsorQuery(event.target.value)
                                }
                                placeholder={
                                  isLoadingSponsors
                                    ? 'Loading...'
                                    : 'Search existing sponsors or type new name'
                                }
                              />
                              <div className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                                <ChevronUpDownIcon
                                  className="h-5 w-5 text-gray-400"
                                  aria-hidden="true"
                                />
                              </div>

                              <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
                                {sponsorQuery !== '' &&
                                  !filteredSponsors.find(
                                    (s) =>
                                      s.name.toLowerCase() ===
                                      sponsorQuery.toLowerCase(),
                                  ) && (
                                    <ComboboxOption
                                      value={null}
                                      className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white"
                                    >
                                      <div className="flex items-center">
                                        <PlusIcon className="h-5 w-5 flex-shrink-0 text-gray-400 group-data-focus:text-white" />
                                        <span className="ml-3 truncate group-data-selected:font-semibold">
                                          Create &quot;{sponsorQuery}&quot;
                                        </span>
                                      </div>
                                    </ComboboxOption>
                                  )}
                                {filteredSponsors.map((sponsor) => (
                                  <ComboboxOption
                                    key={sponsor._id}
                                    value={sponsor}
                                    className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white"
                                  >
                                    <div className="flex items-center">
                                      <div className="h-6 w-6 flex-shrink-0">
                                        {sponsor.logo ? (
                                          <InlineSvgPreviewComponent
                                            className="h-6 w-6"
                                            value={sponsor.logo}
                                          />
                                        ) : (
                                          <BuildingOffice2Icon className="h-6 w-6 text-gray-400" />
                                        )}
                                      </div>
                                      <span className="ml-3 truncate group-data-selected:font-semibold">
                                        {sponsor.name}
                                      </span>
                                    </div>
                                    <span className="absolute inset-y-0 right-0 hidden items-center pr-4 text-indigo-600 group-data-focus:text-white group-data-selected:flex">
                                      <CheckIcon
                                        className="h-5 w-5"
                                        aria-hidden="true"
                                      />
                                    </span>
                                  </ComboboxOption>
                                ))}
                              </ComboboxOptions>
                            </div>
                          </Combobox>
                        </div>
                      </div>

                      {/* Sponsor Details */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8">
                        <div>
                          <label
                            htmlFor="name"
                            className="block text-sm/6 font-medium text-gray-900"
                          >
                            Name *
                          </label>
                          <div className="mt-2">
                            <input
                              type="text"
                              id="name"
                              value={formData.name}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }))
                              }
                              required
                              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                              placeholder="e.g., Acme Corp"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="website"
                            className="block text-sm/6 font-medium text-gray-900"
                          >
                            Website *
                          </label>
                          <div className="mt-2">
                            <input
                              type="url"
                              id="website"
                              value={formData.website}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  website: e.target.value,
                                }))
                              }
                              required
                              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                              placeholder="https://example.com"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Logo Upload */}
                      <div>
                        <label className="block text-sm/6 font-medium text-gray-900">
                          Logo (SVG) *
                        </label>
                        <div className="mt-2 space-y-4">
                          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-x-4">
                            <div className="h-16 w-16 flex-shrink-0 rounded-lg border border-gray-300 bg-gray-50 p-2">
                              <InlineSvgPreviewComponent
                                className="h-full w-full"
                                value={formData.logo}
                              />
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                              <input
                                type="file"
                                accept=".svg,image/svg+xml"
                                onChange={handleFileUpload}
                                className="sr-only"
                                id="logo-upload"
                              />
                              <label
                                htmlFor="logo-upload"
                                className="cursor-pointer rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50"
                              >
                                Upload SVG
                              </label>
                              <p className="mt-1 text-xs text-gray-500">
                                SVG files only. Logo will be displayed at
                                various sizes.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tier Selection */}
                      <div>
                        <label
                          htmlFor="tier"
                          className="block text-sm/6 font-medium text-gray-900"
                        >
                          Sponsor Tier *
                        </label>
                        <div className="mt-2">
                          <div className="grid grid-cols-1">
                            <select
                              id="tier"
                              value={formData.tierId}
                              onChange={(e) => {
                                console.log('Tier changed to:', e.target.value)
                                setFormData((prev) => ({
                                  ...prev,
                                  tierId: e.target.value,
                                }))
                              }}
                              required
                              className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                            >
                              <option value="">Select a tier</option>
                              {sponsorTiers.map((tier) => (
                                <option key={tier._id} value={tier._id}>
                                  {tier.title}
                                </option>
                              ))}
                            </select>
                            <svg
                              fill="none"
                              viewBox="0 0 20 20"
                              strokeWidth={1.5}
                              stroke="currentColor"
                              aria-hidden="true"
                              className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m19.5 8.25-7.5 7.5-7.5-7.5"
                              />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col-reverse gap-3 border-t border-gray-900/10 pt-4 sm:flex-row sm:items-center sm:justify-end sm:gap-x-3 sm:pt-6">
                        <button
                          type="button"
                          onClick={onClose}
                          className="w-full rounded-md px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 hover:text-gray-700 sm:w-auto"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={
                            isSubmitting ||
                            !formData.name ||
                            !formData.website ||
                            !formData.tierId
                          }
                          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          {isSubmitting ? 'Adding...' : 'Add Sponsor'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
