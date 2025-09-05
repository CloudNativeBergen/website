'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/Button'
import {
  PlusIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import { FilterDropdown, FilterOption } from './FilterDropdown'
import type { EventDiscountWithUsage } from '@/lib/tickets/client'

interface SponsorWithTierInfo {
  id: string
  name: string
  website: string
  logo: string
  tier: {
    title: string
    tagline: string
    tier_type: 'standard' | 'special'
  }
  ticketEntitlement: number
}

interface DiscountCodeManagerProps {
  sponsors: SponsorWithTierInfo[]
  eventId: number
}

export function DiscountCodeManager({
  sponsors,
  eventId,
}: DiscountCodeManagerProps) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  // Fetch existing discounts via tRPC
  const {
    data: discountData,
    isLoading: discountsLoading,
    error: discountsError,
  } = api.tickets.getDiscountCodesWithUsage.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30000, // 30 seconds
  })

  // Show error notifications
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

  // State for ticket type selection per sponsor
  const [selectedTicketTypes, setSelectedTicketTypes] = useState<
    Record<string, string[]>
  >({})

  // Helper function to get sponsor discounts
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

  // Helper function to get existing ticket types for a sponsor's discounts
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

  // Initialize selected ticket types with existing discounts
  useEffect(() => {
    if (availableTicketTypes.length > 0) {
      const initialSelections: Record<string, string[]> = {}

      sponsors.forEach((sponsor) => {
        const existingTypes = getExistingTicketTypes(sponsor)
        if (existingTypes.length > 0) {
          initialSelections[sponsor.id] = existingTypes
        }
      })

      setSelectedTicketTypes(initialSelections)
    }
  }, [
    sponsors,
    availableTicketTypes,
    existingDiscounts,
    getExistingTicketTypes,
  ])

  // Helper function to get usage statistics for a sponsor
  const getSponsorUsageStats = (
    sponsor: SponsorWithTierInfo,
  ): { used: number; total: number } => {
    const sponsorDiscounts = getSponsorDiscounts(sponsor)
    if (sponsorDiscounts.length === 0) {
      return { used: 0, total: sponsor.ticketEntitlement }
    }

    // Sum up usage from all discount codes for this sponsor
    const totalUsed = sponsorDiscounts.reduce((sum, discount) => {
      const usage = discountData?.hasUsageData
        ? discount.actualUsage?.usageCount || 0
        : discount.times || 0
      return sum + usage
    }, 0)

    return { used: totalUsed, total: sponsor.ticketEntitlement }
  }

  // Helper function to get ticket type display for selected types
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

  // Helper function to get ticket types from existing discount codes
  const getExistingDiscountTicketTypes = (
    sponsor: SponsorWithTierInfo,
  ): string => {
    const sponsorDiscounts = getSponsorDiscounts(sponsor)
    if (sponsorDiscounts.length === 0) return ''

    // Get ticket types from the first discount (assuming all discounts for a sponsor have same ticket types)
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
  } // Helper function to toggle ticket type selection for a sponsor
  const toggleTicketType = (sponsorId: string, ticketTypeId: string) => {
    setSelectedTicketTypes((prev) => {
      const sponsorTypes = prev[sponsorId] || []
      const updated = sponsorTypes.includes(ticketTypeId)
        ? sponsorTypes.filter((id) => id !== ticketTypeId)
        : [...sponsorTypes, ticketTypeId]
      return { ...prev, [sponsorId]: updated }
    })
  }

  // Function to get discount codes for a specific sponsor
  // Get all sponsor discount codes to exclude from custom discounts
  const sponsorDiscountCodes = new Set(
    sponsors
      .flatMap((sponsor) =>
        getSponsorDiscounts(sponsor).map((discount) => discount.triggerValue),
      )
      .filter(Boolean),
  )

  // Filter out sponsor discount codes from the custom discounts list
  const customDiscounts = existingDiscounts.filter(
    (discount) => !sponsorDiscountCodes.has(discount.triggerValue),
  )

  // Helper function to determine discount status
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

  // tRPC mutations
  const createDiscountMutation = api.tickets.createDiscountCode.useMutation({
    onSuccess: (data) => {
      showNotification({
        type: 'success',
        title: 'Discount code created',
        message: `Successfully created discount code: ${data.discountCode}`,
      })
      utils.tickets.getDiscountCodesWithUsage.invalidate()
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

  const deleteDiscountMutation = api.tickets.deleteDiscountCode.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Discount code deleted',
        message: 'Successfully deleted discount code',
      })
      utils.tickets.getDiscountCodesWithUsage.invalidate()
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
    // Generate a unique discount code based on sponsor name and timestamp
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

  // Helper functions for rendering

  return (
    <div className="space-y-6">
      {/* Loading State */}
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

      {/* Custom Discount Codes Section */}
      <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Custom Discount Codes
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Non-sponsor discount codes and general promotions
            {discountData && !discountData.hasUsageData && (
              <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                Usage data unavailable
              </span>
            )}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Discount Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Affects
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {customDiscounts.map((discount, index) => (
                <tr
                  key={index}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                      {discount.triggerValue || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex rounded-full bg-blue-100 px-2 text-xs leading-5 font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {discount.type} {discount.value}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-white">
                    {discount.affects === 'total'
                      ? 'Total Order'
                      : discount.affects}
                    {discount.affectsValue && ` (${discount.affectsValue})`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {discountData?.hasUsageData
                        ? `${discount.actualUsage?.usageCount || 0} / ${discount.timesTotal || '∞'}`
                        : `${discount.times || 0} / ${discount.timesTotal || '∞'}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {discount.timesTotal
                        ? discountData?.hasUsageData
                          ? `${Math.round(((discount.actualUsage?.usageCount || 0) / discount.timesTotal) * 100)}% used`
                          : `${Math.round(((discount.times || 0) / discount.timesTotal) * 100)}% used (estimated)`
                        : 'No limit'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      const statusInfo = getDiscountStatus(discount)
                      const colorClasses = {
                        scheduled:
                          'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
                        active:
                          'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                        expired:
                          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                        permanent:
                          'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
                      }
                      return (
                        <span
                          className={`inline-flex rounded-full px-2 text-xs leading-5 font-semibold ${colorClasses[statusInfo.status as keyof typeof colorClasses]}`}
                        >
                          {statusInfo.label}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {discount.ticketsOnly ? 'Tickets Only' : 'All Items'}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium whitespace-nowrap">
                    <Button
                      onClick={() => deleteDiscountCode(discount.triggerValue)}
                      disabled={loading === discount.triggerValue}
                      variant="outline"
                      size="sm"
                      className="border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100 hover:text-rose-800 dark:border-rose-500 dark:bg-rose-900/50 dark:text-rose-300 dark:hover:border-rose-400 dark:hover:bg-rose-800/60 dark:hover:text-rose-200"
                    >
                      {loading === discount.triggerValue ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <TrashIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {customDiscounts.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No custom discount codes found
            </p>
          </div>
        )}
      </div>

      {/* Sponsors Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Sponsor Discount Codes
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage discount codes for sponsors based on their tier entitlements
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Sponsor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Tier & Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Eligible Ticket Types
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Discount Codes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {sponsors.map((sponsor) => (
                <tr
                  key={sponsor.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {sponsor.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {sponsor.website}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          sponsor.tier.tier_type === 'special'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                        }`}
                      >
                        {sponsor.tier.title}
                      </span>
                      <div className="text-sm text-gray-900 dark:text-white">
                        {(() => {
                          const { used, total } = getSponsorUsageStats(sponsor)
                          return (
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
                          )
                        })()}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {sponsor.ticketEntitlement > 0 &&
                    getSponsorDiscounts(sponsor).length === 0 ? (
                      <FilterDropdown
                        label={
                          discountsLoading
                            ? 'Loading...'
                            : getSelectedTicketTypesDisplay(sponsor.id)
                        }
                        activeCount={
                          selectedTicketTypes[sponsor.id]?.length || 0
                        }
                        width="wider"
                        position="left"
                        fixedWidth={true}
                      >
                        {availableTicketTypes.map((ticketType) => (
                          <FilterOption
                            key={ticketType.id}
                            onClick={() =>
                              toggleTicketType(
                                sponsor.id,
                                String(ticketType.id),
                              )
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
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {getSponsorDiscounts(sponsor).length > 0 ? (
                      <div className="space-y-1">
                        {getSponsorDiscounts(sponsor).map((discount, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 dark:bg-gray-800"
                          >
                            <span className="font-mono text-sm text-gray-900 dark:text-white">
                              {discount.triggerValue || 'N/A'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        No codes created
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
                    {getSponsorDiscounts(sponsor).length > 0 ? (
                      <Button
                        onClick={() => {
                          const sponsorDiscounts = getSponsorDiscounts(sponsor)
                          if (sponsorDiscounts.length > 0) {
                            deleteDiscountCode(sponsorDiscounts[0].triggerValue)
                          }
                        }}
                        disabled={
                          getSponsorDiscounts(sponsor).length > 0 &&
                          loading ===
                            getSponsorDiscounts(sponsor)[0]?.triggerValue
                        }
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-1 border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100 hover:text-rose-800 dark:border-rose-500 dark:bg-rose-900/50 dark:text-rose-300 dark:hover:border-rose-400 dark:hover:bg-rose-800/60 dark:hover:text-rose-200"
                      >
                        {getSponsorDiscounts(sponsor).length > 0 &&
                        loading ===
                          getSponsorDiscounts(sponsor)[0]?.triggerValue ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <TrashIcon className="h-4 w-4" />
                        )}
                        <span>
                          {getSponsorDiscounts(sponsor).length > 0 &&
                          loading ===
                            getSponsorDiscounts(sponsor)[0]?.triggerValue
                            ? 'Deleting...'
                            : 'Delete Code'}
                        </span>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => createDiscountCode(sponsor)}
                        disabled={
                          loading === sponsor.id ||
                          sponsor.ticketEntitlement === 0
                        }
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-1"
                      >
                        {loading === sponsor.id ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlusIcon className="h-4 w-4" />
                        )}
                        <span>
                          {loading === sponsor.id
                            ? 'Creating...'
                            : 'Create Code'}
                        </span>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sponsors.length === 0 && (
          <div className="py-12 text-center">
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No sponsors found
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Add sponsors to the conference to manage their discount codes.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
