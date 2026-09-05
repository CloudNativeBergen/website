// Discount operations now live on the TicketingProvider (same vendor + event
// id): see `@/lib/tickets/provider`. This module keeps the discount types
// (`./types`, imported directly) and the pure usage aggregation.
export { calculateDiscountUsage, resolveRedemptionCount } from './usage'
