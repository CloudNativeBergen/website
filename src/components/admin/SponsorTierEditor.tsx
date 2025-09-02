'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  TagIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { StarIcon } from '@heroicons/react/20/solid'
import { ChevronDownIcon } from '@heroicons/react/16/solid'
import clsx from 'clsx'
import { SponsorTierInput, SponsorTierExisting } from '@/lib/sponsor/types'
import { formatCurrency } from '@/lib/format'
import { api } from '@/lib/trpc/client'

interface SponsorTierProps {
  conferenceId: string
  sponsorTiers: SponsorTierExisting[]
  onTierUpdate?: (tiers: SponsorTierExisting[]) => void
}

interface SponsorTierModalProps {
  isOpen: boolean
  onClose: () => void
  tier?: SponsorTierExisting
  conferenceId: string
  onSave: (tier: SponsorTierExisting) => void
  onDelete?: (tierId: string) => void
}

const CURRENCY_OPTIONS = ['NOK', 'USD', 'EUR'] as const

function SponsorTierModal({
  isOpen,
  onClose,
  tier,
  conferenceId: _conferenceId, // eslint-disable-line @typescript-eslint/no-unused-vars
  onSave,
  onDelete,
}: SponsorTierModalProps) {
  const [formData, setFormData] = useState<SponsorTierInput>({
    title: '',
    tagline: '',
    tier_type: 'standard',
    price: [{ amount: 0, currency: 'NOK' }],
    perks: [{ label: '', description: '' }],
    sold_out: false,
    most_popular: false,
  })

  // tRPC mutations
  const createMutation = api.sponsor.tiers.create.useMutation({
    onSuccess: (createdTier) => {
      if (createdTier) {
        onSave(createdTier)
        onClose()
      }
    },
    onError: (error) => {
      console.error('Error creating sponsor tier:', error)
      alert('Failed to create sponsor tier. Please try again.')
    },
  })

  const updateMutation = api.sponsor.tiers.update.useMutation({
    onSuccess: (updatedTier) => {
      if (updatedTier) {
        onSave(updatedTier)
        onClose()
      }
    },
    onError: (error) => {
      console.error('Error updating sponsor tier:', error)
      alert('Failed to update sponsor tier. Please try again.')
    },
  })

  const deleteMutation = api.sponsor.tiers.delete.useMutation({
    onSuccess: () => {
      if (tier && onDelete) {
        onDelete(tier._id)
      }
      onClose()
    },
    onError: (error) => {
      console.error('Error deleting sponsor tier:', error)
      alert('Failed to delete sponsor tier. Please try again.')
    },
  })

  // Initialize form data when tier changes
  useEffect(() => {
    if (tier) {
      setFormData({
        title: tier.title,
        tagline: tier.tagline,
        tier_type: tier.tier_type,
        price: tier.price?.map((p) => ({
          _key: p._key,
          amount: p.amount,
          currency: p.currency,
        })) || [{ amount: 0, currency: 'NOK' }],
        perks: tier.perks?.map((p) => ({
          _key: p._key,
          label: p.label,
          description: p.description,
        })) || [{ label: '', description: '' }],
        sold_out: tier.sold_out,
        most_popular: tier.most_popular,
      })
    } else {
      setFormData({
        title: '',
        tagline: '',
        tier_type: 'standard',
        price: [{ amount: 0, currency: 'NOK' }],
        perks: [{ label: '', description: '' }],
        sold_out: false,
        most_popular: false,
      })
    }
  }, [tier])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      if (tier) {
        // Update existing tier
        await updateMutation.mutateAsync({
          id: tier._id,
          data: formData,
        })
      } else {
        // Create new tier
        await createMutation.mutateAsync(formData)
      }
    } catch {
      // Error handling is done by the mutation onError callbacks
    }
  }

  const handleDelete = async () => {
    if (!tier) return

    const confirmed = window.confirm(
      `Are you sure you want to delete the tier "${tier.title}"? This action cannot be undone.`,
    )

    if (confirmed) {
      try {
        await deleteMutation.mutateAsync({ id: tier._id })
      } catch {
        // Error handling is done by the mutation onError callback
      }
    }
  }

  const addPrice = () => {
    setFormData((prev) => ({
      ...prev,
      price: [...(prev.price || []), { amount: 0, currency: 'NOK' }],
    }))
  }

  const removePrice = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      price: prev.price?.filter((_, i) => i !== index) || [],
    }))
  }

  const updatePrice = (
    index: number,
    field: 'amount' | 'currency',
    value: string | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      price:
        prev.price?.map((price, i) =>
          i === index ? { ...price, [field]: value } : price,
        ) || [],
    }))
  }

  const addPerk = () => {
    setFormData((prev) => ({
      ...prev,
      perks: [...(prev.perks || []), { label: '', description: '' }],
    }))
  }

  const removePerk = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      perks: prev.perks?.filter((_, i) => i !== index) || [],
    }))
  }

  const updatePerk = (
    index: number,
    field: 'label' | 'description',
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      perks:
        prev.perks?.map((perk, i) =>
          i === index ? { ...perk, [field]: value } : perk,
        ) || [],
    }))
  }

  const isLoading =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
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
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <DialogTitle
                    as="h3"
                    className="text-lg leading-6 font-medium text-gray-900 dark:text-white"
                  >
                    {tier ? 'Edit Sponsor Tier' : 'Create Sponsor Tier'}
                  </DialogTitle>
                  <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:bg-white/10 dark:text-gray-300 dark:hover:text-gray-200"
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  {/* Basic Information */}
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="title"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Title *
                      </label>
                      <div className="mt-2">
                        <input
                          type="text"
                          id="title"
                          value={formData.title}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              title: e.target.value,
                            }))
                          }
                          required
                          disabled={isLoading}
                          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 dark:disabled:bg-white/5 dark:disabled:text-gray-400"
                          placeholder="e.g., Gold, Silver, Bronze"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="tagline"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Tagline *
                      </label>
                      <div className="mt-2">
                        <input
                          type="text"
                          id="tagline"
                          value={formData.tagline}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              tagline: e.target.value,
                            }))
                          }
                          required
                          disabled={isLoading}
                          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 dark:disabled:bg-white/5 dark:disabled:text-gray-400"
                          placeholder="e.g., Premium partnership opportunity"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tier Type and Status */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor="tier_type"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Tier Type
                      </label>
                      <div className="mt-2 grid grid-cols-1">
                        <select
                          id="tier_type"
                          value={formData.tier_type}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              tier_type: e.target.value as
                                | 'standard'
                                | 'special',
                            }))
                          }
                          disabled={isLoading}
                          className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus:outline-indigo-500 dark:disabled:bg-white/5 dark:disabled:text-gray-400"
                        >
                          <option value="standard">Standard</option>
                          <option value="special">Special</option>
                        </select>
                        <ChevronDownIcon
                          aria-hidden="true"
                          className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
                        />
                      </div>
                    </div>

                    <div className="flex items-end">
                      <div className="flex gap-3">
                        <div className="flex h-6 shrink-0 items-center">
                          <div className="group grid size-4 grid-cols-1">
                            <input
                              id="sold_out"
                              type="checkbox"
                              checked={formData.sold_out}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  sold_out: e.target.checked,
                                }))
                              }
                              disabled={isLoading}
                              className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:checked:border-indigo-500 dark:checked:bg-indigo-500 dark:indeterminate:border-indigo-500 dark:indeterminate:bg-indigo-500 dark:focus-visible:outline-indigo-500 dark:disabled:border-white/5 dark:disabled:bg-white/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                            />
                            <svg
                              fill="none"
                              viewBox="0 0 14 14"
                              className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25 dark:group-has-disabled:stroke-white/25"
                            >
                              <path
                                d="M3 8L6 11L11 3.5"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="opacity-0 group-has-checked:opacity-100"
                              />
                            </svg>
                          </div>
                        </div>
                        <div className="text-sm/6">
                          <label
                            htmlFor="sold_out"
                            className="font-medium whitespace-nowrap text-gray-900 dark:text-white"
                          >
                            Sold Out
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-end">
                      <div className="flex gap-3">
                        <div className="flex h-6 shrink-0 items-center">
                          <div className="group grid size-4 grid-cols-1">
                            <input
                              id="most_popular"
                              type="checkbox"
                              checked={formData.most_popular}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  most_popular: e.target.checked,
                                }))
                              }
                              disabled={isLoading}
                              className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:checked:border-indigo-500 dark:checked:bg-indigo-500 dark:indeterminate:border-indigo-500 dark:indeterminate:bg-indigo-500 dark:focus-visible:outline-indigo-500 dark:disabled:border-white/5 dark:disabled:bg-white/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                            />
                            <svg
                              fill="none"
                              viewBox="0 0 14 14"
                              className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25 dark:group-has-disabled:stroke-white/25"
                            >
                              <path
                                d="M3 8L6 11L11 3.5"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="opacity-0 group-has-checked:opacity-100"
                              />
                            </svg>
                          </div>
                        </div>
                        <div className="text-sm/6">
                          <label
                            htmlFor="most_popular"
                            className="font-medium whitespace-nowrap text-gray-900 dark:text-white"
                          >
                            Most Popular
                            <StarIcon className="ml-1 inline h-4 w-4 text-yellow-400" />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                        Pricing
                      </label>
                      <button
                        type="button"
                        onClick={addPrice}
                        disabled={isLoading}
                        className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
                      >
                        <PlusIcon className="mr-1.5 h-3 w-3" />
                        Add Price
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {formData.price?.map((price, index) => (
                        <div
                          key={index}
                          className="flex items-center space-x-3"
                        >
                          <div className="flex-1">
                            <input
                              type="number"
                              value={price.amount}
                              onChange={(e) =>
                                updatePrice(
                                  index,
                                  'amount',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              min="0"
                              step="0.01"
                              disabled={isLoading}
                              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 dark:disabled:bg-white/5 dark:disabled:text-gray-400"
                              placeholder="Amount"
                            />
                          </div>
                          <div className="grid w-24 grid-cols-1">
                            <select
                              value={price.currency}
                              onChange={(e) =>
                                updatePrice(index, 'currency', e.target.value)
                              }
                              disabled={isLoading}
                              className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus:outline-indigo-500 dark:disabled:bg-white/5 dark:disabled:text-gray-400"
                            >
                              {CURRENCY_OPTIONS.map((currency) => (
                                <option key={currency} value={currency}>
                                  {currency}
                                </option>
                              ))}
                            </select>
                            <ChevronDownIcon
                              aria-hidden="true"
                              className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
                            />
                          </div>
                          {formData.price && formData.price.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePrice(index)}
                              disabled={isLoading}
                              className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100 disabled:opacity-50"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )) || []}
                    </div>
                  </div>

                  {/* Perks */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                        Perks & Benefits
                      </label>
                      <button
                        type="button"
                        onClick={addPerk}
                        disabled={isLoading}
                        className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
                      >
                        <PlusIcon className="mr-1.5 h-3 w-3" />
                        Add Perk
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {formData.perks?.map((perk, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                        >
                          <div>
                            <input
                              type="text"
                              value={perk.label}
                              onChange={(e) =>
                                updatePerk(index, 'label', e.target.value)
                              }
                              disabled={isLoading}
                              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 dark:disabled:bg-white/5 dark:disabled:text-gray-400"
                              placeholder="Perk title"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <div className="flex space-x-2">
                              <input
                                type="text"
                                value={perk.description}
                                onChange={(e) =>
                                  updatePerk(
                                    index,
                                    'description',
                                    e.target.value,
                                  )
                                }
                                disabled={isLoading}
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 dark:disabled:bg-white/5 dark:disabled:text-gray-400"
                                placeholder="Perk description"
                              />
                              {formData.perks && formData.perks.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removePerk(index)}
                                  disabled={isLoading}
                                  className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100 disabled:opacity-50"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )) || []}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between pt-4">
                    <div>
                      {tier && onDelete && (
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={isLoading}
                          className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 dark:bg-red-500 dark:shadow-none dark:focus-visible:outline-red-500"
                        >
                          <ExclamationTriangleIcon className="mr-1.5 h-4 w-4" />
                          {deleteMutation.isPending
                            ? 'Deleting...'
                            : 'Delete Tier'}
                        </button>
                      )}
                    </div>
                    <div className="flex space-x-3">
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="text-sm/6 font-semibold whitespace-nowrap text-gray-900 disabled:opacity-50 dark:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
                      >
                        {createMutation.isPending || updateMutation.isPending
                          ? 'Saving...'
                          : tier
                            ? 'Update Tier'
                            : 'Create Tier'}
                      </button>
                    </div>
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

export default function SponsorTierEditor({
  conferenceId,
  sponsorTiers: initialTiers,
  onTierUpdate,
}: SponsorTierProps) {
  const [sponsorTiers, setSponsorTiers] =
    useState<SponsorTierExisting[]>(initialTiers)
  const [selectedTier, setSelectedTier] = useState<
    SponsorTierExisting | undefined
  >()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Sync with parent when tiers change
  useEffect(() => {
    setSponsorTiers(initialTiers)
  }, [initialTiers])

  const openCreateModal = () => {
    setSelectedTier(undefined)
    setIsModalOpen(true)
  }

  const openEditModal = (tier: SponsorTierExisting) => {
    setSelectedTier(tier)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedTier(undefined)
  }

  const handleSave = (tier: SponsorTierExisting) => {
    if (selectedTier) {
      // Update existing tier
      const updatedTiers = sponsorTiers.map((t) =>
        t._id === tier._id ? tier : t,
      )
      setSponsorTiers(updatedTiers)
      onTierUpdate?.(updatedTiers)
    } else {
      // Add new tier
      const updatedTiers = [...sponsorTiers, tier]
      setSponsorTiers(updatedTiers)
      onTierUpdate?.(updatedTiers)
    }
  }

  const handleDelete = (tierId: string) => {
    const updatedTiers = sponsorTiers.filter((t) => t._id !== tierId)
    setSponsorTiers(updatedTiers)
    onTierUpdate?.(updatedTiers)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
            Sponsor Tiers
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage sponsorship tiers and their pricing.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
        >
          <PlusIcon className="mr-1.5 h-4 w-4" />
          Create Tier
        </button>
      </div>

      {sponsorTiers.length === 0 ? (
        <div className="py-12 text-center">
          <TagIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
            No sponsor tiers
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Get started by creating your first sponsor tier.
          </p>
          <div className="mt-6">
            <button
              onClick={openCreateModal}
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
            >
              <PlusIcon className="mr-1.5 h-4 w-4" />
              Create Tier
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
              <div
                key={tier._id}
                className={clsx(
                  'group relative rounded-lg border border-gray-300 bg-white p-6 shadow-sm hover:border-gray-400 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20',
                  tier.most_popular && 'ring-2 ring-indigo-500',
                )}
              >
                {tier.most_popular && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-medium text-white">
                      <StarIcon className="mr-1 h-3 w-3" />
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="absolute top-4 right-4 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => openEditModal(tier)}
                      className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center">
                  <TagIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                  <h4 className="ml-3 text-lg font-medium text-gray-900 dark:text-white">
                    {tier.title}
                  </h4>
                </div>

                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {tier.tagline}
                </p>

                {tier.price && tier.price.length > 0 && (
                  <div className="mt-4">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatCurrency(
                        Math.max(...tier.price.map((p) => p.amount)),
                        tier.price[0].currency,
                      )}
                    </div>
                    {tier.price.length > 1 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Starting from above price
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex space-x-2">
                    <span
                      className={clsx(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        tier.tier_type === 'special'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800',
                      )}
                    >
                      {tier.tier_type}
                    </span>
                    {tier.sold_out && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                        Sold Out
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      <SponsorTierModal
        isOpen={isModalOpen}
        onClose={closeModal}
        tier={selectedTier}
        conferenceId={conferenceId}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
