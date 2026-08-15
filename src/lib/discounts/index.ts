export type {
  EventDiscount,
  TicketType,
  DiscountUsage,
  DiscountUsageStats,
  DiscountUsageStatus,
  EventDiscountWithUsage,
  CreateEventDiscountInput,
  EventDiscountsResponse,
  CreateEventDiscountResponse,
  DeleteEventDiscountResponse,
} from './types'

// Discount operations now live on the TicketingProvider (same vendor + event
// id): see `@/lib/tickets/provider`. This module keeps the discount types and
// the pure usage aggregation.
export { calculateDiscountUsage, resolveRedemptionCount } from './usage'
