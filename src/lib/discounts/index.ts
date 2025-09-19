/**
 * Public API for discount code management
 */

// Types
export type {
  EventDiscount,
  TicketType,
  DiscountUsageStats,
  EventDiscountWithUsage,
  CreateEventDiscountInput,
  EventDiscountsResponse,
  CreateEventDiscountResponse,
  DeleteEventDiscountResponse,
  ValidateDiscountCodeResponse,
} from './types'

// API functions
export {
  getEventDiscounts,
  createEventDiscount,
  deleteEventDiscount,
  validateDiscountCode,
} from './api'

// Usage calculations
export { calculateDiscountUsage } from './usage'
