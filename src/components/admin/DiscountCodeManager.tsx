'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  PlusIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  ClipboardIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import type { ConferenceTheme } from '@/lib/branding/theme'
import {
  FilterDropdown,
  FilterOption,
  SponsorDiscountEmailModal,
} from '@/components/admin'
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuDivider,
} from '@/components/ActionMenu'
import { DataTable, type Column } from '@/components/DataTable'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { EventDiscountWithUsage } from '@/lib/discounts/types'
import { resolveRedemptionCount } from '@/lib/discounts'

interface SponsorWithTierInfo {
  id: string
  name: string
  website?: string
  logo?: string
  tier: {
    title: string
    tagline: string
    tierType: 'standard' | 'special'
  }
  ticketEntitlement: number
}

interface DiscountCodeManagerProps {
  sponsors: SponsorWithTierInfo[]
  eventId: number
  conference: {
    title: string
    city: string
    country: string
    startDate: string
    domains: string[]
    socialLinks?: string[]
    contactEmail: string
    domain: string
    /** Tenant brand theme — without it the discount email cannot be branded. */
    theme?: ConferenceTheme | null
  }
}

export function DiscountCodeManager({
  sponsors,
  eventId,
  conference,
}: DiscountCodeManagerProps) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const {
    data: discountData,
    isLoading: discountsLoading,
    error: discountsError,
  } = api.tickets.admin.getDiscountCodesWithUsage.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30000,
  })

  useEffect(() => {
    if (discountsError) {
      showNotification({
        type: 'error',
        title: 'Failed to load discounts',
        message: discountsError.message,
      })
    }
  }, [discountsError, showNotification])

  const existingDiscounts = useMemo(
    () => discountData?.discounts || [],
    [discountData],
  )
  const availableTicketTypes = useMemo(
    () => discountData?.ticketTypes || [],
    [discountData],
  )

  const [selectedTicketTypes, setSelectedTicketTypes] = useState<
    Record<string, string[]>
  >({})

  const getSponsorDiscounts = useCallback(
    (sponsor: SponsorWithTierInfo) => {
      return existingDiscounts.filter((discount) =>
        discount.triggerValue
          ?.toLowerCase()
          .includes(sponsor.name.toLowerCase().replace(/\s+/g, '')),
      )
    },
    [existingDiscounts],
  )

  const getExistingTicketTypes = useCallback(
    (sponsor: SponsorWithTierInfo): string[] => {
      const sponsorDiscounts = getSponsorDiscounts(sponsor)
      const allTicketTypes = new Set<string>()

      sponsorDiscounts.forEach((discount) => {
        discount.tickets.forEach((ticketId) => {
          allTicketTypes.add(ticketId)
        })
      })

      return Array.from(allTicketTypes)
    },
    [getSponsorDiscounts],
  )

  useEffect(() => {
    if (availableTicketTypes.length > 0) {
      const initialSelections: Record<string, string[]> = {}

      sponsors.forEach((sponsor) => {
        const existingTypes = getExistingTicketTypes(sponsor)
        if (existingTypes.length > 0) {
          initialSelections[sponsor.id] = existingTypes
        } else {
          initialSelections[sponsor.id] = [String(availableTicketTypes[0].id)]
        }
      })

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTicketTypes(initialSelections)
    }
  }, [
    sponsors,
    availableTicketTypes,
    existingDiscounts,
    getExistingTicketTypes,
  ])

  /**
   * Did the ticket read that our redemption counts are derived from FAIL?
   *
   * Distinct from "every count is zero", which is a perfectly good answer and
   * used to raise the same badge (#855-class empty-vs-unknown). Only a
   * positively `unavailable` status counts — an undefined status (no data yet,
   * or an older payload) asserts nothing.
   */
  const usageUnavailable = discountData?.usageStatus === 'unavailable'

  const getSponsorUsageStats = (
    sponsor: SponsorWithTierInfo,
  ): { used: number; total: number; fromProvider: boolean } => {
    const sponsorDiscounts = getSponsorDiscounts(sponsor)
    if (sponsorDiscounts.length === 0) {
      return { used: 0, total: sponsor.ticketEntitlement, fromProvider: false }
    }

    let fromProvider = false
    const totalUsed = sponsorDiscounts.reduce((sum, discount) => {
      const usage = resolveRedemptionCount(discount)
      if (usage.fromProvider) fromProvider = true
      return sum + usage.count
    }, 0)

    return {
      used: totalUsed,
      total: sponsor.ticketEntitlement,
      fromProvider,
    }
  }

  const getSelectedTicketTypesDisplay = (sponsorId: string): string => {
    const selectedTypes = selectedTicketTypes[sponsorId] || []
    if (selectedTypes.length === 0) {
      return 'All ticket types'
    }
    if (selectedTypes.length === 1) {
      const ticketType = availableTicketTypes.find(
        (t) => String(t.id) === selectedTypes[0],
      )
      return ticketType?.name || 'Unknown'
    }
    if (selectedTypes.length <= 2) {
      const names = selectedTypes
        .map(
          (id) => availableTicketTypes.find((t) => String(t.id) === id)?.name,
        )
        .filter(Boolean)
        .join(', ')
      return names || `${selectedTypes.length} selected`
    }
    return `${selectedTypes.length} selected`
  }

  const getExistingDiscountTicketTypes = (
    sponsor: SponsorWithTierInfo,
  ): string => {
    const sponsorDiscounts = getSponsorDiscounts(sponsor)
    if (sponsorDiscounts.length === 0) return ''

    const discount = sponsorDiscounts[0]
    const ticketIds = discount.tickets || []

    if (ticketIds.length === 0) {
      return 'All ticket types'
    }

    const ticketNames = ticketIds
      .map(
        (id) =>
          availableTicketTypes.find((t) => String(t.id) === String(id))?.name,
      )
      .filter(Boolean)

    if (ticketNames.length === 0) {
      return 'Unknown ticket types'
    }

    if (ticketNames.length <= 2) {
      return ticketNames.join(', ')
    }

    return `${ticketNames.length} ticket types`
  }
  const toggleTicketType = (sponsorId: string, ticketTypeId: string) => {
    setSelectedTicketTypes((prev) => {
      const sponsorTypes = prev[sponsorId] || []
      const updated = sponsorTypes.includes(ticketTypeId)
        ? sponsorTypes.filter((id) => id !== ticketTypeId)
        : [...sponsorTypes, ticketTypeId]
      return { ...prev, [sponsorId]: updated }
    })
  }

  const sponsorDiscountCodes = new Set(
    sponsors
      .flatMap((sponsor) =>
        getSponsorDiscounts(sponsor).map((discount) => discount.triggerValue),
      )
      .filter(Boolean),
  )

  const customDiscounts = existingDiscounts.filter(
    (discount) => !sponsorDiscountCodes.has(discount.triggerValue),
  )

  const getDiscountStatus = (discount: EventDiscountWithUsage) => {
    const now = new Date()
    const startsAt = discount.startsAt ? new Date(discount.startsAt) : null
    const stopsAt = discount.stopsAt ? new Date(discount.stopsAt) : null

    if (startsAt && now < startsAt) {
      return { status: 'scheduled', label: 'Scheduled', color: 'blue' }
    }

    if (stopsAt && now > stopsAt) {
      return { status: 'expired', label: 'Expired', color: 'red' }
    }

    if (startsAt && stopsAt && now >= startsAt && now <= stopsAt) {
      return { status: 'active', label: 'Active', color: 'green' }
    }

    if (!startsAt && !stopsAt) {
      return { status: 'permanent', label: 'Permanent', color: 'gray' }
    }

    return { status: 'active', label: 'Active', color: 'green' }
  }

  const [loading, setLoading] = useState<string | null>(null)

  const [emailModal, setEmailModal] = useState<{
    isOpen: boolean
    sponsor: SponsorWithTierInfo | null
    discountCode: string
  }>({
    isOpen: false,
    sponsor: null,
    discountCode: '',
  })

  const openEmailModal = (
    sponsor: SponsorWithTierInfo,
    discountCode: string,
  ) => {
    setEmailModal({
      isOpen: true,
      sponsor,
      discountCode,
    })
  }

  const closeEmailModal = () => {
    setEmailModal({
      isOpen: false,
      sponsor: null,
      discountCode: '',
    })
  }

  const { copyToClipboard } = useCopyToClipboard({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Copied to clipboard',
        message: 'Discount code copied to clipboard',
      })
    },
    onError: () => {
      showNotification({
        type: 'error',
        title: 'Copy failed',
        message: 'Failed to copy to clipboard',
      })
    },
  })

  const createDiscountMutation =
    api.tickets.admin.createDiscountCode.useMutation({
      onSuccess: (data) => {
        showNotification({
          type: 'success',
          title: 'Discount code created',
          message: `Successfully created discount code: ${data.discountCode}`,
        })
        utils.tickets.admin.getDiscountCodesWithUsage.invalidate()
        setLoading(null)
      },
      onError: (error) => {
        console.error('Failed to create discount code:', error)
        showNotification({
          type: 'error',
          title: 'Failed to create discount code',
          message: error.message || 'An unexpected error occurred',
        })
        setLoading(null)
      },
    })

  const deleteDiscountMutation =
    api.tickets.admin.deleteDiscountCode.useMutation({
      onSuccess: () => {
        showNotification({
          type: 'success',
          title: 'Discount code deleted',
          message: 'Successfully deleted discount code',
        })
        utils.tickets.admin.getDiscountCodesWithUsage.invalidate()
        setLoading(null)
      },
      onError: (error) => {
        console.error('Failed to delete discount code:', error)
        showNotification({
          type: 'error',
          title: 'Failed to delete discount code',
          message: error.message || 'An unexpected error occurred',
        })
        setLoading(null)
      },
    })

  const generateDiscountCode = (sponsorName: string): string => {
    const cleanName = sponsorName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const timestamp = Date.now().toString().slice(-4)
    return `${cleanName}${timestamp}`
  }

  const createDiscountCode = async (sponsor: SponsorWithTierInfo) => {
    if (sponsor.ticketEntitlement === 0) {
      showNotification({
        type: 'warning',
        title: 'Cannot create discount code',
        message: `No ticket entitlement for ${sponsor.name} (${sponsor.tier.title} tier)`,
      })
      return
    }

    setLoading(sponsor.id)

    const discountCode = generateDiscountCode(sponsor.name)
    const sponsorSelectedTypes = selectedTicketTypes[sponsor.id] || []

    createDiscountMutation.mutate({
      eventId,
      discountCode,
      numberOfTickets: sponsor.ticketEntitlement,
      sponsorName: sponsor.name,
      tierTitle: sponsor.tier.title,
      selectedTicketTypes: sponsorSelectedTypes,
    })
  }

  const deleteDiscountCode = async (
    discountCode: string | null | undefined,
  ) => {
    if (!discountCode) {
      showNotification({
        type: 'error',
        title: 'Cannot delete discount code',
        message: 'Invalid discount code',
      })
      return
    }

    setLoading(discountCode)
    deleteDiscountMutation.mutate({
      eventId,
      discountCode,
    })
  }

  const statusColorClasses = {
    scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    expired: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    permanent: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  }

  const customDiscountColumns: Column<EventDiscountWithUsage>[] = [
    {
      key: 'code',
      header: 'Discount Code',
      primary: true,
      render: (discount) => (
        <div className="flex items-center space-x-2">
          <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
            {discount.triggerValue || 'N/A'}
          </span>
          {discount.triggerValue && (
            <button
              onClick={() => copyToClipboard(discount.triggerValue || '')}
              className="inline-flex items-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              title="Copy discount code"
            >
              <ClipboardIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (discount) => (
        <span className="inline-flex rounded-full bg-blue-100 px-2 text-xs leading-5 font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          {discount.type} {discount.value}%
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      render: (discount) => (
        <span className="text-sm text-gray-900 dark:text-white">
          {discount.affects === 'total' ? 'Total Order' : discount.affects}
          {discount.affectsValue && ` (${discount.affectsValue})`}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Usage',
      render: (discount) => {
        // Per row, not per response: `actualUsage` present means we counted
        // this event's tickets; absent means we could not, and the number below
        // is the ticket provider's own counter. The old label called that
        // "(estimated)" — but nothing estimates it: it is the vendor's
        // first-party redemption count, arguably firmer than our reconstruction.
        // What differs is the SOURCE, so the source is what we name.
        const { count, fromProvider } = resolveRedemptionCount(discount)
        return (
          <div>
            <div className="text-sm text-gray-900 dark:text-white">
              {count} / {discount.timesTotal || '∞'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {discount.timesTotal
                ? `${Math.round((count / discount.timesTotal) * 100)}% used`
                : 'No limit'}
              {fromProvider && (
                <span
                  className="text-amber-700 dark:text-amber-300"
                  title="This conference's tickets could not be read, so this is the ticket provider's own redemption counter rather than a count of tickets that used the code."
                >
                  {' '}
                  · provider count
                </span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (discount) => {
        const statusInfo = getDiscountStatus(discount)
        return (
          <span
            className={`inline-flex rounded-full px-2 text-xs leading-5 font-semibold ${statusColorClasses[statusInfo.status as keyof typeof statusColorClasses]}`}
          >
            {statusInfo.label}
          </span>
        )
      },
    },
    {
      key: 'affects',
      header: 'Affects',
      render: (discount) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {discount.ticketsOnly ? 'Tickets Only' : 'All Items'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (discount) => (
        <button
          onClick={() => deleteDiscountCode(discount.triggerValue)}
          disabled={loading === discount.triggerValue}
          className="inline-flex items-center rounded-md border border-rose-300 bg-rose-50 p-2 text-rose-700 shadow-xs hover:border-rose-400 hover:bg-rose-100 hover:text-rose-800 disabled:opacity-50 dark:border-rose-500 dark:bg-rose-900/50 dark:text-rose-300 dark:hover:border-rose-400 dark:hover:bg-rose-800/60 dark:hover:text-rose-200"
          title="Delete Code"
        >
          {loading === discount.triggerValue ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          ) : (
            <TrashIcon className="h-4 w-4" />
          )}
        </button>
      ),
    },
  ]

  const sponsorColumns: Column<SponsorWithTierInfo>[] = [
    {
      key: 'sponsor',
      header: 'Sponsor',
      primary: true,
      render: (sponsor) => (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {sponsor.name}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {sponsor.website}
          </div>
        </div>
      ),
    },
    {
      key: 'tierUsage',
      header: 'Tier & Usage',
      render: (sponsor) => {
        const { used, total, fromProvider } = getSponsorUsageStats(sponsor)
        const pillClass =
          used === 0
            ? 'bg-orange-100 text-orange-800 dark:bg-gray-700 dark:text-gray-300'
            : used > total
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
        return (
          <div className="space-y-1">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pillClass}`}
            >
              {sponsor.tier.title}
            </span>
            <div className="text-sm text-gray-900 dark:text-white">
              <span>
                <span className="font-medium">{used}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {' '}
                  / {total}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {' '}
                  tickets
                </span>
              </span>
            </div>
            {/* Same rule as the custom-codes table: when the ticket read
                failed, say whose number this is instead of passing the
                provider's counter off as our own. */}
            {fromProvider && (
              <div
                className="text-xs text-amber-700 dark:text-amber-300"
                title="This conference's tickets could not be read, so this is the ticket provider's own redemption counter."
              >
                provider count
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'eligible',
      header: 'Eligible Ticket Types',
      render: (sponsor) =>
        sponsor.ticketEntitlement > 0 &&
        getSponsorDiscounts(sponsor).length === 0 ? (
          <FilterDropdown
            label={
              discountsLoading
                ? 'Loading...'
                : getSelectedTicketTypesDisplay(sponsor.id)
            }
            activeCount={selectedTicketTypes[sponsor.id]?.length || 0}
            width="wider"
            position="left"
            fixedWidth={true}
          >
            {availableTicketTypes.map((ticketType) => (
              <FilterOption
                key={ticketType.id}
                onClick={() =>
                  toggleTicketType(sponsor.id, String(ticketType.id))
                }
                checked={
                  selectedTicketTypes[sponsor.id]?.includes(
                    String(ticketType.id),
                  ) || false
                }
                type="checkbox"
                keepOpen={true}
              >
                {ticketType.name}
              </FilterOption>
            ))}
          </FilterDropdown>
        ) : getSponsorDiscounts(sponsor).length > 0 ? (
          <div className="text-sm text-gray-900 dark:text-white">
            <div className="font-medium">
              {getExistingDiscountTicketTypes(sponsor)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Discount code created
            </div>
          </div>
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            No ticket entitlement
          </span>
        ),
    },
    {
      key: 'codes',
      header: 'Discount Codes',
      render: (sponsor) =>
        getSponsorDiscounts(sponsor).length > 0 ? (
          <div className="space-y-1">
            {getSponsorDiscounts(sponsor).map((discount, index) => (
              <div key={index} className="flex items-center space-x-2">
                <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                  {discount.triggerValue || 'N/A'}
                </span>
                <button
                  onClick={() => copyToClipboard(discount.triggerValue || '')}
                  className="inline-flex items-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                  title="Copy discount code"
                >
                  <ClipboardIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            No codes created
          </span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (sponsor) =>
        getSponsorDiscounts(sponsor).length > 0 ? (
          <ActionMenu ariaLabel={`Actions for ${sponsor.name}`}>
            <ActionMenuItem
              onClick={() => {
                const sponsorDiscounts = getSponsorDiscounts(sponsor)
                if (sponsorDiscounts.length > 0) {
                  openEmailModal(
                    sponsor,
                    sponsorDiscounts[0].triggerValue || '',
                  )
                }
              }}
              icon={EnvelopeIcon}
              disabled={loading !== null}
            >
              Send Email
            </ActionMenuItem>
            <ActionMenuDivider />
            <ActionMenuItem
              onClick={() => {
                const sponsorDiscounts = getSponsorDiscounts(sponsor)
                if (sponsorDiscounts.length > 0) {
                  deleteDiscountCode(sponsorDiscounts[0].triggerValue)
                }
              }}
              icon={TrashIcon}
              variant="danger"
              disabled={
                getSponsorDiscounts(sponsor).length > 0 &&
                loading === getSponsorDiscounts(sponsor)[0]?.triggerValue
              }
            >
              {getSponsorDiscounts(sponsor).length > 0 &&
              loading === getSponsorDiscounts(sponsor)[0]?.triggerValue
                ? 'Deleting...'
                : 'Delete Code'}
            </ActionMenuItem>
          </ActionMenu>
        ) : (
          <button
            onClick={() => createDiscountCode(sponsor)}
            disabled={loading === sponsor.id || sponsor.ticketEntitlement === 0}
            className="inline-flex items-center rounded-md border border-gray-300 p-2 text-gray-700 shadow-xs hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:focus-visible:outline-gray-400"
            title="Create Code"
          >
            {loading === sponsor.id ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <PlusIcon className="h-4 w-4" />
            )}
          </button>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      {discountsLoading && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-900">
          <div className="flex items-center justify-center">
            <ArrowPathIcon className="h-6 w-6 animate-spin text-blue-600" />
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
              Loading discount codes and ticket types...
            </span>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Custom Discount Codes
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Non-sponsor discount codes and general promotions
            {usageUnavailable && (
              <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                Could not read tickets
              </span>
            )}
          </p>
          {usageUnavailable && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-yellow-800 dark:text-yellow-200">
              <ExclamationTriangleIcon
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                We couldn&apos;t read this event&apos;s tickets, so we
                can&apos;t count which ones used each code. The usage numbers
                below come from the ticket provider&apos;s own redemption
                counter instead. Reload to try again.
              </span>
            </p>
          )}
        </div>

        <div className="p-4">
          <DataTable<EventDiscountWithUsage>
            data={customDiscounts}
            columns={customDiscountColumns}
            keyExtractor={(discount, index) =>
              discount.triggerValue || String(index)
            }
            emptyState={{ title: 'No custom discount codes found' }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Sponsor Discount Codes
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage discount codes for sponsors based on their tier entitlements
          </p>
        </div>

        <div className="p-4">
          <DataTable<SponsorWithTierInfo>
            data={sponsors}
            columns={sponsorColumns}
            keyExtractor={(sponsor) => sponsor.id}
            emptyState={{
              icon: ExclamationTriangleIcon,
              title: 'No sponsors found',
              description:
                'Add sponsors to the conference to manage their discount codes.',
            }}
          />
        </div>
      </div>

      {emailModal.sponsor && (
        <SponsorDiscountEmailModal
          isOpen={emailModal.isOpen}
          onClose={closeEmailModal}
          sponsor={emailModal.sponsor}
          discountCode={emailModal.discountCode}
          domain={conference.domain}
          fromEmail={conference.contactEmail}
          conference={conference}
        />
      )}
    </div>
  )
}
