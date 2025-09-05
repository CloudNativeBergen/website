# Tickets Module

This module provides integration with the Checkin.no GraphQL API for managing event tickets, discounts, and payment information.

## Architecture

- **`graphql-client.ts`** - Reusable GraphQL client with authentication and error handling
- **`types.ts`** - TypeScript type definitions for API responses and inputs
- **`checkin.ts`** - Business logic functions for ticket operations
- **`client.ts`** - Browser-side utilities and calculations
- **`calculations.ts`** - Ticket calculation utilities
- **`targets.ts`** - Target tracking functionality

## GraphQL Client Features

- ✅ **Authentication** - Automatic Basic Auth with API credentials
- ✅ **Error Handling** - Comprehensive error processing with context
- ✅ **Type Safety** - Full TypeScript integration
- ✅ **Validation** - Input validation and response checking
- ✅ **Logging** - Detailed error logging for debugging

## Type System

The module provides a comprehensive type system for ticket management:

### Core Types

- `EventTicket` - Individual ticket information with customer data
- `EventDiscount` - Discount code configuration and metadata
- `EventDiscountWithUsage` - Extended discount type with usage statistics
- `CheckinPayOrder` - Payment order details and status
- `TicketType` - Available ticket categories and descriptions

### Utility Types

- `GroupedOrder` - Tickets grouped by order for display
- `DiscountUsageStats` - Usage statistics for discount codes
- `CreateEventDiscountInput` - Input type for creating discounts

### Response Types

All GraphQL response shapes are properly typed for API integration.

## Component Integration

The types are designed for seamless integration with React components:

```typescript
import type { EventDiscountWithUsage } from '@/lib/tickets/client'

// Component with proper typing
function DiscountList({ discounts }: { discounts: EventDiscountWithUsage[] }) {
  return discounts.map(discount => (
    <div key={discount.triggerValue}>
      {discount.triggerValue} - Used {discount.actualUsage?.usageCount ?? 0} times
    </div>
  ))
}
```

## Import Patterns

### Client-Side Components

Use `/client` for browser-safe utilities:

```typescript
import type {
  EventDiscountWithUsage,
  CheckinPayOrder,
} from '@/lib/tickets/client'
import { groupTicketsByOrder, isPaymentOverdue } from '@/lib/tickets/client'
```

### Server-Side Code

Use `/server` for API functions with secrets:

```typescript
import { getEventDiscounts, createEventDiscount } from '@/lib/tickets/server'
```

## Usage Examples

### Fetching Event Discounts (Server-Side)

```typescript
import { getEventDiscounts } from '@/lib/tickets/server'

const { discounts, ticketTypes } = await getEventDiscounts(eventId)
```

### Creating a Discount Code (Server-Side)

```typescript
import { createEventDiscount } from '@/lib/tickets/server'

const discount = await createEventDiscount({
  eventId: 123,
  discountCode: 'EARLY_BIRD',
  numberOfTickets: 50,
  ticketTypes: ['1', '2'], // Ticket type IDs
})
```

### Validating Discount Codes (Server-Side)

```typescript
import { validateDiscountCode } from '@/lib/tickets/server'

const result = await validateDiscountCode(eventId, 'DISCOUNT_CODE')
if (result.valid) {
  console.log('Discount is valid!')
}
```

## Environment Variables

Required environment variables:

- `CHECKIN_API_KEY` - Checkin.no API key
- `CHECKIN_API_SECRET` - Checkin.no API secret

## Error Handling

All functions throw descriptive errors that can be caught and handled:

```typescript
try {
  const tickets = await fetchEventTickets(customerId, eventId)
} catch (error) {
  console.error('Failed to fetch tickets:', error.message)
}
```

## Type Safety

All functions are fully typed with TypeScript interfaces defined in `types.ts`. The GraphQL client ensures type safety from API responses to business logic. Types are shared across the application to ensure consistency between the API layer, business logic, and UI components.
