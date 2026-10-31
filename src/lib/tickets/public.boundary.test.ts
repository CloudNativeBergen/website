import { describe, it, expect, vi } from 'vitest'

// #964: client components import the pure helpers in `./public`. If that
// module reaches the provider barrel again (node:crypto, server-only), this
// import throws.
vi.mock('./provider', () => {
  throw new Error('@/lib/tickets/public must not import the provider barrel')
})

describe('@/lib/tickets/public', () => {
  it('loads without the ticketing provider barrel', async () => {
    const mod = await import('./public')
    expect(typeof mod.formatTicketPrice).toBe('function')
  })
})
