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
  ChevronDownIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import {
  ConferenceSponsorWithContact,
  SponsorExisting,
  SponsorWithContactInfo,
  SponsorInput,
  SponsorTierExisting,
  ContactPerson,
  BillingFormData,
  CONTACT_ROLE_OPTIONS,
} from '@/lib/sponsor/types'
import {
  fetchSponsors,
  createSponsor,
  updateSponsor,
  addSponsorToConference,
} from '@/lib/sponsor/client'
import { InlineSvgPreviewComponent } from '@starefossen/sanity-plugin-inline-svg-input'

interface AddSponsorModalProps {
  isOpen: boolean
  onClose: () => void
  sponsorTiers: SponsorTierExisting[]
  preselectedTierId?: string
  editingSponsor?: ConferenceSponsorWithContact | null
  onSponsorAdded: (sponsor: ConferenceSponsorWithContact) => void
  onSponsorUpdated?: (sponsor: ConferenceSponsorWithContact) => void
}

interface SponsorFormData extends Omit<SponsorInput, 'billing'> {
  tierId: string
  billing?: BillingFormData
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
  editingSponsor,
  onSponsorAdded,
  onSponsorUpdated,
}: AddSponsorModalProps) {
  const [formData, setFormData] = useState<SponsorFormData>({
    name: '',
    website: '',
    logo: DEFAULT_SVG,
    tierId: '',
    org_number: '',
    contact_persons: [],
    billing: {
      email: '',
      reference: '',
      comments: '',
    },
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
  const [hasLoadedSponsors, setHasLoadedSponsors] = useState(false)

  // Load sponsors on mount
  useEffect(() => {
    if (isOpen && !hasLoadedSponsors) {
      const loadSponsors = async () => {
        setIsLoadingSponsors(true)
        try {
          const sponsorsData = await fetchSponsors()
          setSponsors(sponsorsData)
          setHasLoadedSponsors(true)
        } catch (error) {
          console.error('Failed to load sponsors:', error)
        } finally {
          setIsLoadingSponsors(false)
        }
      }
      loadSponsors()
    }
  }, [isOpen, hasLoadedSponsors])

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
      if (editingSponsor) {
        // Editing mode: load existing sponsor data
        const currentTierMatch = sponsorTiers.find(
          (tier) => tier.title === editingSponsor.tier?.title,
        )
        setFormData({
          name: editingSponsor.sponsor.name,
          website: editingSponsor.sponsor.website,
          logo: editingSponsor.sponsor.logo || DEFAULT_SVG,
          tierId: currentTierMatch?._id || sponsorTiers[0]?._id || '',
          org_number: editingSponsor.sponsor.org_number || '',
          contact_persons: editingSponsor.sponsor.contact_persons || [],
          billing: editingSponsor.sponsor.billing || {
            email: '',
            reference: '',
            comments: '',
          },
        })
        setIsCreatingNew(false) // Not creating new, we're editing existing
      } else {
        // Create mode: reset form
        const selectedTierId = preselectedTierId || sponsorTiers[0]?._id || ''
        setFormData({
          name: '',
          website: '',
          logo: DEFAULT_SVG,
          tierId: selectedTierId,
          org_number: '',
          contact_persons: [],
          billing: {
            email: '',
            reference: '',
            comments: '',
          },
        })
        setIsCreatingNew(false)
      }
      setSelectedSponsor(null)
      setSponsorQuery('')
      setError('')
    }
  }, [isOpen, sponsorTiers, preselectedTierId, editingSponsor])

  // Update tierId when preselectedTierId changes (even if modal is already open)
  useEffect(() => {
    if (isOpen && preselectedTierId && preselectedTierId !== formData.tierId) {
      setFormData((prev) => ({
        ...prev,
        tierId: preselectedTierId,
      }))
    }
  }, [preselectedTierId, isOpen, formData.tierId])

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

      // Transform billing data for API
      const billingData = formData.billing?.email
        ? {
            email: formData.billing.email,
            reference: formData.billing.reference,
            comments: formData.billing.comments,
          }
        : undefined

      const sponsorData: SponsorInput = {
        name: formData.name,
        website: formData.website,
        logo: formData.logo,
        org_number: formData.org_number,
        contact_persons: formData.contact_persons,
        billing: billingData,
      }

      if (editingSponsor) {
        // Update existing sponsor
        // We need to get the sponsor ID from the existing sponsor data
        // For this, we need to fetch the sponsor details first to get the ID
        const existingSponsors = await fetchSponsors()
        const existingSponsor = existingSponsors.find(
          (s) => s.name === editingSponsor.sponsor.name,
        )

        if (!existingSponsor) {
          throw new Error('Could not find existing sponsor to update')
        }

        const updatedSponsor = await updateSponsor(
          existingSponsor._id,
          sponsorData,
        )

        // Find the tier for the updated sponsor
        const selectedTier = sponsorTiers.find(
          (tier) => tier._id === formData.tierId,
        )

        // Create the ConferenceSponsorWithContact object to pass back
        const updatedConferenceSponsor: ConferenceSponsorWithContact = {
          sponsor: {
            name: updatedSponsor.name,
            website: updatedSponsor.website,
            logo: updatedSponsor.logo,
            org_number: (updatedSponsor as SponsorWithContactInfo).org_number,
            contact_persons: (updatedSponsor as SponsorWithContactInfo)
              .contact_persons,
            billing: (updatedSponsor as SponsorWithContactInfo).billing,
          },
          tier: {
            title: selectedTier?.title || '',
            tagline: selectedTier?.tagline || '',
            tier_type: selectedTier?.tier_type,
          },
        }

        onSponsorUpdated?.(updatedConferenceSponsor)
      } else {
        // Create new sponsor if needed
        if (isCreatingNew || !sponsorId) {
          const sponsor = await createSponsor(sponsorData)
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

        // Create the ConferenceSponsorWithContact object to pass back
        const addedSponsor: ConferenceSponsorWithContact = {
          sponsor: {
            name: formData.name,
            website: formData.website,
            logo: formData.logo,
            org_number: formData.org_number,
            contact_persons: formData.contact_persons,
            billing: billingData,
          },
          tier: {
            title: selectedTier?.title || '',
            tagline: selectedTier?.tagline || '',
            tier_type: selectedTier?.tier_type,
          },
        }

        onSponsorAdded(addedSponsor)
      }

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
                      {editingSponsor ? 'Edit Sponsor' : 'Add Sponsor'}
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
                      {/* Sponsor Selection - Hidden when editing */}
                      {!editingSponsor && (
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
                      )}

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
                        <div className="mt-2 grid grid-cols-1">
                          <select
                            id="tier"
                            value={formData.tierId}
                            onChange={(e) => {
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
                          <ChevronDownIcon
                            aria-hidden="true"
                            className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                          />
                        </div>
                      </div>

                      {/* Contact Information Section */}
                      <div className="border-t border-gray-200 pt-6">
                        <h4 className="text-base font-semibold text-gray-900">
                          Contact & Billing Information (Optional)
                        </h4>
                        <p className="mt-1 text-sm text-gray-600">
                          This information is only visible to organizers and
                          will not be displayed publicly.
                        </p>

                        {/* Organization Number */}
                        <div className="mt-4">
                          <label
                            htmlFor="org_number"
                            className="block text-sm/6 font-medium text-gray-900"
                          >
                            Organization Number
                          </label>
                          <div className="mt-2">
                            <input
                              type="text"
                              id="org_number"
                              value={formData.org_number || ''}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  org_number: e.target.value,
                                }))
                              }
                              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                              placeholder="Company registration number"
                            />
                          </div>
                        </div>

                        {/* Contact Persons */}
                        <div className="mt-4">
                          <div className="flex items-center justify-between">
                            <label className="block text-sm/6 font-medium text-gray-900">
                              Contact Persons
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const newContact: ContactPerson = {
                                  _key: `contact-${Date.now()}`,
                                  name: '',
                                  email: '',
                                  phone: '',
                                  role: '',
                                }
                                setFormData((prev) => ({
                                  ...prev,
                                  contact_persons: [
                                    ...(prev.contact_persons || []),
                                    newContact,
                                  ],
                                }))
                              }}
                              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            >
                              + Add Contact
                            </button>
                          </div>
                          <div className="mt-2 space-y-3">
                            {formData.contact_persons?.map((contact, index) => (
                              <div
                                key={contact._key}
                                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                              >
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700">
                                      Name *
                                    </label>
                                    <input
                                      type="text"
                                      value={contact.name}
                                      onChange={(e) => {
                                        const updatedContacts = [
                                          ...(formData.contact_persons || []),
                                        ]
                                        updatedContacts[index] = {
                                          ...contact,
                                          name: e.target.value,
                                        }
                                        setFormData((prev) => ({
                                          ...prev,
                                          contact_persons: updatedContacts,
                                        }))
                                      }}
                                      className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
                                      placeholder="Full name"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700">
                                      Email *
                                    </label>
                                    <input
                                      type="email"
                                      value={contact.email}
                                      onChange={(e) => {
                                        const updatedContacts = [
                                          ...(formData.contact_persons || []),
                                        ]
                                        updatedContacts[index] = {
                                          ...contact,
                                          email: e.target.value,
                                        }
                                        setFormData((prev) => ({
                                          ...prev,
                                          contact_persons: updatedContacts,
                                        }))
                                      }}
                                      className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
                                      placeholder="email@example.com"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700">
                                      Phone
                                    </label>
                                    <input
                                      type="tel"
                                      value={contact.phone || ''}
                                      onChange={(e) => {
                                        const updatedContacts = [
                                          ...(formData.contact_persons || []),
                                        ]
                                        updatedContacts[index] = {
                                          ...contact,
                                          phone: e.target.value,
                                        }
                                        setFormData((prev) => ({
                                          ...prev,
                                          contact_persons: updatedContacts,
                                        }))
                                      }}
                                      className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
                                      placeholder="+47 123 45 678"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700">
                                      Role
                                    </label>
                                    <div className="mt-1 grid grid-cols-1">
                                      <select
                                        value={contact.role || ''}
                                        onChange={(e) => {
                                          const updatedContacts = [
                                            ...(formData.contact_persons || []),
                                          ]
                                          updatedContacts[index] = {
                                            ...contact,
                                            role: e.target.value,
                                          }
                                          setFormData((prev) => ({
                                            ...prev,
                                            contact_persons: updatedContacts,
                                          }))
                                        }}
                                        className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                      >
                                        <option value="">
                                          Select a role...
                                        </option>
                                        {CONTACT_ROLE_OPTIONS.map((role) => (
                                          <option key={role} value={role}>
                                            {role}
                                          </option>
                                        ))}
                                      </select>
                                      <ChevronDownIcon
                                        aria-hidden="true"
                                        className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedContacts = (
                                        formData.contact_persons || []
                                      ).filter((_, i) => i !== index)
                                      setFormData((prev) => ({
                                        ...prev,
                                        contact_persons: updatedContacts,
                                      }))
                                    }}
                                    className="text-sm text-red-600 hover:text-red-500"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Billing Information */}
                        <div className="mt-4">
                          <h5 className="text-sm font-medium text-gray-900">
                            Billing Information
                          </h5>
                          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <label
                                htmlFor="billing_email"
                                className="block text-sm/6 font-medium text-gray-900"
                              >
                                Billing Email
                              </label>
                              <div className="mt-2">
                                <input
                                  type="email"
                                  id="billing_email"
                                  value={formData.billing?.email || ''}
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      billing: {
                                        ...prev.billing,
                                        email: e.target.value,
                                      },
                                    }))
                                  }
                                  className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                  placeholder="billing@example.com"
                                />
                              </div>
                            </div>
                            <div className="sm:col-span-2">
                              <label
                                htmlFor="billing_reference"
                                className="block text-sm/6 font-medium text-gray-900"
                              >
                                Billing Reference
                              </label>
                              <div className="mt-2">
                                <input
                                  type="text"
                                  id="billing_reference"
                                  value={formData.billing?.reference || ''}
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      billing: {
                                        ...prev.billing,
                                        reference: e.target.value,
                                      },
                                    }))
                                  }
                                  className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                  placeholder="PO number, reference code, etc."
                                />
                              </div>
                            </div>
                            <div className="sm:col-span-2">
                              <label
                                htmlFor="billing_comments"
                                className="block text-sm/6 font-medium text-gray-900"
                              >
                                Billing Comments
                              </label>
                              <div className="mt-2">
                                <textarea
                                  id="billing_comments"
                                  rows={3}
                                  value={formData.billing?.comments || ''}
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      billing: {
                                        ...prev.billing,
                                        comments: e.target.value,
                                      },
                                    }))
                                  }
                                  className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                  placeholder="Additional billing instructions or notes..."
                                />
                              </div>
                            </div>
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
                          {isSubmitting
                            ? editingSponsor
                              ? 'Updating...'
                              : 'Adding...'
                            : editingSponsor
                              ? 'Update Sponsor'
                              : 'Add Sponsor'}
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
