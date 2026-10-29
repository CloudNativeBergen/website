import { typeKey } from '@/lib/tickets/classification'

/**
 * EARLY ACCESS BY TICKET TYPE: the configured type one of the person's
 * workshop tickets carries, or `null`.
 *
 * `eligibleTickets` must be the tickets that ALREADY grant workshops (from
 * `checkWorkshopEligibility`), so a configured type that does not grant
 * workshops admits nobody. Names match as `workshopAccessOf` matches them
 * (`typeKey`). Returns the configured spelling, which is what is recorded.
 */
export function earlyAccessTicketTypeOf(
  eligibleTickets: readonly { category: string }[],
  earlyAccessTypes: readonly string[] | null | undefined,
): string | null {
  for (const type of earlyAccessTypes ?? []) {
    const key = typeKey(type)
    if (key && eligibleTickets.some((t) => typeKey(t.category) === key)) {
      return type
    }
  }
  return null
}
