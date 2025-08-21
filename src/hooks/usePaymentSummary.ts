'use client'

import { useEffect, useState } from 'react'
import type { CheckinPayOrder } from '@/lib/tickets/checkin'
import { isPaymentOverdue, getDaysOverdue } from '@/lib/tickets/checkin'

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

    const fetchPaymentSummary = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch payment details for all orders
        const promises = orderIds.map(async (orderId) => {
          try {
            const response = await fetch(
              `/admin/api/payment-details?orderId=${orderId}`,
            )
            if (response.ok) {
              return (await response.json()) as CheckinPayOrder
            }
            return null
          } catch (err) {
            console.warn(
              `Failed to fetch payment details for order ${orderId}:`,
              err,
            )
            return null
          }
        })

        const paymentDetails = (await Promise.allSettled(promises))
          .map((result) =>
            result.status === 'fulfilled' ? result.value : null,
          )
          .filter((detail): detail is CheckinPayOrder => detail !== null)

        // Calculate summary statistics
        const totalOrders = paymentDetails.length
        const paidOrders = paymentDetails.filter((detail) => detail.paid).length
        const overduePayments = paymentDetails.filter((detail) =>
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
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to fetch payment summary',
        )
      } finally {
        setLoading(false)
      }
    }

    fetchPaymentSummary()
  }, [orderIds])

  return { summary, loading, error }
}
