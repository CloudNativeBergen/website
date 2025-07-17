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
import clsx from 'clsx'
import { SponsorTierInput, SponsorTierExisting } from '@/lib/sponsor/types'
import {
  createSponsorTier,
  updateSponsorTier,
  deleteSponsorTier,
} from '@/lib/sponsor/client'
import { formatCurrency } from '@/lib/format'

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
  conferenceId,
  onSave,
  onDelete,
}: SponsorTierModalProps) {
  const [formData, setFormData] = useState<SponsorTierInput>({
    title: '',
    tagline: '',
    price: [{ amount: 0, currency: 'NOK' }],
    perks: [{ label: '', description: '' }],
    sold_out: false,
    most_popular: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (tier) {
      setFormData({
        title: tier.title || '',
        tagline: tier.tagline || '',
        price:
          tier.price && tier.price.length > 0
            ? tier.price
            : [{ amount: 0, currency: 'NOK' }],
        perks:
          tier.perks && tier.perks.length > 0
            ? tier.perks
            : [{ label: '', description: '' }],
        sold_out: tier.sold_out ?? false,
        most_popular: tier.most_popular ?? false,
      })
    } else {
      setFormData({
        title: '',
        tagline: '',
        price: [{ amount: 0, currency: 'NOK' }],
        perks: [{ label: '', description: '' }],
        sold_out: false,
        most_popular: false,
      })
    }
    setError('')
    setShowDeleteConfirm(false)
  }, [tier, isOpen])

  const handleClose = () => {
    setShowDeleteConfirm(false)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      let savedTier: SponsorTierExisting

      if (tier) {
        // Update existing tier
        savedTier = await updateSponsorTier(tier._id, formData)
      } else {
        // Create new tier
        savedTier = await createSponsorTier(formData, conferenceId)
      }

      onSave(savedTier)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!tier || !onDelete) return

    setIsSubmitting(true)
    try {
      await deleteSponsorTier(tier._id)
      onDelete(tier._id)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addPrice = () => {
    setFormData((prev) => ({
      ...prev,
      price: [...prev.price, { amount: 0, currency: 'NOK' }],
    }))
  }

  const removePrice = (index: number) => {
    if (formData.price.length > 1) {
      setFormData((prev) => ({
        ...prev,
        price: prev.price.filter((_, i) => i !== index),
      }))
    }
  }

  const updatePrice = (
    index: number,
    field: 'amount' | 'currency',
    value: string | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      price: prev.price.map((price, i) =>
        i === index
          ? { ...price, [field]: field === 'amount' ? Number(value) : value }
          : price,
      ),
    }))
  }

  const addPerk = () => {
    setFormData((prev) => ({
      ...prev,
      perks: [...prev.perks, { label: '', description: '' }],
    }))
  }

  const removePerk = (index: number) => {
    if (formData.perks.length > 1) {
      setFormData((prev) => ({
        ...prev,
        perks: prev.perks.filter((_, i) => i !== index),
      }))
    }
  }

  const updatePerk = (
    index: number,
    field: 'label' | 'description',
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      perks: prev.perks.map((perk, i) =>
        i === index ? { ...perk, [field]: value } : perk,
      ),
    }))
  }

  return (
    <Transition show={isOpen}>
      <Dialog className="relative z-50" onClose={handleClose}>
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
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <TransitionChild
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
                <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
                    onClick={handleClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mt-3 w-full text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <DialogTitle
                      as="h3"
                      className="text-base leading-6 font-semibold text-gray-900"
                    >
                      {tier ? 'Edit Sponsor Tier' : 'Create New Sponsor Tier'}
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

                    {showDeleteConfirm ? (
                      <div className="mt-6">
                        <div className="rounded-md bg-red-50 p-4">
                          <div className="flex">
                            <div className="flex-shrink-0">
                              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                            </div>
                            <div className="ml-3">
                              <h3 className="text-sm font-medium text-red-800">
                                Delete Sponsor Tier
                              </h3>
                              <div className="mt-2 text-sm text-red-700">
                                <p>
                                  Are you sure you want to delete &quot;
                                  {tier?.title}
                                  &quot;? This action cannot be undone.
                                </p>
                              </div>
                              <div className="mt-4 flex gap-x-3">
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={handleDelete}
                                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isSubmitting ? 'Deleting...' : 'Delete'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowDeleteConfirm(false)}
                                  className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmit} className="mt-6 space-y-8">
                        {/* Basic Information */}
                        <div className="space-y-6">
                          <div>
                            <label
                              htmlFor="title"
                              className="block text-sm/6 font-medium text-gray-900"
                            >
                              Title *
                            </label>
                            <div className="mt-2">
                              <input
                                type="text"
                                id="title"
                                value={formData.title || ''}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    title: e.target.value,
                                  }))
                                }
                                required
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                placeholder="e.g., Gold Sponsor"
                              />
                            </div>
                          </div>

                          <div>
                            <label
                              htmlFor="tagline"
                              className="block text-sm/6 font-medium text-gray-900"
                            >
                              Tagline *
                            </label>
                            <div className="mt-2">
                              <textarea
                                id="tagline"
                                rows={3}
                                value={formData.tagline || ''}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    tagline: e.target.value,
                                  }))
                                }
                                required
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                placeholder="e.g., Premium sponsorship tier with enhanced visibility and networking opportunities"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Pricing */}
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="block text-sm/6 font-medium text-gray-900">
                              Pricing *
                            </label>
                            <button
                              type="button"
                              onClick={addPrice}
                              className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                            >
                              <PlusIcon className="mr-1 inline h-3 w-3" />
                              Add Price
                            </button>
                          </div>
                          <div className="mt-2 space-y-3">
                            {formData.price.map((price, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-x-3"
                              >
                                <div className="flex-1">
                                  <input
                                    type="number"
                                    value={price.amount || 0}
                                    onChange={(e) =>
                                      updatePrice(
                                        index,
                                        'amount',
                                        e.target.value,
                                      )
                                    }
                                    min="0"
                                    step="1"
                                    required
                                    className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                    placeholder="Amount"
                                  />
                                </div>
                                <div className="w-24">
                                  <div className="grid grid-cols-1">
                                    <select
                                      value={price.currency || 'NOK'}
                                      onChange={(e) =>
                                        updatePrice(
                                          index,
                                          'currency',
                                          e.target.value,
                                        )
                                      }
                                      className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                    >
                                      {CURRENCY_OPTIONS.map((currency) => (
                                        <option key={currency} value={currency}>
                                          {currency}
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
                                {formData.price.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removePrice(index)}
                                    className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Perks */}
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="block text-sm/6 font-medium text-gray-900">
                              Perks *
                            </label>
                            <button
                              type="button"
                              onClick={addPerk}
                              className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                            >
                              <PlusIcon className="mr-1 inline h-3 w-3" />
                              Add Perk
                            </button>
                          </div>
                          <div className="mt-2 space-y-3">
                            {formData.perks.map((perk, index) => (
                              <div
                                key={index}
                                className="flex items-start gap-x-3"
                              >
                                <div className="grid flex-1 grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
                                  <input
                                    type="text"
                                    value={perk.label || ''}
                                    onChange={(e) =>
                                      updatePerk(index, 'label', e.target.value)
                                    }
                                    required
                                    className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                    placeholder="Perk name"
                                  />
                                  <input
                                    type="text"
                                    value={perk.description || ''}
                                    onChange={(e) =>
                                      updatePerk(
                                        index,
                                        'description',
                                        e.target.value,
                                      )
                                    }
                                    required
                                    className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                    placeholder="Perk description"
                                  />
                                </div>
                                {formData.perks.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removePerk(index)}
                                    className="mt-0.5 rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Options */}
                        <div className="space-y-6">
                          <div className="flex gap-3">
                            <div className="flex h-6 shrink-0 items-center">
                              <div className="group grid size-4 grid-cols-1">
                                <input
                                  id="most_popular"
                                  type="checkbox"
                                  checked={formData.most_popular || false}
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      most_popular: e.target.checked,
                                    }))
                                  }
                                  className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
                                />
                                <svg
                                  fill="none"
                                  viewBox="0 0 14 14"
                                  className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25"
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
                                className="font-medium text-gray-900"
                              >
                                Mark as most popular
                              </label>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <div className="flex h-6 shrink-0 items-center">
                              <div className="group grid size-4 grid-cols-1">
                                <input
                                  id="sold_out"
                                  type="checkbox"
                                  checked={formData.sold_out || false}
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      sold_out: e.target.checked,
                                    }))
                                  }
                                  className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
                                />
                                <svg
                                  fill="none"
                                  viewBox="0 0 14 14"
                                  className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25"
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
                                className="font-medium text-gray-900"
                              >
                                Mark as sold out
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between border-t border-gray-900/10 pt-8">
                          <div>
                            {tier && onDelete && (
                              <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                              >
                                <TrashIcon className="mr-1 inline h-4 w-4" />
                                Delete
                              </button>
                            )}
                          </div>
                          <div className="flex gap-x-3">
                            <button
                              type="button"
                              onClick={handleClose}
                              className="text-sm/6 font-semibold text-gray-900 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSubmitting
                                ? tier
                                  ? 'Updating...'
                                  : 'Creating...'
                                : tier
                                  ? 'Update Tier'
                                  : 'Create Tier'}
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
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

