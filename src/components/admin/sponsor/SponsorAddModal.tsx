'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
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
  PlusIcon,
} from '@heroicons/react/24/outline'
import { Dropdown } from '@/components/Form'
import {
  ConferenceSponsor,
  SponsorTierExisting,
  SponsorInput,
  SponsorExisting,
} from '@/lib/sponsor/types'
import { api } from '@/lib/trpc/client'
import { SponsorLogoEditor } from './SponsorLogoEditor'
import { ModalShell } from '@/components/ModalShell'

interface SponsorAddModalProps {
  isOpen: boolean
  onClose: () => void
  conferenceId: string
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
  conferenceId,
  sponsorTiers,
  preselectedTierId,
  editingSponsor,
  onSponsorAdded,
  onSponsorUpdated,
}: SponsorAddModalProps) {
  const companyNameInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState<SponsorFormData>({
    name: '',
    website: '',
    logo: null,
    logoBright: null,
    tierId: preselectedTierId || '',
    orgNumber: '',
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
  const crmCreateMutation = api.sponsor.crm.create.useMutation()
  const crmUpdateMutation = api.sponsor.crm.update.useMutation()
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
          logoBright: editingSponsor.sponsor.logoBright || null,
          tierId: tierMatch?._id || '',
          orgNumber: '',
        }))
        setIsCreatingNew(false)
        setSelectedExistingSponsor(null)
      } else {
        setFormData((prev) => ({
          ...prev,
          name: '',
          website: '',
          logo: null,
          logoBright: null,
          tierId: preselectedTierId || '',
          orgNumber: '',
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
        logoBright: formData.logoBright || null,
        orgNumber: formData.orgNumber || undefined,
      }

      if (editingSponsor) {
        const existingSponsors = sponsorsQuery.data || []
        const existingSponsor = existingSponsors.find(
          (s) => s.name === editingSponsor.sponsor.name,
        )

        if (!existingSponsor) {
          throw new Error('Could not find existing sponsor to update')
        }

        const updatedSponsor = (await updateMutation.mutateAsync({
          id: existingSponsor._id,
          data: sponsorData,
        })) as SponsorExisting

        const currentTierMatch = sponsorTiers.find(
          (tier) => tier.title === editingSponsor.tier?.title,
        )
        const selectedTier = sponsorTiers.find(
          (tier) => tier._id === formData.tierId,
        )

        if (
          editingSponsor._sfcId &&
          currentTierMatch?._id !== selectedTier?._id
        ) {
          await crmUpdateMutation.mutateAsync({
            id: editingSponsor._sfcId,
            tier: selectedTier?._id,
          })
        }

        const updatedConferenceSponsor: ConferenceSponsor = {
          _sfcId: editingSponsor._sfcId,
          sponsor: {
            _id: updatedSponsor._id,
            name: updatedSponsor.name,
            website: updatedSponsor.website,
            logo: updatedSponsor.logo,
            logoBright: updatedSponsor.logoBright,
          },
          tier: {
            _id: selectedTier?._id,
            title: selectedTier?.title || '',
            tagline: selectedTier?.tagline || '',
            tierType: selectedTier?.tierType,
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
                  logoBright: updatedSponsor.logoBright,
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

        const sfcResult = await crmCreateMutation.mutateAsync({
          sponsor: finalSponsorId,
          conference: conferenceId,
          tier: formData.tierId,
          status: 'closed-won',
          contractStatus: 'none',
          invoiceStatus: 'not-sent',
        })

        const selectedTier = sponsorTiers.find(
          (tier) => tier._id === formData.tierId,
        )

        const addedSponsor: ConferenceSponsor = {
          _sfcId: sfcResult?._id,
          sponsor: {
            _id: finalSponsorId,
            name: formData.name,
            website: formData.website,
            logo: formData.logo,
            logoBright: formData.logoBright || undefined,
          },
          tier: {
            _id: selectedTier?._id,
            title: selectedTier?.title || '',
            tagline: selectedTier?.tagline || '',
            tierType: selectedTier?.tierType,
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
            logoBright: formData.logoBright,
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
        logoBright: sponsor.logoBright || '',
        tierId: formData.tierId,
        orgNumber: '',
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
      logoBright: null,
      orgNumber: '',
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
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="4xl"
      className="max-h-screen overflow-y-auto rounded-xl shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
          {editingSponsor ? 'Edit Sponsor' : 'Add Sponsor'}
        </h3>
        <button
          onClick={onClose}
          className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-600 dark:bg-white/10 dark:text-gray-300 dark:hover:text-gray-200 dark:focus:outline-indigo-500"
        >
          <span className="sr-only">Close</span>
          <XMarkIcon className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <Dropdown
            name="tier"
            label="Sponsor Tier *"
            options={
              new Map(
                sponsorTiers
                  .sort((a, b) => {
                    const getMaxPrice = (tier: SponsorTierExisting) => {
                      if (!tier.price || tier.price.length === 0) return 0
                      return Math.max(...tier.price.map((p) => p.amount))
                    }
                    return getMaxPrice(b) - getMaxPrice(a)
                  })
                  .map((tier) => [tier._id, tier.title]),
              )
            }
            value={formData.tierId}
            setValue={(val) =>
              setFormData((prev) => ({
                ...prev,
                tierId: val,
              }))
            }
            required
            placeholder="Select a tier..."
          />
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

                  <ComboboxOptions className="ring-opacity-5 absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black focus:outline-none sm:text-sm dark:bg-gray-800 dark:ring-gray-700">
                    {!isCreatingNew && (
                      <ComboboxOption
                        value={null}
                        className="group relative cursor-pointer py-2 pr-9 pl-3 text-gray-900 select-none hover:bg-indigo-600 hover:text-white dark:text-white"
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
                          `relative cursor-default py-2 pr-9 pl-3 select-none ${active
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-900 dark:text-white'
                          }`
                        }
                      >
                        {({ active, selected }) => (
                          <>
                            <div className="flex items-center">
                              <BuildingOffice2Icon
                                className={`h-5 w-5 ${active ? 'text-white' : 'text-gray-400'
                                  }`}
                              />
                              <span
                                className={`ml-3 block truncate ${selected ? 'font-semibold' : 'font-normal'
                                  }`}
                              >
                                {sponsor.name}
                              </span>
                            </div>
                            {selected && (
                              <span
                                className={`absolute inset-y-0 right-0 flex items-center pr-4 ${active
                                    ? 'text-white'
                                    : 'text-indigo-600 dark:text-indigo-400'
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

        {(isCreatingNew || editingSponsor || selectedExistingSponsor) && (
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
                        selectedExistingSponsor != null && !isCreatingNew
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
                    htmlFor="orgNumber"
                    className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                  >
                    Organization Number
                  </label>
                  <div className="mt-2">
                    <input
                      type="text"
                      id="orgNumber"
                      value={formData.orgNumber}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          orgNumber: e.target.value,
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
                    logoBright={formData.logoBright || null}
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
              crmCreateMutation.isPending
            }
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500"
          >
            {createMutation.isPending ||
              updateMutation.isPending ||
              crmCreateMutation.isPending
              ? 'Saving...'
              : editingSponsor
                ? 'Update Sponsor'
                : 'Add Sponsor'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
