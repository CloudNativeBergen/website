import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'

export type OrderPaymentStatus = 'paid' | 'due' | 'overdue'

interface OrderPaymentStatusConfig {
  label: string
  color: BadgeColor
}

const ORDER_PAYMENT_STATUS_CONFIG: Record<
  OrderPaymentStatus,
  OrderPaymentStatusConfig
> = {
  paid: { label: 'Paid', color: 'green' },
  due: { label: 'Due', color: 'yellow' },
  overdue: { label: 'Overdue', color: 'red' },
}

export function getOrderPaymentStatusConfig(
  status: OrderPaymentStatus,
): OrderPaymentStatusConfig {
  return ORDER_PAYMENT_STATUS_CONFIG[status]
}

interface OrderPaymentStatusBadgeProps {
  status: OrderPaymentStatus
  className?: string
}

/**
 * Domain adapter around the shared {@link StatusBadge} for order/invoice payment
 * state. Keeps the paid/due/overdue colour ladder in one place.
 */
export function OrderPaymentStatusBadge({
  status,
  className,
}: OrderPaymentStatusBadgeProps) {
  const { label, color } = getOrderPaymentStatusConfig(status)
  return <StatusBadge label={label} color={color} className={className} />
}