export default function SponsorTierEditor({
  conferenceId,
  sponsorTiers: initialSponsorTiers,
  onTierUpdate,
}: SponsorTierProps) {
  const [sponsorTiers, setSponsorTiers] =
    useState<SponsorTierExisting[]>(initialSponsorTiers)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTier, setEditingTier] = useState<
    SponsorTierExisting | undefined
  >()

  // Update local state when props change
  useEffect(() => {
    setSponsorTiers(initialSponsorTiers)
  }, [initialSponsorTiers])

  const handleEditTier = (tier: SponsorTierExisting) => {
    setEditingTier(tier)
    setIsModalOpen(true)
  }

  const handleCreateTier = () => {
    setEditingTier(undefined)
    setIsModalOpen(true)
  }

  const handleTierSave = (savedTier: SponsorTierExisting) => {
    let updatedTiers: SponsorTierExisting[]

    if (editingTier) {
      // Update existing tier
      updatedTiers = sponsorTiers.map((tier) =>
        tier._id === savedTier._id ? savedTier : tier,
      )
    } else {
      // Add new tier
      updatedTiers = [...sponsorTiers, savedTier]
    }

    setSponsorTiers(updatedTiers)
    onTierUpdate?.(updatedTiers)
  }

  const handleTierDelete = (tierId: string) => {
    const updatedTiers = sponsorTiers.filter((tier) => tier._id !== tierId)
    setSponsorTiers(updatedTiers)
    onTierUpdate?.(updatedTiers)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Sponsor Tiers</h2>
        <button
          onClick={handleCreateTier}
          className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          Create Tier
        </button>
      </div>

      {sponsorTiers.length === 0 ? (
        <div className="py-12 text-center">
          <TagIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            No sponsor tiers
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first sponsor tier.
          </p>
          <div className="mt-6">
            <button
              onClick={handleCreateTier}
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <PlusIcon className="mr-1 h-4 w-4" />
              Create Tier
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sponsorTiers
            .sort((a, b) => {
              // Sort by highest price first
              const maxPriceA = Math.max(...a.price.map((p) => p.amount))
              const maxPriceB = Math.max(...b.price.map((p) => p.amount))
              return maxPriceB - maxPriceA
            })
            .map((tier) => (
              <div
                key={tier._id}
                className={clsx(
                  'relative flex flex-col rounded-lg border bg-white px-6 py-5 shadow-sm hover:border-gray-400',
                  tier.most_popular
                    ? 'border-indigo-500 ring-2 ring-indigo-500'
                    : 'border-gray-300',
                )}
              >
                {tier.most_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 transform">
                    <span className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white">
                      <StarIcon className="mr-1 h-3 w-3" />
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex-1 text-center">
                  <h3 className="text-lg font-medium text-gray-900">
                    {tier.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">{tier.tagline}</p>

                  <div className="mt-4">
                    {tier.price.map((price, priceIndex) => (
                      <div
                        key={priceIndex}
                        className="text-2xl font-bold text-gray-900"
                      >
                        {formatCurrency(price.amount, price.currency)}
                      </div>
                    ))}
                  </div>

                  {tier.sold_out && (
                    <div className="mt-2">
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                        Sold Out
                      </span>
                    </div>
                  )}

                  <div className="mt-4 text-left">
                    <ul className="space-y-2">
                      {tier.perks.map((perk, perkIndex) => (
                        <li key={perkIndex} className="text-sm text-gray-600">
                          <span className="font-medium">{perk.label}:</span>{' '}
                          {perk.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => handleEditTier(tier)}
                    className="inline-flex items-center rounded-md bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-100"
                  >
                    <PencilIcon className="mr-1 h-4 w-4" />
                    Edit
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      <SponsorTierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tier={editingTier}
        conferenceId={conferenceId}
        onSave={handleTierSave}
        onDelete={handleTierDelete}
      />
    </div>
  )
}
