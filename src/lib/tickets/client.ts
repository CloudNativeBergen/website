/**
 * Client-safe tickets library exports
 * This file only exports functionality that is safe to use on the client side (browser)
 * Server-only functions (GraphQL API calls) are not exported here for security
 */

// Core types - safe for client use
export type {
  EventTicket,
  CheckinPayOrder,
  GroupedOrder,
  EventDiscount,
  EventDiscountWithUsage,
  TicketType,
  DiscountUsageStats,
  CreateEventDiscountInput,
} from './types'

// Client-safe utility functions (no API calls, no secrets)
export {
  groupTicketsByOrder,
  isPaymentOverdue,
  getDaysOverdue,
} from './checkin'

export { calculateDiscountUsage } from './discounts'

// Client-safe calculation utilities
export * from './data-processing'
export * from './target-calculations'
export * from './types'

// Note: GraphQL client and API functions are server-only
// Import those directly from './server' in server-side code
