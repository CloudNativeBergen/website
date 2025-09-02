'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogPanel,
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  ComboboxButton,
} from '@headlessui/react'
import {
  BuildingOffice2Icon,
  XMarkIcon,
  CheckIcon,
  ChevronUpDownIcon,
  ChevronDownIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { ChevronDownIcon as ChevronDownIconSmall } from '@heroicons/react/16/solid'
import { InlineSvgPreviewComponent } from '@starefossen/sanity-plugin-inline-svg-input'
import {
  ConferenceSponsorWithContact,
  SponsorTierExisting,
  SponsorInput,
  SponsorWithContactInfo,
} from '@/lib/sponsor/types'
import { CONTACT_ROLE_OPTIONS } from '@/lib/sponsor/types'
import { api } from '@/lib/trpc/client'

interface SponsorAddModalProps {
  isOpen: boolean
  onClose: () => void
  sponsorTiers: SponsorTierExisting[]
  preselectedTierId?: string
  editingSponsor?: ConferenceSponsorWithContact | null
  onSponsorAdded?: (sponsor: ConferenceSponsorWithContact) => void
  onSponsorUpdated?: (sponsor: ConferenceSponsorWithContact) => void
}

interface SponsorFormData extends Omit<SponsorInput, 'billing'> {
  tierId: string
  billing: {
    email: string
    reference?: string
    comments?: string
  }
}

export default function SponsorAddModal({
  isOpen,
  onClose,
  sponsorTiers,
  preselectedTierId,
  editingSponsor,
  onSponsorAdded,
  onSponsorUpdated,
}: SponsorAddModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const companyNameInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState<SponsorFormData>({
    name: '',
    website: '',
    logo: '',
    tierId: preselectedTierId || '',
    org_number: '',
    contact_persons: [],
    billing: {
      email: '',
      reference: '',
      comments: '',
    },
  })

  const [availableSponsors, setAvailableSponsors] = useState<
    SponsorWithContactInfo[]
  >([])
  const [selectedExistingSponsor, setSelectedExistingSponsor] =
    useState<SponsorWithContactInfo | null>(null)
  const [query, setQuery] = useState('')
  const [sponsorId, setSponsorId] = useState<string>('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  // tRPC mutations and queries
  const sponsorsQuery = api.sponsor.list.useQuery({})
  const createMutation = api.sponsor.create.useMutation()
  const updateMutation = api.sponsor.update.useMutation()
  const addToConferenceMutation = api.sponsor.addToConference.useMutation()

  // Load sponsors when modal opens
  useEffect(() => {
    if (isOpen && sponsorsQuery.data) {
      setAvailableSponsors(sponsorsQuery.data)
    }
  }, [isOpen, sponsorsQuery.data])

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (editingSponsor) {
        // Editing mode: populate form with existing data
        const tierMatch = sponsorTiers.find(
          (tier) => tier.title === editingSponsor.tier?.title,
        )
        setFormData({
          name: editingSponsor.sponsor.name,
          website: editingSponsor.sponsor.website || '',
          logo: editingSponsor.sponsor.logo || '',
          tierId: tierMatch?._id || '',
          org_number: editingSponsor.sponsor.org_number || '',
          contact_persons: editingSponsor.sponsor.contact_persons || [],
          billing: {
            email: editingSponsor.sponsor.billing?.email || '',
            reference: editingSponsor.sponsor.billing?.reference || '',
            comments: editingSponsor.sponsor.billing?.comments || '',
          },
        })
        setIsCreatingNew(false)
        setSelectedExistingSponsor(null)
      } else {
        // Create mode: reset form
        setFormData({
          name: '',
          website: '',
          logo: '',
          tierId: preselectedTierId || '',
          org_number: '',
          contact_persons: [],
          billing: {
            email: '',
            reference: '',
            comments: '',
          },
        })
        setIsCreatingNew(false)
        setSelectedExistingSponsor(null)
        setSponsorId('')
      }
    }
  }, [isOpen, editingSponsor, preselectedTierId, sponsorTiers])

  // Update tierId when preselectedTierId changes
  useEffect(() => {
    if (preselectedTierId && isOpen && !editingSponsor) {
      setFormData((prev) => ({ ...prev, tierId: preselectedTierId }))
    }
  }, [preselectedTierId, isOpen, editingSponsor])

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'image/svg+xml') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const svgContent = e.target?.result as string
        setFormData((prev) => ({ ...prev, logo: svgContent }))
      }
      reader.readAsText(file)
    } else {
      alert('Please select an SVG file.')
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      const billingData =
        formData.billing.email || formData.billing.reference
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
        const existingSponsors = sponsorsQuery.data || []
        const existingSponsor = existingSponsors.find(
          (s) => s.name === editingSponsor.sponsor.name,
        )

        if (!existingSponsor) {
          throw new Error('Could not find existing sponsor to update')
        }

        // Check if tier has changed and include tierId in sponsor data if needed
        const currentTierMatch = sponsorTiers.find(
          (tier) => tier.title === editingSponsor.tier?.title,
        )
        const newTierMatch = sponsorTiers.find(
          (tier) => tier._id === formData.tierId,
        )

        const sponsorUpdateData = {
          ...sponsorData,
          // Include tierId if tier has changed
          ...(currentTierMatch?._id !== newTierMatch?._id && {
            tierId: formData.tierId,
          }),
        }

        const updatedSponsor = await updateMutation.mutateAsync({
          id: existingSponsor._id,
          data: sponsorUpdateData,
        })

        // Find the tier for the updated sponsor
        const selectedTier = sponsorTiers.find(
          (tier) => tier._id === formData.tierId,
        )

        // Create the ConferenceSponsorWithContact object to pass back
        const updatedConferenceSponsor: ConferenceSponsorWithContact = {
          sponsor: {
            _id: updatedSponsor._id,
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
        let finalSponsorId = sponsorId

        // Create new sponsor if needed
        if (isCreatingNew || !sponsorId) {
          const sponsor = await createMutation.mutateAsync(sponsorData)
          if (sponsor) {
            finalSponsorId = sponsor._id
            setSponsorId(sponsor._id)
          }
        }

        // Use selectedExistingSponsor ID if available
        if (!finalSponsorId && selectedExistingSponsor) {
          finalSponsorId = selectedExistingSponsor._id
        }

        // Add sponsor to conference
        await addToConferenceMutation.mutateAsync({
          sponsorId: finalSponsorId,
          tierId: formData.tierId,
        })

        // Find the tier for the added sponsor
        const selectedTier = sponsorTiers.find(
          (tier) => tier._id === formData.tierId,
        )

        // Create the ConferenceSponsorWithContact object to pass back
        const addedSponsor: ConferenceSponsorWithContact = {
          sponsor: {
            _id: finalSponsorId,
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

        onSponsorAdded?.(addedSponsor)
      }

      onClose()
    } catch (error) {
      console.error('Error submitting sponsor:', error)
      alert('Error submitting sponsor. Please try again.')
    }
  }

  const handleSponsorSelection = (sponsor: SponsorWithContactInfo | null) => {
    if (sponsor === null) {
      // This means "Create new sponsor" was selected
      createNewSponsor()
      return
    }

    setSelectedExistingSponsor(sponsor)
    if (sponsor) {
      setFormData({
        name: sponsor.name,
        website: sponsor.website || '',
        logo: sponsor.logo || '',
        tierId: formData.tierId,
        org_number: sponsor.org_number || '',
        contact_persons: sponsor.contact_persons || [],
        billing: {
          email: sponsor.billing?.email || '',
          reference: sponsor.billing?.reference || '',
          comments: sponsor.billing?.comments || '',
        },
      })
      setSponsorId(sponsor._id)
      setIsCreatingNew(false)
    }
  }

  const createNewSponsor = () => {
    setSelectedExistingSponsor(null)
    setIsCreatingNew(true)
    setFormData((prev) => ({
      ...prev,
      name: query, // Use the current search query as the sponsor name
      website: '',
      logo: '',
      org_number: '',
      contact_persons: [],
      billing: { email: '', reference: '', comments: '' },
      // Keep the selected tier
    }))
    setSponsorId('')

    // Focus the company name input after a short delay to ensure DOM is updated
    setTimeout(() => {
      companyNameInputRef.current?.focus()
    }, 100)
  }

  const filteredSponsors = query
    ? availableSponsors.filter((sponsor) =>
        sponsor.name.toLowerCase().includes(query.toLowerCase()),
      )
    : availableSponsors

  // Check if form is valid for submission
  const isFormValid = () => {
    if (!formData.tierId) return false

    // For creating new sponsors, all required fields must be filled
    if (isCreatingNew) {
      return (
        formData.name.trim() && formData.website.trim() && formData.logo.trim()
      )
    }

    // For editing existing sponsors or selecting existing sponsors, we're more lenient
    // but still require basic fields
    if (editingSponsor || selectedExistingSponsor) {
      return (
        formData.name.trim() && formData.website.trim() && formData.logo.trim()
      )
    }

    return false
  }

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="max-h-screen w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-lg dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
              {editingSponsor ? 'Edit Sponsor' : 'Add Sponsor'}
            </h3>
            <button
              onClick={onClose}
              className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:bg-white/10 dark:text-gray-300 dark:hover:text-gray-200"
            >
              <span className="sr-only">Close</span>
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Tier Selection */}
            <div>
              <label
                htmlFor="tier"
                className="block text-sm/6 font-medium text-gray-900 dark:text-white"
              >
                Sponsor Tier *
              </label>
              <div className="mt-2 grid grid-cols-1">
                <select
                  id="tier"
                  value={formData.tierId}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, tierId: e.target.value }))
                  }
                  required
                  className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus:outline-indigo-500"
                >
                  <option value="">Select a tier...</option>
                  {sponsorTiers
                    .sort((a, b) => {
                      // Sort by highest price first
                      const getMaxPrice = (tier: SponsorTierExisting) => {
                        if (!tier.price || tier.price.length === 0) return 0
                        return Math.max(...tier.price.map((p) => p.amount))
                      }
                      return getMaxPrice(b) - getMaxPrice(a)
                    })
                    .map((tier) => (
                      <option key={tier._id} value={tier._id}>
                        {tier.title}
                      </option>
                    ))}
                </select>
                <ChevronDownIconSmall
                  aria-hidden="true"
                  className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
                />
              </div>
            </div>

            {/* Sponsor Selection (only in create mode) */}
            {!editingSponsor && (
              <div>
                <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                  Select Sponsor
                </label>
                <div className="mt-2">
                  <Combobox
                    value={selectedExistingSponsor}
                    onChange={handleSponsorSelection}
                  >
                    <div className="relative">
                      <ComboboxInput
                        className="w-full rounded-md bg-white py-1.5 pr-10 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                        displayValue={(sponsor: SponsorWithContactInfo) =>
                          sponsor?.name || ''
                        }
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search existing sponsors or create new..."
                      />
                      <ComboboxButton className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                        <ChevronUpDownIcon
                          className="h-5 w-5 text-gray-400 dark:text-gray-500"
                          aria-hidden="true"
                        />
                      </ComboboxButton>

                      <ComboboxOptions className="ring-opacity-5 absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black focus:outline-none sm:text-sm">
                        {!isCreatingNew && (
                          <ComboboxOption
                            value={null}
                            className="group relative cursor-pointer py-2 pr-9 pl-3 text-gray-900 select-none hover:bg-indigo-600 hover:text-white"
                          >
                            <div className="flex items-center">
                              <PlusIcon className="h-5 w-5 text-indigo-600 group-hover:text-white" />
                              <span className="ml-3 block truncate font-medium">
                                Create new sponsor
                              </span>
                            </div>
                          </ComboboxOption>
                        )}
                        {filteredSponsors.map((sponsor) => (
                          <ComboboxOption
                            key={sponsor._id}
                            value={sponsor}
                            className={({ active }) =>
                              `relative cursor-default py-2 pr-9 pl-3 select-none ${
                                active
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-gray-900'
                              }`
                            }
                          >
                            {({ active, selected }) => (
                              <>
                                <div className="flex items-center">
                                  <BuildingOffice2Icon
                                    className={`h-5 w-5 ${
                                      active ? 'text-white' : 'text-gray-400'
                                    }`}
                                  />
                                  <span
                                    className={`ml-3 block truncate ${
                                      selected ? 'font-semibold' : 'font-normal'
                                    }`}
                                  >
                                    {sponsor.name}
                                  </span>
                                </div>
                                {selected && (
                                  <span
                                    className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                      active ? 'text-white' : 'text-indigo-600'
                                    }`}
                                  >
                                    <CheckIcon
                                      className="h-5 w-5"
                                      aria-hidden="true"
                                    />
                                  </span>
                                )}
                              </>
                            )}
                          </ComboboxOption>
                        ))}
                      </ComboboxOptions>
                    </div>
                  </Combobox>
                </div>
              </div>
            )}

            {/* Show form fields only if creating new or editing */}
            {(isCreatingNew || editingSponsor || selectedExistingSponsor) && (
              <>
                {/* Sponsor Information */}
                <div className="border-b border-gray-900/10 pb-4 dark:border-white/10">
                  <h4 className="text-base/7 font-semibold text-gray-900 dark:text-white">
                    Sponsor Information
                  </h4>
                  <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="name"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Company Name *
                      </label>
                      <div className="mt-2">
                        <input
                          ref={companyNameInputRef}
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
                          disabled={
                            selectedExistingSponsor != null && !isCreatingNew
                          }
                          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-white/5 dark:disabled:text-gray-400"
                          placeholder="Enter company name"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="website"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
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
                          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                          placeholder="https://example.com"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="org_number"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Organization Number
                      </label>
                      <div className="mt-2">
                        <input
                          type="text"
                          id="org_number"
                          value={formData.org_number}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              org_number: e.target.value,
                            }))
                          }
                          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                          placeholder="Enter organization number"
                        />
                      </div>
                    </div>

                    {/* Logo Upload */}
                    <div className="sm:col-span-2">
                      <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                        Logo (SVG) *
                      </label>
                      <div className="mt-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          accept=".svg"
                          className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-indigo-500/10 dark:file:text-indigo-400 dark:hover:file:bg-indigo-500/20"
                        />
                        {formData.logo && (
                          <div className="mt-3">
                            <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                              Logo Preview:
                            </p>
                            <div className="inline-block rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                              <InlineSvgPreviewComponent
                                value={formData.logo}
                                style={{ width: '100px', height: '100px' }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({ ...prev, logo: '' }))
                              }
                              className="ml-3 text-sm text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact Persons */}
                <div className="border-b border-gray-900/10 pb-4 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base/7 font-semibold text-gray-900 dark:text-white">
                      Contact Persons
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          contact_persons: [
                            ...(prev.contact_persons || []),
                            {
                              _key: `contact-${Date.now()}`,
                              name: '',
                              email: '',
                              phone: '',
                              role: '',
                            },
                          ],
                        }))
                      }}
                      className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500 whitespace-nowrap"
                    >
                      <PlusIcon className="mr-1.5 h-4 w-4" />
                      Add Contact
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {(formData.contact_persons || []).map((contact, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-gray-900/10 p-4 dark:border-white/10"
                      >
                        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                              Full Name *
                            </label>
                            <div className="mt-1">
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
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                                placeholder="Full name"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                              Email *
                            </label>
                            <div className="mt-1">
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
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                                placeholder="email@example.com"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                              Phone
                            </label>
                            <div className="mt-1">
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
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                                placeholder="+47 123 45 678"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
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
                                className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus:outline-indigo-500"
                              >
                                <option value="">Select a role...</option>
                                {CONTACT_ROLE_OPTIONS.map((role) => (
                                  <option key={role} value={role}>
                                    {role}
                                  </option>
                                ))}
                              </select>
                              <ChevronDownIconSmall
                                aria-hidden="true"
                                className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
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
                            className="text-sm/6 font-semibold text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Billing Information */}
                <div>
                  <h4 className="text-base/7 font-semibold text-gray-900 dark:text-white">
                    Billing Information
                  </h4>
                  <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="billing_email"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Billing Email
                      </label>
                      <div className="mt-1">
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
                          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                          placeholder="billing@example.com"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="billing_reference"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Billing Reference
                      </label>
                      <div className="mt-1">
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
                          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                          placeholder="Internal reference number"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="billing_comments"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Billing Comments
                      </label>
                      <div className="mt-1">
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
                          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                          placeholder="Any special billing instructions..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Submit buttons */}
            <div className="flex justify-end gap-3 pt-6">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700 dark:focus-visible:outline-indigo-500 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !isFormValid() ||
                  createMutation.isPending ||
                  updateMutation.isPending ||
                  addToConferenceMutation.isPending
                }
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500 whitespace-nowrap"
              >
                {createMutation.isPending ||
                updateMutation.isPending ||
                addToConferenceMutation.isPending
                  ? 'Saving...'
                  : editingSponsor
                    ? 'Update Sponsor'
                    : 'Add Sponsor'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
