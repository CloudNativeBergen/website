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
  calculateDiscountUsage,
  groupTicketsByOrder,
  isPaymentOverdue,
  getDaysOverdue,
} from './checkin'

// Client-safe calculation utilities
export * from './calculations'
export * from './chart-data'
export * from './target-calculations'
export * from './target-curves'
export * from './targets'

// Note: GraphQL client and API functions are server-only
// Import those directly from './server' in server-side code
