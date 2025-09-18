/**
 * Server-only tickets library exports
 * This file exports functionality that should only be used on the server side
 * These functions use API keys and make external API calls
 */

// Re-export all types (safe to use anywhere)
export * from './types'

// Server-only GraphQL client utilities (uses API secrets)
export {
  checkinQuery,
  checkinMutation,
  checkinGraphQLClient,
} from './graphql-client'

// Server-only API functions (make external API calls with secrets)
export {
  fetchEventTickets,
  fetchOrderPaymentDetails,
  // Also re-export client-safe functions for convenience
  groupTicketsByOrder,
  isPaymentOverdue,
  getDaysOverdue,
} from './checkin'

export * from './discounts'

// Calculation utilities (safe but commonly used with server data)
export * from './data-processing'
export * from './target-calculations'
export * from './types'
