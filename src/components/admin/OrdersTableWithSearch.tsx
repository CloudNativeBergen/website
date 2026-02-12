'use client'

import { useState, useMemo, Fragment, useCallback } from 'react'
import {
  UserIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CreditCardIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import type { GroupedOrder } from '@/lib/tickets/types'
import { PaymentDetailsModal } from './PaymentDetailsModal'
import { formatCurrency } from '@/lib/format'
import { api } from '@/lib/trpc/client'
import { SearchInput } from '@/components/SearchInput'

interface OrdersTableWithSearchProps {
  orders: GroupedOrder[]
  customerId?: number
  eventId?: number
}

type PaymentFilter = 'all' | 'paid' | 'unpaid' | 'overdue'

interface PaymentStatus {
  status: string
  label: string
  colorClass: string
}

const PAYMENT_TERM_DAYS = 30

const STATUS_STYLES = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  due: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
} as const

export function OrdersTableWithSearch({
  orders,
  customerId,
  eventId,
}: OrdersTableWithSearchProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
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

  const isOrderOverdue = useCallback((order: GroupedOrder): boolean => {
    if (order.amountLeft === 0 || !order.order_date) return false

    const orderDateTime = new Date(order.order_date)
    const now = new Date()
    const daysDiff = Math.floor(
      (now.getTime() - orderDateTime.getTime()) / (1000 * 60 * 60 * 24),
    )

    return daysDiff > PAYMENT_TERM_DAYS
  }, [])

  const getPaymentStatus = useCallback(
    (order: GroupedOrder): PaymentStatus => {
      if (order.amountLeft === 0) {
        return {
          status: 'paid',
          label: 'Paid',
          colorClass: STATUS_STYLES.paid,
        }
      }

      if (isOrderOverdue(order)) {
        return {
          status: 'overdue',
          label: 'Overdue',
          colorClass: STATUS_STYLES.overdue,
        }
      }

      return {
        status: 'due',
        label: 'Due',
        colorClass: STATUS_STYLES.due,
      }
    },
    [isOrderOverdue],
  )

  const filteredOrders = useMemo(() => {
    let filtered = orders

    if (paymentFilter === 'paid') {
      filtered = filtered.filter((order) => order.amountLeft === 0)
    } else if (paymentFilter === 'unpaid') {
      filtered = filtered.filter((order) => order.amountLeft > 0)
    } else if (paymentFilter === 'overdue') {
      filtered = filtered.filter((order) => isOrderOverdue(order))
    }

    if (!searchTerm.trim()) return filtered

    const searchLower = searchTerm.toLowerCase()
    return filtered.filter((order) => {
      if (order.order_id.toString().includes(searchLower)) return true

      return order.tickets.some((ticket) => {
        const fullName =
          `${ticket.crm.first_name} ${ticket.crm.last_name}`.toLowerCase()
        const email = ticket.crm.email.toLowerCase()
        const customerName = ticket.customer_name?.toLowerCase() || ''

        const workTitle =
          order.fields
            .find((f) => f.key === 'work_title')
            ?.value.toLowerCase() || ''
        const company =
          order.fields.find((f) => f.key === 'company')?.value.toLowerCase() ||
          ''

        return (
          fullName.includes(searchLower) ||
          email.includes(searchLower) ||
          customerName.includes(searchLower) ||
          workTitle.includes(searchLower) ||
          company.includes(searchLower) ||
          ticket.category.toLowerCase().includes(searchLower)
        )
      })
    })
  }, [orders, searchTerm, paymentFilter, isOrderOverdue])

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by name, email, company, order ID, or ticket type..."
          className="flex-1"
          inputClassName="block w-full rounded-lg border border-gray-300 bg-white py-3 pr-3 pl-10 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
        />

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <FunnelIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
            className="appearance-none rounded-lg border border-gray-300 bg-white py-3 pr-8 pl-10 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
          >
            <option value="all">All Orders</option>
            <option value="paid">Paid Orders</option>
            <option value="unpaid">Unpaid Orders</option>
            <option value="overdue">Overdue Orders</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          {searchTerm || paymentFilter !== 'all' ? (
            <>
              Showing{' '}
              <span className="font-medium">{filteredOrders.length}</span> of{' '}
              <span className="font-medium">{orders.length}</span> orders
              {(searchTerm || paymentFilter !== 'all') && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-200 dark:hover:bg-indigo-800"
                    >
                      Clear search
                      <span className="ml-1">×</span>
                    </button>
                  )}
                  {paymentFilter !== 'all' && (
                    <button
                      onClick={() => setPaymentFilter('all')}
                      className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-800"
                    >
                      {paymentFilter === 'paid'
                        ? 'Paid filter'
                        : paymentFilter === 'unpaid'
                          ? 'Unpaid filter'
                          : 'Overdue filter'}
                      <span className="ml-1">×</span>
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              Showing <span className="font-medium">{orders.length}</span> order
              {orders.length !== 1 ? 's' : ''}
            </>
          )}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5 lg:block dark:bg-gray-900 dark:ring-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Order
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Categories
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Tickets
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {filteredOrders.map((order) => {
                const isExpanded = expandedOrders.has(order.order_id)
                const primaryTicket = order.tickets[0]
                const hasMultipleTickets = order.tickets.length > 1
                const checkinOrderUrl = getCheckinOrderUrl(order.order_id)
                const workTitle = order.fields.find(
                  (f) => f.key === 'work_title',
                )?.value
                const company = order.fields.find(
                  (f) => f.key === 'company',
                )?.value

                return (
                  <Fragment key={order.order_id}>
                    <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-4 whitespace-nowrap">
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
                              className="font-mono text-sm font-medium text-indigo-600 hover:text-indigo-900 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                              {order.order_id}
                            </a>
                          ) : (
                            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                              {order.order_id}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {primaryTicket.crm.first_name}{' '}
                            {primaryTicket.crm.last_name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            <a
                              href={`mailto:${primaryTicket.crm.email}`}
                              className="text-indigo-600 hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                              {primaryTicket.crm.email}
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {workTitle && (
                            <div className="font-medium">{workTitle}</div>
                          )}
                          {company && (
                            <div className="text-gray-500 dark:text-gray-400">
                              {company}
                            </div>
                          )}
                          {!workTitle && !company && (
                            <span className="text-gray-400 dark:text-gray-500">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
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
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {order.totalTickets}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatCurrency(order.totalAmount)}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {(() => {
                          const { label, colorClass } = getPaymentStatus(order)
                          return (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
                            >
                              {label}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <button
                          onClick={() =>
                            handleViewPaymentDetails(order.order_id)
                          }
                          className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-500 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
                          title="View Payment Details"
                        >
                          <CreditCardIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    {hasMultipleTickets && isExpanded && (
                      <tr>
                        <td
                          colSpan={8}
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
      </div>

      <div className="space-y-4 lg:hidden">
        {filteredOrders.map((order) => {
          const primaryTicket = order.tickets[0]
          const hasMultipleTickets = order.tickets.length > 1
          const checkinOrderUrl = getCheckinOrderUrl(order.order_id)
          const workTitle = order.fields.find(
            (f) => f.key === 'work_title',
          )?.value
          const company = order.fields.find((f) => f.key === 'company')?.value

          return (
            <div
              key={order.order_id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {hasMultipleTickets && (
                    <button
                      onClick={() => toggleExpanded(order.order_id)}
                      className="rounded p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      {expandedOrders.has(order.order_id) ? (
                        <ChevronDownIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      )}
                    </button>
                  )}
                  {checkinOrderUrl ? (
                    <a
                      href={checkinOrderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm font-medium text-indigo-600 hover:text-indigo-900 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      #{order.order_id}
                    </a>
                  ) : (
                    <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                      #{order.order_id}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {(() => {
                    const { label, colorClass } = getPaymentStatus(order)
                    return (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${colorClass}`}
                      >
                        {label}
                      </span>
                    )
                  })()}
                  <button
                    onClick={() => handleViewPaymentDetails(order.order_id)}
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-500 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
                  >
                    <CreditCardIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {primaryTicket.crm.first_name} {primaryTicket.crm.last_name}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    <a
                      href={`mailto:${primaryTicket.crm.email}`}
                      className="text-indigo-600 hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      {primaryTicket.crm.email}
                    </a>
                  </div>
                  {(workTitle || company) && (
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {workTitle && company
                        ? `${workTitle} • ${company}`
                        : workTitle || company}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {order.categories.map((category) => {
                    const { formatted, className, title } =
                      getCategoryStyle(category)
                    return (
                      <span key={category} className={className} title={title}>
                        {formatted}
                      </span>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {order.totalTickets} ticket
                    {order.totalTickets !== 1 ? 's' : ''}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(order.totalAmount)}
                  </span>
                </div>
              </div>

              {hasMultipleTickets && expandedOrders.has(order.order_id) && (
                <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                    Attendees ({order.tickets.length} tickets):
                  </h4>
                  <div className="space-y-2">
                    {order.tickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="flex items-center justify-between rounded-md border bg-gray-50 p-2 dark:border-gray-600 dark:bg-gray-800"
                      >
                        <div className="flex items-center space-x-2">
                          <UserIcon className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {ticket.customer_name ||
                                `${ticket.crm.first_name} ${ticket.crm.last_name}`}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {formatCategoryLabel(ticket.category)}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {formatCurrency(parseFloat(ticket.sum))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filteredOrders.length === 0 && (
        <div className="py-12 text-center">
          {searchTerm || paymentFilter !== 'all' ? (
            <>
              <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                No orders found
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {searchTerm && paymentFilter !== 'all'
                  ? `No ${paymentFilter} orders match your search criteria.`
                  : searchTerm
                    ? 'No orders match your search criteria.'
                    : `No ${paymentFilter} orders found.`}{' '}
                Try adjusting your filters.
              </p>
            </>
          ) : (
            <>
              <UserIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                No orders found
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No tickets have been sold for this event yet.
              </p>
            </>
          )}
        </div>
      )}

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
