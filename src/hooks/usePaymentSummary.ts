'use client'

import { useEffect, useState } from 'react'
import type { CheckinPayOrder } from '@/lib/tickets/types'
import { isPaymentOverdue, getDaysOverdue } from '@/lib/tickets/api'
import { api } from '@/lib/trpc/client'

export interface PaymentSummary {
  totalOrders: number
  paidOrders: number
  overdueOrders: number
  totalOverdueAmount: number
  averageDaysOverdue: number
}

export function usePaymentSummary(orderIds: number[]) {
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentDetails, setPaymentDetails] = useState<CheckinPayOrder[]>([])

  const paymentQueries = orderIds.map((orderId) =>
    api.tickets.getPaymentDetails.useQuery(
      { orderId },
      {
        enabled: orderId > 0,
        retry: 1,
        staleTime: 5 * 60 * 1000,
      },
    ),
  )

  useEffect(() => {
    if (orderIds.length === 0) {
      setSummary({
        totalOrders: 0,
        paidOrders: 0,
        overdueOrders: 0,
        totalOverdueAmount: 0,
        averageDaysOverdue: 0,
      })
      return
    }

    const allLoaded = paymentQueries.every((query) => !query.isLoading)
    const hasErrors = paymentQueries.some((query) => query.isError)

    setLoading(!allLoaded)

    if (hasErrors) {
      const firstError = paymentQueries.find((query) => query.isError)?.error
      setError(firstError?.message || 'Failed to fetch payment details')
      return
    }

    if (allLoaded) {
      const validPaymentDetails = paymentQueries
        .map((query) => query.data?.paymentDetails)
        .filter((detail): detail is CheckinPayOrder => detail !== undefined)

      setPaymentDetails(validPaymentDetails)

      const totalOrders = validPaymentDetails.length
      const paidOrders = validPaymentDetails.filter(
        (detail) => detail.paid,
      ).length
      const overduePayments = validPaymentDetails.filter((detail) =>
        isPaymentOverdue(detail),
      )
      const overdueOrders = overduePayments.length
      const totalOverdueAmount = overduePayments.reduce(
        (sum, detail) => sum + parseFloat(detail.sumLeft),
        0,
      )
      const averageDaysOverdue =
        overdueOrders > 0
          ? overduePayments.reduce(
              (sum, detail) => sum + getDaysOverdue(detail),
              0,
            ) / overdueOrders
          : 0

      setSummary({
        totalOrders,
        paidOrders,
        overdueOrders,
        totalOverdueAmount,
        averageDaysOverdue: Math.round(averageDaysOverdue),
      })
      setError(null)
    }
  }, [paymentQueries, orderIds])

  return { summary, loading, error, paymentDetails }
}
