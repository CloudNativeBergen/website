'use client'

import { useState, useEffect, Fragment } from 'react'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
import { api } from '@/lib/trpc/client'
import type {
  SponsorForConferenceExpanded,
  SponsorStatus,
  InvoiceStatus,
  SponsorTag,
} from '@/lib/sponsor-crm/types'
import {
  XMarkIcon,
  ChevronDownIcon,
  UserGroupIcon,
  PhoneIcon,
  ChatBubbleLeftRightIcon,
  XCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'

interface SponsorCRMFormProps {
  conferenceId: string
  sponsor: SponsorForConferenceExpanded | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingSponsorsInCRM?: string[]
}

const STATUSES: Array<{ value: SponsorStatus; label: string }> = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'closed-won', label: 'Won' },
  { value: 'closed-lost', label: 'Lost' },
]

const INVOICE_STATUSES: Array<{ value: InvoiceStatus; label: string }> = [
  { value: 'not-sent', label: 'Not Sent' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
]

const TAGS: Array<{ value: SponsorTag; label: string }> = [
  { value: 'warm-lead', label: 'Warm Lead' },
  { value: 'returning-sponsor', label: 'Returning Sponsor' },
  { value: 'cold-outreach', label: 'Cold Outreach' },
  { value: 'referral', label: 'Referral' },
  { value: 'high-priority', label: 'High Priority' },
  { value: 'needs-follow-up', label: 'Needs Follow-up' },
  { value: 'multi-year-potential', label: 'Multi-year Potential' },
]

export function SponsorCRMForm({
  conferenceId,
  sponsor,
  isOpen,
  onClose,
  onSuccess,
  existingSponsorsInCRM = [],
}: SponsorCRMFormProps) {
  const [formData, setFormData] = useState({
    sponsorId: '',
    tierId: '',
    status: 'prospect' as SponsorStatus,
    invoiceStatus: 'not-sent' as InvoiceStatus,
    contractValue: '',
    contractCurrency: 'NOK',
    notes: '',
    tags: [] as SponsorTag[],
  })

  const { data: allSponsors = [] } = api.sponsor.list.useQuery({
    includeContactInfo: false,
  })

  const availableSponsors = sponsor
    ? allSponsors
    : allSponsors.filter((s) => !existingSponsorsInCRM.includes(s._id))

  const { data: sponsorTiers = [] } =
    api.sponsor.tiers.listByConference.useQuery(
      { conferenceId },
      { enabled: isOpen },
    )

  const createMutation = api.sponsor.crm.create.useMutation({
    onSuccess: () => {
      onSuccess()
      onClose()
    },
  })

  const updateMutation = api.sponsor.crm.update.useMutation({
    onSuccess: () => {
      onSuccess()
      onClose()
    },
  })

  useEffect(() => {
    if (sponsor) {
      setFormData({
        sponsorId: sponsor.sponsor._id,
        tierId: sponsor.tier?._id || '',
        status: sponsor.status,
        invoiceStatus: sponsor.invoice_status,
        contractValue: sponsor.contract_value?.toString() || '',
        contractCurrency: sponsor.contract_currency || 'NOK',
        notes: sponsor.notes || '',
        tags: sponsor.tags || [],
      })
    } else {
      setFormData({
        sponsorId: '',
        tierId: '',
        status: 'prospect',
        invoiceStatus: 'not-sent',
        contractValue: '',
        contractCurrency: 'NOK',
        notes: '',
        tags: [],
      })
    }
  }, [sponsor, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (sponsor) {
      await updateMutation.mutateAsync({
        id: sponsor._id,
        tier: formData.tierId || undefined,
        status: formData.status,
        invoice_status: formData.invoiceStatus,
        contract_value: formData.contractValue
          ? parseFloat(formData.contractValue)
          : undefined,
        contract_currency: formData.contractCurrency as 'NOK' | 'USD' | 'EUR',
        notes: formData.notes || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
      })
    } else {
      await createMutation.mutateAsync({
        sponsor: formData.sponsorId,
        conference: conferenceId,
        tier: formData.tierId || undefined,
        status: formData.status,
        invoice_status: formData.invoiceStatus,
        contract_value: formData.contractValue
          ? parseFloat(formData.contractValue)
          : undefined,
        contract_currency: formData.contractCurrency as 'NOK' | 'USD' | 'EUR',
        notes: formData.notes || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
      })
    }
  }

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500/75 transition-opacity dark:bg-gray-900/75" />
        </TransitionChild>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="max-h-[90vh] w-full max-w-3xl transform overflow-hidden rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-4 shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-900">
                <div className="absolute top-0 right-0 pt-4 pr-4">
                  <button
                    onClick={onClose}
                    className="rounded-md text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:text-gray-500 dark:hover:text-gray-400"
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <DialogTitle className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                  {sponsor ? 'Edit Sponsor' : 'Add Sponsor to Pipeline'}
                </DialogTitle>

                <form onSubmit={handleSubmit} className="mt-3">
                  <div className="space-y-3">
                    {/* Sponsor Selection */}
                    <div>
                      <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
                        Sponsor *
                      </label>
                      <Combobox
                        value={formData.sponsorId}
                        onChange={(value) =>
                          setFormData({ ...formData, sponsorId: value || '' })
                        }
                        disabled={!!sponsor}
                      >
                        <div className="relative mt-1.5">
                          <ComboboxInput
                            className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-8 pl-3 text-left text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:outline-gray-200 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:disabled:bg-white/5 dark:disabled:text-gray-400 dark:disabled:outline-white/10"
                            displayValue={(id: string) =>
                              availableSponsors.find((s) => s._id === id)
                                ?.name || ''
                            }
                            placeholder="Select a sponsor..."
                          />
                          <ComboboxButton className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <ChevronUpDownIcon
                              className="h-5 w-5 text-gray-400 sm:h-4 sm:w-4"
                              aria-hidden="true"
                            />
                          </ComboboxButton>
                          <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline-1 -outline-offset-1 outline-gray-300 focus:outline-none sm:text-sm dark:bg-gray-800 dark:outline-white/10">
                            {availableSponsors.length === 0 ? (
                              <div className="relative cursor-default px-3 py-2 text-gray-500 select-none dark:text-gray-400">
                                No sponsors available
                              </div>
                            ) : (
                              availableSponsors.map((s) => (
                                <ComboboxOption
                                  key={s._id}
                                  value={s._id}
                                  className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white dark:text-white"
                                >
                                  <span className="block truncate font-normal group-data-selected:font-semibold">
                                    {s.name}
                                  </span>
                                  <span className="absolute inset-y-0 right-0 hidden items-center pr-4 text-indigo-600 group-data-focus:text-white group-data-selected:flex">
                                    <CheckIcon
                                      className="h-5 w-5"
                                      aria-hidden="true"
                                    />
                                  </span>
                                </ComboboxOption>
                              ))
                            )}
                          </ComboboxOptions>
                        </div>
                      </Combobox>
                    </div>

                    {/* Tier Selection */}
                    <fieldset>
                      <legend className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
                        Sponsor Tier
                      </legend>
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        <label
                          aria-label="No tier"
                          className="group relative flex cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 has-checked:border-indigo-600 has-checked:bg-indigo-50 has-checked:text-indigo-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-indigo-600 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:has-checked:border-indigo-500 dark:has-checked:bg-indigo-500/10 dark:has-checked:text-indigo-400"
                        >
                          <input
                            type="radio"
                            name="tier"
                            value=""
                            checked={!formData.tierId}
                            onChange={() =>
                              setFormData({ ...formData, tierId: '' })
                            }
                            className="absolute inset-0 appearance-none focus:outline-none"
                          />
                          <span className="whitespace-nowrap text-gray-900 group-has-checked:text-indigo-600 dark:text-white dark:group-has-checked:text-indigo-400">
                            No tier
                          </span>
                        </label>
                        {sponsorTiers.map((tier) => (
                          <label
                            key={tier._id}
                            aria-label={tier.title}
                            className="group relative flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 has-checked:border-indigo-600 has-checked:bg-indigo-50 has-checked:text-indigo-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-indigo-600 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:has-checked:border-indigo-500 dark:has-checked:bg-indigo-500/10 dark:has-checked:text-indigo-400"
                          >
                            <input
                              type="radio"
                              name="tier"
                              value={tier._id}
                              checked={formData.tierId === tier._id}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  tierId: e.target.value,
                                })
                              }
                              className="absolute inset-0 appearance-none focus:outline-none"
                            />
                            <span className="whitespace-nowrap text-gray-900 group-has-checked:text-indigo-600 dark:text-white dark:group-has-checked:text-indigo-400">
                              {tier.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {/* Status and Invoice Status */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <fieldset>
                        <legend className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
                          Status *
                        </legend>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                          {STATUSES.map((status) => {
                            const Icon =
                              status.value === 'prospect'
                                ? UserGroupIcon
                                : status.value === 'contacted'
                                  ? PhoneIcon
                                  : status.value === 'negotiating'
                                    ? ChatBubbleLeftRightIcon
                                    : status.value === 'closed-won'
                                      ? CheckCircleIcon
                                      : XCircleIcon
                            return (
                              <label
                                key={status.value}
                                aria-label={status.label}
                                className="group relative flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 has-checked:border-indigo-600 has-checked:bg-indigo-50 has-checked:text-indigo-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-indigo-600 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:has-checked:border-indigo-500 dark:has-checked:bg-indigo-500/10 dark:has-checked:text-indigo-400"
                              >
                                <input
                                  type="radio"
                                  name="status"
                                  value={status.value}
                                  checked={formData.status === status.value}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      status: e.target.value as SponsorStatus,
                                    })
                                  }
                                  required
                                  className="absolute inset-0 appearance-none focus:outline-none"
                                />
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="whitespace-nowrap text-gray-900 group-has-checked:text-indigo-600 dark:text-white dark:group-has-checked:text-indigo-400">
                                  {status.label}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </fieldset>

                      <fieldset>
                        <legend className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
                          Invoice Status *
                        </legend>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                          {INVOICE_STATUSES.map((status) => {
                            const Icon =
                              status.value === 'not-sent'
                                ? XMarkIcon
                                : status.value === 'sent'
                                  ? PhoneIcon
                                  : status.value === 'paid'
                                    ? CheckCircleIcon
                                    : status.value === 'overdue'
                                      ? XCircleIcon
                                      : XMarkIcon
                            return (
                              <label
                                key={status.value}
                                aria-label={status.label}
                                className="group relative flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 has-checked:border-indigo-600 has-checked:bg-indigo-50 has-checked:text-indigo-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-indigo-600 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:has-checked:border-indigo-500 dark:has-checked:bg-indigo-500/10 dark:has-checked:text-indigo-400"
                              >
                                <input
                                  type="radio"
                                  name="invoiceStatus"
                                  value={status.value}
                                  checked={
                                    formData.invoiceStatus === status.value
                                  }
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      invoiceStatus: e.target
                                        .value as InvoiceStatus,
                                    })
                                  }
                                  required
                                  className="absolute inset-0 appearance-none focus:outline-none"
                                />
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="whitespace-nowrap text-gray-900 group-has-checked:text-indigo-600 dark:text-white dark:group-has-checked:text-indigo-400">
                                  {status.label}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </fieldset>
                    </div>

                    {/* Contract Value and Tags */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
                          Contract Value
                        </label>
                        <div className="mt-1.5 flex gap-2">
                          <input
                            type="number"
                            value={formData.contractValue}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                contractValue: e.target.value,
                              })
                            }
                            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10"
                          />
                          <div className="relative grid w-28 grid-cols-1">
                            <select
                              value={formData.contractCurrency}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  contractCurrency: e.target.value,
                                })
                              }
                              className="col-start-1 row-start-1 block w-full appearance-none rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10"
                            >
                              <option value="NOK">NOK</option>
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                            </select>
                            <ChevronDownIcon
                              className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
                          Tags
                        </label>
                        <div className="mt-1.5">
                          <FilterDropdown
                            label="Select tags"
                            activeCount={formData.tags.length}
                            keepOpen
                            fixedWidth
                            forceDropUp
                          >
                            {TAGS.map((tag) => (
                              <FilterOption
                                key={tag.value}
                                checked={formData.tags.includes(tag.value)}
                                onClick={() => {
                                  if (formData.tags.includes(tag.value)) {
                                    setFormData({
                                      ...formData,
                                      tags: formData.tags.filter(
                                        (t) => t !== tag.value,
                                      ),
                                    })
                                  } else {
                                    setFormData({
                                      ...formData,
                                      tags: [...formData.tags, tag.value],
                                    })
                                  }
                                }}
                                keepOpen
                              >
                                {tag.label}
                              </FilterOption>
                            ))}
                          </FilterDropdown>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
                        Notes
                      </label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        rows={2}
                        className="mt-1.5 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-row-reverse gap-3">
                    <button
                      type="submit"
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                      className={clsx(
                        'inline-flex justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm',
                        createMutation.isPending || updateMutation.isPending
                          ? 'bg-gray-400 dark:bg-gray-600'
                          : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
                      )}
                    >
                      {createMutation.isPending || updateMutation.isPending
                        ? 'Saving...'
                        : sponsor
                          ? 'Update'
                          : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20"
                    >
                      Cancel
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
