'use client'
import { Dialog, Transition, TransitionChild } from '@headlessui/react'
import { useTheme } from 'next-themes'
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline'
import type { CheckinPayOrder } from '@/lib/tickets/client'
import { formatCurrency } from '@/lib/format'
import { isPaymentOverdue, getDaysOverdue } from '@/lib/tickets/client'
import { SkeletonModal } from './LoadingSkeleton'

interface PaymentDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  paymentDetails: CheckinPayOrder | null
  isLoading: boolean
  error: string | null
}

export function PaymentDetailsModal({
  isOpen,
  onClose,
  paymentDetails,
  isLoading,
  error,
}: PaymentDetailsModalProps) {
  const { theme } = useTheme()
  // Helper to format currency from string amounts
  const formatCurrencyFromString = (amount: string): string => {
    return formatCurrency(parseFloat(amount))
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('nb-NO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getPaymentStatusColor = (status: string, isOverdue: boolean) => {
    if (status === 'PAID')
      return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/50'
    if (isOverdue)
      return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/50'
    if (status === 'PENDING')
      return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/50'
    return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700/50'
  }

  const overdue = paymentDetails ? isPaymentOverdue(paymentDetails) : false
  const daysOverdue = paymentDetails ? getDaysOverdue(paymentDetails) : 0

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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
                  <Dialog.Title className="flex items-center text-lg font-semibold text-gray-900 dark:text-white">
                    <CreditCardIcon className="mr-2 h-6 w-6 text-gray-400 dark:text-gray-500" />
                    Payment Details
                    {paymentDetails && (
                      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                        Order #{paymentDetails.orderId}
                      </span>
                    )}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded-md text-gray-400 hover:text-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-gray-500 dark:hover:text-gray-300 dark:focus:ring-indigo-400"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="p-6">
                  {isLoading && (
                    <div className="py-8">
                      <SkeletonModal
                        showHeader={true}
                        contentRows={5}
                        className="px-0"
                      />
                    </div>
                  )}

                  {error && (
                    <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/50">
                      <div className="flex">
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-400 dark:text-red-300" />
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                            Error
                          </h3>
                          <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                            {error}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentDetails && !isLoading && !error && (
                    <div className="space-y-6">
                      {/* Payment Status */}
                      <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                        <h3 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                          Payment Status
                        </h3>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            {paymentDetails.paid ? (
                              <CheckCircleIcon className="mr-2 h-5 w-5 text-green-600" />
                            ) : overdue ? (
                              <ExclamationTriangleIcon className="mr-2 h-5 w-5 text-red-600" />
                            ) : (
                              <ClockIcon className="mr-2 h-5 w-5 text-yellow-600" />
                            )}
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getPaymentStatusColor(
                                paymentDetails.paymentStatus,
                                overdue,
                              )}`}
                            >
                              {paymentDetails.paid
                                ? 'Paid in Full'
                                : overdue
                                  ? `Overdue (${daysOverdue} days)`
                                  : paymentDetails.paymentStatus}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatCurrencyFromString(paymentDetails.sumLeft)}{' '}
                              remaining
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              of {formatCurrencyFromString(paymentDetails.sum)}{' '}
                              total
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Payment Information */}
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div>
                          <h3 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                            Payment Information
                          </h3>
                          <dl className="space-y-2">
                            <div className="flex justify-between">
                              <dt className="text-sm text-gray-500 dark:text-gray-400">
                                Payment Method:
                              </dt>
                              <dd className="text-sm text-gray-900 dark:text-white">
                                {paymentDetails.paymentMethod}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-sm text-gray-500 dark:text-gray-400">
                                Currency:
                              </dt>
                              <dd className="text-sm text-gray-900 dark:text-white">
                                {paymentDetails.currency || 'NOK'}
                              </dd>
                            </div>
                            {paymentDetails.invoiceReference && (
                              <div className="flex justify-between">
                                <dt className="text-sm text-gray-500 dark:text-gray-400">
                                  Invoice Ref:
                                </dt>
                                <dd className="text-sm text-gray-900 dark:text-white">
                                  {paymentDetails.invoiceReference}
                                </dd>
                              </div>
                            )}
                            {paymentDetails.kid && (
                              <div className="flex justify-between">
                                <dt className="text-sm text-gray-500 dark:text-gray-400">
                                  KID:
                                </dt>
                                <dd className="text-sm text-gray-900 dark:text-white">
                                  {paymentDetails.kid}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        <div>
                          <h3 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                            Important Dates
                          </h3>
                          <dl className="space-y-2">
                            <div className="flex justify-between">
                              <dt className="text-sm text-gray-500 dark:text-gray-400">
                                Created:
                              </dt>
                              <dd className="text-sm text-gray-900 dark:text-white">
                                {formatDate(paymentDetails.createdAt)}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-sm text-gray-500 dark:text-gray-400">
                                Due Date:
                              </dt>
                              <dd
                                className={`text-sm ${overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}
                              >
                                {formatDate(paymentDetails.dueAt)}
                              </dd>
                            </div>
                            {paymentDetails.invoiceDate && (
                              <div className="flex justify-between">
                                <dt className="text-sm text-gray-500 dark:text-gray-400">
                                  Invoice Date:
                                </dt>
                                <dd className="text-sm text-gray-900 dark:text-white">
                                  {formatDate(paymentDetails.invoiceDate)}
                                </dd>
                              </div>
                            )}
                            {paymentDetails.deliveryDate && (
                              <div className="flex justify-between">
                                <dt className="text-sm text-gray-500 dark:text-gray-400">
                                  Delivery Date:
                                </dt>
                                <dd className="text-sm text-gray-900 dark:text-white">
                                  {formatDate(paymentDetails.deliveryDate)}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      </div>

                      {/* Customer Information */}
                      <div>
                        <h3 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                          Customer Information
                        </h3>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
                            <h4 className="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                              Contact
                            </h4>
                            <div className="text-sm text-gray-900 dark:text-white">
                              {paymentDetails.contactCrm.firstName}{' '}
                              {paymentDetails.contactCrm.lastName}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {paymentDetails.contactCrm.email.email}
                            </div>
                          </div>
                          {paymentDetails.billingCrm && (
                            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
                              <h4 className="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                                Billing
                              </h4>
                              <div className="text-sm text-gray-900 dark:text-white">
                                {paymentDetails.billingCrm.firstName}{' '}
                                {paymentDetails.billingCrm.lastName}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {paymentDetails.billingCrm.email.email}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Required */}
                      {paymentDetails.actionRequired && (
                        <div className="rounded-md bg-yellow-50 p-4 dark:bg-yellow-900/50">
                          <div className="flex">
                            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 dark:text-yellow-300" />
                            <div className="ml-3">
                              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                Action Required
                              </h3>
                              <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                                {paymentDetails.actionRequired}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/50">
                  <button
                    onClick={onClose}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:focus:ring-indigo-400"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
