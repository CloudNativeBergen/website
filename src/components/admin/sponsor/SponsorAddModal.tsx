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
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { useTheme } from 'next-themes'
import {
  BuildingOffice2Icon,
  XMarkIcon,
  CheckIcon,
  ChevronUpDownIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { ChevronDownIcon as ChevronDownIconSmall } from '@heroicons/react/16/solid'
import {
  ConferenceSponsor,
  SponsorTierExisting,
  SponsorInput,
  SponsorExisting,
} from '@/lib/sponsor/types'
import { api } from '@/lib/trpc/client'
import { SponsorLogoEditor } from './SponsorLogoEditor'

interface SponsorAddModalProps {
  isOpen: boolean
  onClose: () => void
  sponsorTiers: SponsorTierExisting[]
  preselectedTierId?: string
  editingSponsor?: ConferenceSponsor | null
  onSponsorAdded?: (sponsor: ConferenceSponsor) => void
  onSponsorUpdated?: (sponsor: ConferenceSponsor) => void
}

interface SponsorFormData extends SponsorInput {
  tierId: string
}

export function SponsorAddModal({
  isOpen,
  onClose,
  sponsorTiers,
  preselectedTierId,
  editingSponsor,
  onSponsorAdded,
  onSponsorUpdated,
}: SponsorAddModalProps) {
  const { theme } = useTheme()
  const companyNameInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState<SponsorFormData>({
    name: '',
    website: '',
    logo: null,
    logo_bright: null,
    tierId: preselectedTierId || '',
    org_number: '',
  })

  const [availableSponsors, setAvailableSponsors] = useState<SponsorExisting[]>(
    [],
  )
  const [selectedExistingSponsor, setSelectedExistingSponsor] =
    useState<SponsorExisting | null>(null)
  const [query, setQuery] = useState('')
  const [sponsorId, setSponsorId] = useState<string>('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  const sponsorsQuery = api.sponsor.list.useQuery({})
  const createMutation = api.sponsor.create.useMutation({
    onSuccess: () => {
      utils.sponsor.list.invalidate()
    },
  })
  const updateMutation = api.sponsor.update.useMutation({
    onSuccess: () => {
      utils.sponsor.list.invalidate()
    },
  })
  const addToConferenceMutation = api.sponsor.addToConference.useMutation({
    onSuccess: () => {
      utils.sponsor.list.invalidate()
    },
  })
  const utils = api.useUtils()

  useEffect(() => {
    if (sponsorsQuery.data && (isOpen || sponsorsQuery.data)) {
      setAvailableSponsors(
        sponsorsQuery.data.sort((a, b) => a.name.localeCompare(b.name)),
      )
    }
  }, [isOpen, sponsorsQuery.data])

  useEffect(() => {
    if (isOpen) {
      if (editingSponsor) {
        const tierMatch = sponsorTiers.find(
          (tier) => tier.title === editingSponsor.tier?.title,
        )
        setFormData((prev) => ({
          ...prev,
          name: editingSponsor.sponsor.name,
          website: editingSponsor.sponsor.website || '',
          logo: editingSponsor.sponsor.logo || null,
          logo_bright: editingSponsor.sponsor.logo_bright || null,
          tierId: tierMatch?._id || '',
          org_number: '',
        }))
        setIsCreatingNew(false)
        setSelectedExistingSponsor(null)
      } else {
        setFormData((prev) => ({
          ...prev,
          name: '',
          website: '',
          logo: null,
          logo_bright: null,
          tierId: preselectedTierId || '',
          org_number: '',
        }))
        setIsCreatingNew(false)
        setSelectedExistingSponsor(null)
        setSponsorId('')
      }
    }
  }, [isOpen, editingSponsor, preselectedTierId, sponsorTiers])

  useEffect(() => {
    if (preselectedTierId && isOpen && !editingSponsor) {
      setFormData((prev) => ({ ...prev, tierId: preselectedTierId }))
    }
  }, [preselectedTierId, isOpen, editingSponsor])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      const sponsorData: SponsorInput = {
        name: formData.name,
        website: formData.website,
        logo: formData.logo || null,
        logo_bright: formData.logo_bright || null,
        org_number: formData.org_number || undefined,
      }

      if (editingSponsor) {
        const existingSponsors = sponsorsQuery.data || []
        const existingSponsor = existingSponsors.find(
          (s) => s.name === editingSponsor.sponsor.name,
        )

        if (!existingSponsor) {
          throw new Error('Could not find existing sponsor to update')
        }

        const currentTierMatch = sponsorTiers.find(
          (tier) => tier.title === editingSponsor.tier?.title,
        )
        const newTierMatch = sponsorTiers.find(
          (tier) => tier._id === formData.tierId,
        )

        const sponsorUpdateData = {
          ...sponsorData,

          ...(currentTierMatch?._id !== newTierMatch?._id && {
            tierId: formData.tierId,
          }),
        }

        const updatedSponsor = (await updateMutation.mutateAsync({
          id: existingSponsor._id,
          data: sponsorUpdateData,
        })) as SponsorExisting

        const selectedTier = sponsorTiers.find(
          (tier) => tier._id === formData.tierId,
        )

        const updatedConferenceSponsor: ConferenceSponsor = {
          sponsor: {
            _id: updatedSponsor._id,
            name: updatedSponsor.name,
            website: updatedSponsor.website,
            logo: updatedSponsor.logo,
            logo_bright: updatedSponsor.logo_bright,
          },
          tier: {
            title: selectedTier?.title || '',
            tagline: selectedTier?.tagline || '',
            tier_type: selectedTier?.tier_type,
          },
        }

        onSponsorUpdated?.(updatedConferenceSponsor)

        setAvailableSponsors((prev) =>
          prev
            .map((sponsor) =>
              sponsor._id === existingSponsor._id
                ? {
                    ...sponsor,
                    name: updatedSponsor.name,
                    logo: updatedSponsor.logo,
                    logo_bright: updatedSponsor.logo_bright,
                    website: updatedSponsor.website,
                  }
                : sponsor,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      } else {
        let finalSponsorId = sponsorId

        if (isCreatingNew || !sponsorId) {
          const sponsor = await createMutation.mutateAsync(sponsorData)
          if (sponsor) {
            finalSponsorId = sponsor._id
            setSponsorId(sponsor._id)
          }
        }

        if (!finalSponsorId && selectedExistingSponsor) {
          finalSponsorId = selectedExistingSponsor._id
        }

        await addToConferenceMutation.mutateAsync({
          sponsorId: finalSponsorId,
          tierId: formData.tierId,
        })

        const selectedTier = sponsorTiers.find(
          (tier) => tier._id === formData.tierId,
        )

        const addedSponsor: ConferenceSponsor = {
          sponsor: {
            _id: finalSponsorId,
            name: formData.name,
            website: formData.website,
            logo: formData.logo,
            logo_bright: formData.logo_bright || undefined,
          },
          tier: {
            title: selectedTier?.title || '',
            tagline: selectedTier?.tagline || '',
            tier_type: selectedTier?.tier_type,
          },
        }

        onSponsorAdded?.(addedSponsor)

        if (isCreatingNew && finalSponsorId) {
          const newSponsor: SponsorExisting = {
            _id: finalSponsorId,
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString(),
            name: formData.name,
            website: formData.website,
            logo: formData.logo,
            logo_bright: formData.logo_bright,
          }
          setAvailableSponsors((prev) =>
            [...prev, newSponsor].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
      }

      onClose()
    } catch (error) {
      console.error('Error submitting sponsor:', error)
      alert('Error submitting sponsor. Please try again.')
    }
  }

  const handleSponsorSelection = (sponsor: SponsorExisting | null) => {
    if (sponsor === null) {
      createNewSponsor()
      return
    }

    setSelectedExistingSponsor(sponsor)
    if (sponsor) {
      setFormData({
        name: sponsor.name,
        website: sponsor.website || '',
        logo: sponsor.logo || '',
        logo_bright: sponsor.logo_bright || '',
        tierId: formData.tierId,
        org_number: '',
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
      name: query,
      website: '',
      logo: null,
      logo_bright: null,
      org_number: '',
    }))
    setSponsorId('')

    setTimeout(() => {
      companyNameInputRef.current?.focus()
    }, 100)
  }

  const filteredSponsors = query
    ? availableSponsors.filter((sponsor) =>
        sponsor.name.toLowerCase().includes(query.toLowerCase()),
      )
    : availableSponsors

  const isFormValid = () => {
    if (!formData.tierId) return false

    if (isCreatingNew) {
      return !!formData.name.trim()
    }

    if (editingSponsor || selectedExistingSponsor) {
      return !!formData.name.trim()
    }

    return false
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
                          setFormData((prev) => ({
                            ...prev,
                            tierId: e.target.value,
                          }))
                        }
                        required
                        className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus:outline-indigo-500"
                      >
                        <option value="">Select a tier...</option>
                        {sponsorTiers
                          .sort((a, b) => {
                            const getMaxPrice = (tier: SponsorTierExisting) => {
                              if (!tier.price || tier.price.length === 0)
                                return 0
                              return Math.max(
                                ...tier.price.map((p) => p.amount),
                              )
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
                              displayValue={(sponsor: SponsorExisting) =>
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
                                            active
                                              ? 'text-white'
                                              : 'text-gray-400'
                                          }`}
                                        />
                                        <span
                                          className={`ml-3 block truncate ${
                                            selected
                                              ? 'font-semibold'
                                              : 'font-normal'
                                          }`}
                                        >
                                          {sponsor.name}
                                        </span>
                                      </div>
                                      {selected && (
                                        <span
                                          className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                            active
                                              ? 'text-white'
                                              : 'text-indigo-600'
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

                  {(isCreatingNew ||
                    editingSponsor ||
                    selectedExistingSponsor) && (
                    <>
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
                                  selectedExistingSponsor != null &&
                                  !isCreatingNew
                                }
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 dark:disabled:bg-white/5 dark:disabled:text-gray-400"
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

                          <div className="sm:col-span-2">
                            <SponsorLogoEditor
                              logo={formData.logo || null}
                              logoBright={formData.logo_bright || null}
                              name={formData.name}
                              onChange={(updates) =>
                                setFormData((prev) => ({ ...prev, ...updates }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

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
                      disabled={
                        !isFormValid() ||
                        createMutation.isPending ||
                        updateMutation.isPending ||
                        addToConferenceMutation.isPending
                      }
                      className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500"
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
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
