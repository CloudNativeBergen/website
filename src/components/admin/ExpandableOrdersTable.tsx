'use client'

import { useState, Fragment } from 'react'
import {
  TicketIcon,
  UserIcon,
  HashtagIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import type { GroupedOrder } from '@/lib/tickets/checkin'

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

  // Function to format numbers consistently for SSR
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Function to format category labels
  const formatCategoryLabel = (category: string): string => {
    // Handle specific known patterns first
    const lowerCategory = category.toLowerCase()

    // Handle workshop + conference pattern
    if (
      lowerCategory.includes('workshop') &&
      lowerCategory.includes('conference')
    ) {
      const dayMatch = category.match(/(\d+)\s*day/i)
      const days = dayMatch ? dayMatch[1] : '2'
      return `Workshop + Conference (${days} Days)`
    }

    // Handle early bird pattern
    if (lowerCategory.includes('early') && lowerCategory.includes('bird')) {
      const dayMatch = category.match(/(\d+)\s*day/i)
      const days = dayMatch ? dayMatch[1] : '1'
      return `Early Bird (${days} Day)`
    }

    // Handle other patterns - convert to proper title case
    return category
      .split(/[\s_-]+/)
      .map((word) => {
        // Handle numbers and parentheses
        if (/^\d/.test(word) || word.includes('(') || word.includes(')')) {
          return word
        }
        // Capitalize first letter
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      })
      .join(' ')
  }

  // Function to get category display style based on length
  const getCategoryStyle = (category: string) => {
    const formatted = formatCategoryLabel(category)
    const isLong = formatted.length > 15

    return {
      formatted,
      className: isLong
        ? 'inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 max-w-32 truncate'
        : 'inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800',
      title: isLong ? formatted : undefined, // Add tooltip for truncated items
    }
  }

  // Function to generate Checkin.no order URL
  const getCheckinOrderUrl = (orderId: number): string | null => {
    if (!customerId || !eventId) return null
    return `https://app.checkin.no/customer/${customerId}/event/${eventId}/order/${orderId}`
  }

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                Order ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                Customer & Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                Title & Company
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                Categories
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                Quantity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                Total Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                Payment Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {orders.map((order) => {
              const isExpanded = expandedOrders.has(order.order_id)
              const primaryTicket = order.tickets[0] // Use first ticket for primary customer info
              const hasMultipleTickets = order.tickets.length > 1
              const checkinOrderUrl = getCheckinOrderUrl(order.order_id)

              return (
                <Fragment key={order.order_id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {hasMultipleTickets ? (
                          <button
                            onClick={() => toggleExpanded(order.order_id)}
                            className="mr-2 rounded p-1 hover:bg-gray-200"
                          >
                            {isExpanded ? (
                              <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                            )}
                          </button>
                        ) : (
                          <div className="mr-2 h-6 w-6" /> // Spacer for alignment
                        )}
                        <HashtagIcon className="mr-2 h-4 w-4 text-gray-400" />
                        {checkinOrderUrl ? (
                          <a
                            href={checkinOrderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-900 hover:underline"
                          >
                            {order.order_id}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-gray-900">
                            {order.order_id}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <UserIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">
                            {primaryTicket.crm.first_name}{' '}
                            {primaryTicket.crm.last_name}
                          </div>
                          <div className="mt-1 flex items-center">
                            <a
                              href={`mailto:${primaryTicket.crm.email}`}
                              className="truncate text-xs text-indigo-600 hover:text-indigo-900"
                            >
                              {primaryTicket.crm.email}
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="min-w-0">
                        {(() => {
                          const workTitle = order.fields.find(
                            (f: { key: string; value: string }) =>
                              f.key === 'work_title',
                          )?.value
                          const company = order.fields.find(
                            (f: { key: string; value: string }) =>
                              f.key === 'company',
                          )?.value

                          if (!workTitle && !company) {
                            return (
                              <span className="text-sm text-gray-400">—</span>
                            )
                          }

                          return (
                            <div>
                              {workTitle && (
                                <div className="text-sm font-medium text-gray-900">
                                  {workTitle}
                                </div>
                              )}
                              {company && (
                                <div className="mt-0.5 text-xs text-gray-600">
                                  {company}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {order.categories.map((category) => {
                          const { formatted, className, title } =
                            getCategoryStyle(category)
                          return (
                            <span
                              key={category}
                              className={className}
                              title={title}
                            >
                              {formatted}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <TicketIcon className="mr-2 h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-900">
                          {order.totalTickets}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(order.totalAmount)} NOK
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {order.amountLeft === 0 ? (
                        <div className="flex items-center">
                          <CheckCircleIcon className="mr-2 h-4 w-4 text-green-600" />
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                            Paid in Full
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <ExclamationTriangleIcon className="mr-2 h-4 w-4 text-amber-600" />
                          <div>
                            <div className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                              Outstanding
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {formatCurrency(order.amountLeft)} NOK remaining
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                  {hasMultipleTickets && isExpanded && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50 px-6 py-4">
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-gray-900">
                            Attendees ({order.tickets.length} tickets):
                          </h4>
                          <div className="grid gap-2">
                            {order.tickets.map((ticket) => (
                              <div
                                key={ticket.id}
                                className="flex items-center justify-between rounded-md border bg-white p-3"
                              >
                                <div className="flex items-center space-x-3">
                                  <UserIcon className="h-4 w-4 text-gray-400" />
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {ticket.customer_name ||
                                        `${ticket.crm.first_name} ${ticket.crm.last_name}`}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      Ticket ID: {ticket.id}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-gray-900">
                                    {formatCategoryLabel(ticket.category)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {formatCurrency(parseFloat(ticket.sum))} NOK
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
    </div>
  )
}
