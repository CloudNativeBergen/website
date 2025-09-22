'use client'

import { useState, Fragment } from 'react'
import {
  UserIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline'
import type { GroupedOrder } from '@/lib/tickets/types'
import { PaymentDetailsModal } from './PaymentDetailsModal'
import { formatCurrency } from '@/lib/format'
import { api } from '@/lib/trpc/client'

interface ExpandableOrdersTableProps {
  orders: GroupedOrder[]
  customerId?: number
  eventId?: number
}

export function ExpandableOrdersTable({
  orders,
  customerId,
  eventId,
}: ExpandableOrdersTableProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set())
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)

  const {
    data: paymentDetailsData,
    isLoading: paymentDetailsLoading,
    error: paymentDetailsError,
  } = api.tickets.getPaymentDetails.useQuery(
    { orderId: selectedOrderId! },
    {
      enabled: selectedOrderId !== null,
      retry: 1,
    },
  )

  const toggleExpanded = (orderId: number) => {
    setExpandedOrders((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(orderId)) {
        newSet.delete(orderId)
      } else {
        newSet.add(orderId)
      }
      return newSet
    })
  }

  const handleViewPaymentDetails = (orderId: number) => {
    setSelectedOrderId(orderId)
    setPaymentModalOpen(true)
  }

  const closePaymentModal = () => {
    setPaymentModalOpen(false)
    setSelectedOrderId(null)
  }

  const formatCategoryLabel = (category: string): string => {
    const lowerCategory = category.toLowerCase()

    if (
      lowerCategory.includes('workshop') &&
      lowerCategory.includes('conference')
    ) {
      const dayMatch = category.match(/(\d+)\s*day/i)
      const days = dayMatch ? dayMatch[1] : '2'
      return `Workshop + Conference (${days} Days)`
    }

    if (lowerCategory.includes('early') && lowerCategory.includes('bird')) {
      const dayMatch = category.match(/(\d+)\s*day/i)
      const days = dayMatch ? dayMatch[1] : '1'
      return `Early Bird (${days} Day)`
    }

    return category
      .split(/[\s_-]+/)
      .map((word) => {
        if (/^\d/.test(word) || word.includes('(') || word.includes(')')) {
          return word
        }

        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      })
      .join(' ')
  }

  const getCategoryStyle = (category: string) => {
    const formatted = formatCategoryLabel(category)
    const isLong = formatted.length > 15

    return {
      formatted,
      className: isLong
        ? 'inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 max-w-32 truncate dark:bg-blue-900 dark:text-blue-300'
        : 'inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      title: isLong ? formatted : undefined,
    }
  }

  const getCheckinOrderUrl = (orderId: number): string | null => {
    if (!customerId || !eventId) return null
    return `https://app.checkin.no/customer/${customerId}/event/${eventId}/order/${orderId}`
  }

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-gray-700">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="w-16 px-2 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Order
              </th>
              <th className="min-w-0 px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Customer Info
              </th>
              <th className="w-40 px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Categories
              </th>
              <th className="w-20 px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Qty/Price
              </th>
              <th className="w-16 px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Status
              </th>
              <th className="w-12 px-2 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {orders.map((order) => {
              const isExpanded = expandedOrders.has(order.order_id)
              const primaryTicket = order.tickets[0]
              const hasMultipleTickets = order.tickets.length > 1
              const checkinOrderUrl = getCheckinOrderUrl(order.order_id)

              return (
                <Fragment key={order.order_id}>
                  <tr className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                    <td className="px-2 py-4 whitespace-nowrap">
                      <div className="flex flex-col items-start">
                        {hasMultipleTickets && (
                          <button
                            onClick={() => toggleExpanded(order.order_id)}
                            className="mb-1 rounded p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            {isExpanded ? (
                              <ChevronDownIcon className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                            ) : (
                              <ChevronRightIcon className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                            )}
                          </button>
                        )}
                        {checkinOrderUrl ? (
                          <a
                            href={checkinOrderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs font-medium text-indigo-600 hover:text-indigo-900 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            {order.order_id}
                          </a>
                        ) : (
                          <span className="font-mono text-xs font-medium text-gray-900 dark:text-white">
                            {order.order_id}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {primaryTicket.crm.first_name}{' '}
                          {primaryTicket.crm.last_name}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                          <a
                            href={`mailto:${primaryTicket.crm.email}`}
                            className="text-indigo-600 hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            {primaryTicket.crm.email}
                          </a>
                        </div>
                        {(() => {
                          const workTitle = order.fields.find(
                            (f: { key: string; value: string }) =>
                              f.key === 'work_title',
                          )?.value
                          const company = order.fields.find(
                            (f: { key: string; value: string }) =>
                              f.key === 'company',
                          )?.value

                          if (workTitle || company) {
                            return (
                              <div className="mt-0.5 truncate text-xs font-medium text-gray-600 dark:text-gray-300">
                                {workTitle && company
                                  ? `${workTitle} • ${company}`
                                  : workTitle || company}
                              </div>
                            )
                          }
                          return null
                        })()}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex max-w-40 flex-wrap gap-1">
                        {order.categories.map((category) => {
                          const { formatted, className, title } =
                            getCategoryStyle(category)
                          return (
                            <span
                              key={category}
                              className={`${className} text-xs`}
                              title={title}
                            >
                              {formatted}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="text-center">
                        <div className="text-sm font-bold text-gray-900 dark:text-white">
                          {order.totalTickets}×
                        </div>
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-300">
                          {formatCurrency(order.totalAmount)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      {order.amountLeft === 0 ? (
                        <div className="flex items-center justify-center">
                          <div className="inline-flex items-center">
                            <div className="mr-1.5 h-3 w-3 rounded-full bg-green-500"></div>
                            <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                              Paid
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <div className="inline-flex items-center">
                            <div className="mr-1.5 h-3 w-3 rounded-full bg-amber-500"></div>
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                              Due
                            </span>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-4 whitespace-nowrap">
                      <div className="flex justify-center">
                        <button
                          onClick={() =>
                            handleViewPaymentDetails(order.order_id)
                          }
                          className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-500 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
                          title="View Payment Details"
                        >
                          <CreditCardIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {hasMultipleTickets && isExpanded && (
                    <tr>
                      <td
                        colSpan={6}
                        className="bg-gray-50 px-6 py-4 dark:bg-gray-800"
                      >
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                            Attendees ({order.tickets.length} tickets):
                          </h4>
                          <div className="grid gap-2">
                            {order.tickets.map((ticket) => (
                              <div
                                key={ticket.id}
                                className="flex items-center justify-between rounded-md border bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
                              >
                                <div className="flex items-center space-x-3">
                                  <UserIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                  <div>
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                      {ticket.customer_name ||
                                        `${ticket.crm.first_name} ${ticket.crm.last_name}`}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      Ticket ID: {ticket.id}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                                    {formatCategoryLabel(ticket.category)}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatCurrency(parseFloat(ticket.sum))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <PaymentDetailsModal
        isOpen={paymentModalOpen}
        onClose={closePaymentModal}
        paymentDetails={paymentDetailsData?.paymentDetails || null}
        isLoading={paymentDetailsLoading}
        error={paymentDetailsError?.message || null}
      />
    </div>
  )
}
