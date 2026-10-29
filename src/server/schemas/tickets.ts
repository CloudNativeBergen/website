import { z } from 'zod'
import { isCalendarDate } from '@/lib/time'

export const SalesMilestoneSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .refine(isCalendarDate, 'Date must be a real calendar date'),
  targetPercentage: z.number().min(0).max(100),
  label: z.string(),
})

export const SalesTargetConfigSchema = z.object({
  enabled: z.boolean(),
  salesStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .refine(isCalendarDate, 'Date must be a real calendar date'),
  targetCurve: z.enum(['linear', 'early_push', 'late_push', 's_curve']),
  milestones: z.array(SalesMilestoneSchema),
})

export const TicketSettingsUpdateSchema = z.object({
  ticketCapacity: z.number().min(1, 'Capacity must be at least 1').optional(),
  ticketTargets: SalesTargetConfigSchema.optional(),
})

export const TicketCustomizationSchema = z.object({
  heroHeadline: z.string().optional(),
  heroSubheadline: z.string().optional(),
  showVanityMetrics: z.boolean().optional(),
  groupDiscountInfo: z.string().optional(),
  ctaButtonText: z.string().optional(),
})

export const TicketInclusionSchema = z.object({
  _key: z.string(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  icon: z.string().optional(),
})

export const TicketFaqSchema = z.object({
  _key: z.string(),
  question: z.string().min(1, 'Question is required'),
  answer: z.string().min(1, 'Answer is required'),
})

export const UpdateTicketPageContentSchema = z.object({
  ticketCustomization: TicketCustomizationSchema.optional(),
  ticketInclusions: z.array(TicketInclusionSchema).optional(),
  ticketFaqs: z.array(TicketFaqSchema).optional(),
})

export const CreateDiscountCodeSchema = z.object({
  eventId: z.number().min(1, 'Event ID is required'),
  discountCode: z.string().min(1, 'Discount code is required'),
  numberOfTickets: z.number().min(1, 'Number of tickets must be at least 1'),
  /**
   * The sponsor this code is issued to — ABSENT for a standalone code.
   *
   * It is not the code's identity and is not stored anywhere: the ticketing
   * provider holds no label for a discount, only the redeemable string. This
   * field exists so the confirmation can name the sponsor, and so the two kinds
   * of code stay ONE procedure rather than two. What identifies a standalone
   * code afterwards is `discountCode` itself.
   */
  sponsorName: z.string().min(1).optional(),
  tierTitle: z.string().optional(),
  /**
   * The sponsor's CRM record, for a code created from its row (#1262): the
   * new code is linked to it, since a sponsor that stores codes is no longer
   * matched by name. Proven to be this conference's before the provider call.
   */
  sponsorForConferenceId: z.string().min(1).optional(),
  /**
   * Percent off. Defaults to 100 because that is what a sponsor comp is, and
   * what this procedure hardcoded before standalone codes existed.
   */
  discountPercentage: z.number().int().min(1).max(100).default(100),
  selectedTicketTypes: z.array(z.string()).optional().default([]),
})

export const GetDiscountsSchema = z.object({
  eventId: z.number().min(1, 'Event ID is required'),
})

export const DeleteDiscountCodeSchema = z.object({
  eventId: z.number().min(1, 'Event ID is required'),
  discountCode: z.string().min(1, 'Discount code is required'),
})

export const GetPaymentDetailsSchema = z.object({
  orderId: z.number().min(1, 'Order ID is required'),
})

export const UpdateTicketCapacitySchema = z.object({
  capacity: z.number().min(1, 'Capacity must be at least 1'),
})

export const UpdateTicketTargetsSchema = z.object({
  targets: SalesTargetConfigSchema,
})

export const ToggleTargetTrackingSchema = z.object({
  enabled: z.boolean(),
})

/**
 * Can this ticket-type name be carried in a Sanity patch PATH?
 *
 * NO CONTROL CHARACTERS AND NO LONE SURROGATES. A save removes an entry by a
 * path built from its name, escaped with `JSON.stringify`, and Sanity's path
 * parser does not read escapes the way JSON does: it takes the character after
 * a backslash literally. `JSON.stringify` writes a tab as `\t` and a lone
 * surrogate as `\ud800`, so `"Speake\r ticket"` reached the path as
 * `Speake\\r ticket` and matched the stored `Speaker ticket`: an entry the
 * save had not counted was removed. A quote and a backslash survive that
 * round trip (the character after the backslash IS the character), so only
 * the characters JSON writes as a LETTER fail.
 *
 * THE ONE RULE, for a name that is SENT (the schema below) and for a name
 * that is already STORED and has to be addressed (`setTicketTypeRoles`).
 */
export function isPatchPathSafeName(name: string): boolean {
  return !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(name)
}

/** A provider ticket-type name as a save accepts it. */
const ticketTypeName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(isPatchPathSafeName, {
    message: 'A ticket type name cannot contain control characters.',
  })

/**
 * One conference's declaration for one provider ticket-type name — the
 * organizer's half of `@/lib/tickets/classification`.
 *
 * `typeName` is the vendor's own spelling, matched against `EventTicket.category`
 * ignoring case and surrounding space. It is bounded because it is interpolated
 * into a Sanity patch path (escaped) by the mutation that stores it.
 */
export const SetTicketTypeRoleSchema = z.object({
  typeName: ticketTypeName,
  admits: z.boolean(),
})

/**
 * The WORKSHOP-ACCESS half of the same declaration, as a BATCH.
 *
 * It is a batch because the first type declared `grantsWorkshop: true` switches
 * the conference off the legacy bridge in `@/lib/workshop/eligibility`, and the
 * types that were granting access through that bridge stop unless they are
 * declared in the SAME write. One mutation, one Sanity patch, all or nothing.
 *
 * A name may appear once: two updates for the same type would unset its entry
 * once and append two, leaving a duplicate whose winner is arbitrary. Matched
 * the way `typeKey` matches, so "Speaker Ticket" and "speaker ticket " collide
 * here exactly as they would in the gate.
 */
export const SetWorkshopAccessSchema = z.object({
  updates: z
    .array(
      z.object({
        typeName: ticketTypeName,
        // `null` REMOVES the stored answer, for an entry whose ticket type the
        // provider no longer lists. The entry stays when it also carries a
        // seating answer (`admits`), and goes when this was all it held.
        grantsWorkshop: z.boolean().nullable(),
      }),
    )
    .min(1)
    .max(50)
    .refine(
      (updates) =>
        new Set(updates.map((u) => u.typeName.trim().toLowerCase())).size ===
        updates.length,
      { message: 'Each ticket type may appear only once.' },
    ),
  /**
   * The organizer confirmed a save that leaves NO type granting workshop
   * access, which hands the decision back to the built-in list. Without it
   * such a save is refused (see `setWorkshopAccess`).
   */
  allowBuiltInList: z.boolean().optional(),
  /**
   * The version of the workshop answers the page was showing
   * (`workshopAnswersVersion`). When given, the save is refused if the stored
   * answers are no longer those: the page's questions were asked on them.
   * Optional so a page loaded before this field existed can still save.
   */
  basedOn: z.string().max(64).optional(),
})
