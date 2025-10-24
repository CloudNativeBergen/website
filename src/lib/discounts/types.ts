export interface EventDiscount {
  id?: string
  trigger: string
  type: string
  value: string
  triggerValue: string | null
  affects: string
  includeBooking: boolean
  affectsValue: string | null
  modes: string[]
  tickets: string[]
  ticketsOnly: boolean
  times: number
  timesTotal: number

  startsAt?: string
  stopsAt?: string
}

export interface TicketType {
  id: string | number
  name: string
  description: string | null
}

export interface DiscountUsageStats {
  [discountCode: string]: {
    usageCount: number
    ticketIds: number[]
    totalValue: number
  }
}

export interface EventDiscountWithUsage extends EventDiscount {
  actualUsage?: {
    usageCount: number
    ticketIds: number[]
    totalValue: number
  }
}

export interface CreateEventDiscountInput {
  eventId: number
  discountCode: string
  numberOfTickets: number
  ticketTypes: string[]
  discountType?: 'percentage' | 'fixed'
  discountValue?: number
  startsAt?: string
  stopsAt?: string
}

export interface EventDiscountsResponse {
  findEventById: {
    id: number
    tickets: TicketType[]
    settings: {
      discounts: EventDiscount[]
    }
  }
}

export interface CreateEventDiscountResponse {
  createEventDiscount: {
    success: boolean
  }
}

export interface DeleteEventDiscountResponse {
  deleteEventDiscount: {
    success: boolean
  }
}
