import { z } from 'zod'
import {
  Language,
  Level,
  Audience,
  Format,
  Action,
  Status,
  ReviewStatus,
  isWorkshopFormat,
} from '@/lib/proposal/types'
import { Flags } from '@/lib/speaker/types'
import { canonicalEmail, normalizeEmail } from '@/lib/speaker/email'
import {
  nullToUndefined,
  IdParamSchema as CommonIdParamSchema,
  ReferenceSchema,
} from './common'

// An abuse/document-quota bound, NOT the CFP submission rule. The per-format
// limit (`getTotalSpeakerLimit`, max 4) is advisory for organizers by design
// (#1023) — they may deliberately go over it. This ceiling only stops an
// organizer-side request from attaching an unbounded speaker list.
export const MAX_SPEAKERS_PER_PROPOSAL = 20
const TOO_MANY_SPEAKERS_MESSAGE = `At most ${MAX_SPEAKERS_PER_PROPOSAL} speakers per proposal`

// Portable text block element — runtime check that each item is an object with _type
const isPortableTextElement = (val: unknown): boolean =>
  typeof val === 'object' && val !== null && '_type' in val

// Portable text block schema - validate as array of block objects with non-empty check
const PortableTextBlockSchema = z
  .array(z.any())
  .refine((arr) => arr.length > 0, {
    message: 'Description cannot be empty',
  })
  .refine((arr) => arr.every(isPortableTextElement), {
    message: 'Description must contain valid content blocks',
  })

/**
 * FIRST-TOUCH MARKETING ATTRIBUTION on a proposal (spec §6.3, #1018): the
 * campaign tags on the link the speaker arrived through.
 *
 * NEVER BLOCKS A SUBMISSION. These values come from a URL the speaker did not
 * type and cannot see, so a mangled, oversized or hostile tag must cost them
 * nothing: every field `.catch`es to `undefined` and a tag that survives
 * nothing leaves the object empty. A proposal is worth more than its
 * attribution.
 */
const UtmTagSchema = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value ? value : undefined))
  .optional()
  .catch(undefined)

export const ProposalUtmSchema = z
  .object({
    source: UtmTagSchema,
    medium: UtmTagSchema,
    campaign: UtmTagSchema,
    content: UtmTagSchema,
  })
  // An object whose every tag fell away is no attribution at all; storing `{}`
  // would make "arrived untagged" look like "arrived through a broken link".
  .transform((utm) =>
    Object.values(utm).some((value) => value !== undefined) ? utm : undefined,
  )
  .optional()
  .catch(undefined)

// Base proposal schema without refinements (for extending)
const ProposalInputBaseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: PortableTextBlockSchema,
  language: z.nativeEnum(Language, {
    message: 'Language must be specified',
  }),
  format: z.nativeEnum(Format, {
    message: 'Format must be specified',
  }),
  level: z.nativeEnum(Level, {
    message: 'Level must be specified',
  }),
  audiences: z
    .array(z.nativeEnum(Audience))
    .min(1, 'At least one audience must be specified'),
  outline: z.string().nullable().optional().transform(nullToUndefined),
  topics: z.array(ReferenceSchema).min(1, 'At least one topic is required'),
  tos: z.boolean().refine((val) => val === true, {
    message: 'Terms of Service must be accepted',
  }),
  video: z.string().nullable().optional().transform(nullToUndefined),
  capacity: z.number().nullable().optional().transform(nullToUndefined),
  prerequisites: z
    .string()
    .nullable()
    .optional()
    .transform((val) => {
      if (val === null || val === undefined) return undefined
      const trimmed = val.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }),
  speakers: z
    .array(ReferenceSchema)
    .nullable()
    .optional()
    .transform(nullToUndefined),
  utm: ProposalUtmSchema,
})

// Proposal input schema (for create/update)
export const ProposalInputSchema = ProposalInputBaseSchema.refine(
  (data) => {
    // Prerequisites should only be provided for workshop formats
    if (data.prerequisites && !isWorkshopFormat(data.format)) {
      return false
    }
    return true
  },
  {
    message: 'Prerequisites are only allowed for workshop formats',
    path: ['prerequisites'],
  },
)

/**
 * COMPATIBILITY CODEPOINTS MAKE A PLACEHOLDER UNCLAIMABLE, so every
 * organizer-created profile refuses them — the same guard `requestEmailLink`
 * applies to the other user-typed address on the identity path. The profile is
 * STORED with `canonicalEmail` (no NFKC) because that field is also a real
 * recipient address, while login matches on the NFKC-folding `normalizeEmail`.
 * For an address where the two differ (`oﬃce@x.com`), the person could never
 * sign in and reach this document — the profile would look claimable and
 * quietly not be. Refusing fails closed; the organizer retypes the address in
 * its plain form.
 *
 * One definition, two call sites (`NewPrimarySpeakerSchema` and
 * `AddCoSpeakerProfileSchema`), so the rule cannot drift between them.
 */
export const UNCLAIMABLE_EMAIL_MESSAGE =
  'This email address contains characters that would make the profile impossible to claim. Retype it using plain characters.'

export const isClaimableEmail = (value: string) =>
  normalizeEmail(value) === canonicalEmail(value)

export const NEW_SPEAKER_EMAIL_REQUIRED =
  'An email address is required, so the person is told a proposal was entered in their name.'

/**
 * The PRIMARY speaker an organizer types into the proposal create form, for a
 * person who is not in the system yet. The sibling of
 * `AddCoSpeakerProfileSchema` and deliberately the same rules: `email` is
 * REQUIRED (#1061) so nobody carries a proposal without being told, and an
 * unclaimable address is refused.
 *
 * Strict, so a client cannot smuggle in `knownEmails` or `providers` — those
 * are provider-VERIFIED (#808) and an organizer typing an address proves
 * nothing about who owns the mailbox.
 */
export const NewPrimarySpeakerSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required'),
  email: z
    // Both messages, because a MISSING address and a malformed one are separate
    // issues in Zod and the organizer needs the same answer to either.
    .string({ error: NEW_SPEAKER_EMAIL_REQUIRED })
    .email(NEW_SPEAKER_EMAIL_REQUIRED)
    .refine(isClaimableEmail, { message: UNCLAIMABLE_EMAIL_MESSAGE }),
  title: z.string().nullable().optional().transform(nullToUndefined),
})

// Admin-specific proposal creation (includes speaker IDs). No `utm`: an
// organizer typing a proposal into the admin modal arrived through no campaign
// link, and must not be able to assert one.
export const ProposalAdminCreateSchema = ProposalInputBaseSchema.omit({
  utm: true,
})
  .extend({
    speakers: z
      .array(z.string())
      .max(MAX_SPEAKERS_PER_PROPOSAL, TOO_MANY_SPEAKERS_MESSAGE)
      // No longer `min(1)`: `newSpeaker` is the other way to have a primary.
      // The refine below is what keeps a speakerless proposal impossible.
      .default([]),
    /**
     * The PRIMARY speaker, created with this proposal for a person the dataset
     * does not hold yet. Without it an organizer entering an invited or keynote
     * talk has to leave for `/admin/speakers`, create the profile and come back.
     *
     * A claimable placeholder, exactly as `addCoSpeakerProfile` creates: the
     * shape is `buildOrganizerCreatedSpeaker`'s, `email` is a DISPLAY address
     * and a later login match key, never proof that anybody owns that mailbox.
     */
    newSpeaker: NewPrimarySpeakerSchema.nullable()
      .optional()
      .transform(nullToUndefined),
  })
  .refine((data) => data.speakers.length > 0 || !!data.newSpeaker, {
    message: 'At least one speaker is required',
    path: ['speakers'],
  })
  .refine(
    (data) => {
      // Workshop formats require capacity
      if (isWorkshopFormat(data.format) && !data.capacity) {
        return false
      }
      return true
    },
    {
      message: 'Workshop capacity is required for workshop formats',
      path: ['capacity'],
    },
  )

// Draft proposal schema — derived from base with relaxed validation for drafts.
// Fields that have strict validators in the base (description, audiences, topics,
// tos) are overridden with permissive defaults so drafts can be saved early.
// `speakers` is deliberately omitted: speaker-facing create/update must never
// accept a speaker reference array (co-speakers are managed exclusively via
// the invitation flow and the dedicated removeCoSpeaker mutation).
const ProposalDraftSchema = ProposalInputBaseSchema.omit({ speakers: true })
  .partial()
  .extend({
    description: z
      .array(z.any())
      .refine((arr) => arr.every(isPortableTextElement), {
        message: 'Description must contain valid content blocks',
      })
      .optional()
      .default([]),
    language: z.nativeEnum(Language).optional().default(Language.norwegian),
    format: z.nativeEnum(Format).optional().default(Format.lightning_10),
    level: z.nativeEnum(Level).optional().default(Level.beginner),
    audiences: z.array(z.nativeEnum(Audience)).optional().default([]),
    topics: z.array(ReferenceSchema).optional().default([]),
    tos: z.boolean().optional().default(false),
  })
  .required({ title: true })

// Create proposal schema - uses draft (permissive) for the data, with status
// controlling whether strict validation is enforced at runtime
export const CreateProposalSchema = z.object({
  data: ProposalDraftSchema,
  status: z.enum([Status.draft, Status.submitted]).default(Status.submitted),
})

// Proposal update schema — uses relaxed validation; strict checks enforced
// at runtime in the router for non-draft proposals.
//
// `utm` is OMITTED here and on the admin update below, which is what makes the
// attribution first-touch: it is accepted on CREATE, where it comes from the
// landing URL, and no later edit by the speaker or by an organizer can rewrite
// which Campaign a proposal is credited to. Enforcing it in the SCHEMAS rather
// than in a router branch means every update path inherits the rule.
export const ProposalUpdateSchema = ProposalDraftSchema.partial()
  .omit({ utm: true })
  .required({
    title: true,
  })

// Admin update schema with speaker IDs
export const ProposalAdminUpdateSchema = ProposalInputBaseSchema.partial()
  .omit({ utm: true })
  .extend({
    speakers: z
      .array(z.string())
      .max(MAX_SPEAKERS_PER_PROPOSAL, TOO_MANY_SPEAKERS_MESSAGE)
      .optional(),
  })

// Proposal action schema
// Used for validating proposal status change actions (submit, accept, reject, etc.)
// `reason` captures the mandatory, free-text withdrawal reason (#212). It is
// only required for the withdraw action; `requireWithdrawalReason` enforces that.
export const ProposalActionSchema = z.object({
  action: z.nativeEnum(Action),
  notify: z.boolean().optional().default(true),
  comment: z.string().nullable().optional().transform(nullToUndefined),
  reason: z.string().nullable().optional().transform(nullToUndefined),
})

/**
 * A withdrawal must always record a non-empty, non-whitespace reason (#212).
 * Exposed as a standalone refinement so it can be applied to the combined
 * router input (which is built from `ProposalActionSchema.shape`) while keeping
 * the base object's `.shape` available, and unit-tested in isolation.
 */
export function requireWithdrawalReason(
  data: { action: Action; reason?: string },
  ctx: z.RefinementCtx,
) {
  if (data.action === Action.withdraw && !data.reason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'A reason is required to withdraw a proposal.',
    })
  }
}

// Convenience schema (base + withdrawal-reason rule) for validation/tests.
export const ProposalActionInputSchema = ProposalActionSchema.superRefine(
  requireWithdrawalReason,
)

// Co-speaker invitation schemas
export const InvitationCreateSchema = z.object({
  proposalId: z.string().min(1, 'Proposal ID is required'),
  invitedEmail: z.string().email('Valid email is required'),
  invitedName: z.string().nullable().optional().transform(nullToUndefined),
})

export const CO_SPEAKER_EMAIL_REQUIRED =
  'An email address is required, so the person is told they are on the talk.'

/**
 * ORGANIZER-CREATED co-speaker profile — the escape hatch for a co-speaker who
 * will not act on an invitation. Nothing here is an identity claim:
 * `email` is a DISPLAY address and a later login match key, never proof that
 * anybody owns that mailbox (see `buildOrganizerCreatedSpeaker`).
 *
 * `email` is REQUIRED (#1045). Without an address the profile is created and
 * nobody is ever told it exists, yet the person appears in the public programme
 * once the talk is published. Requiring it drops the unreachable-co-speaker
 * case on purpose: no profile without someone to notify.
 * Strict, so a client cannot smuggle in `knownEmails` or `providers`.
 */
export const AddCoSpeakerProfileSchema = z.strictObject({
  proposalId: z.string().min(1, 'Proposal ID is required'),
  name: z.string().trim().min(1, 'Name is required'),
  email: z
    // Both messages, because a MISSING address and a malformed one are separate
    // issues in Zod and the organizer needs the same answer to either.
    .string({ error: CO_SPEAKER_EMAIL_REQUIRED })
    .email(CO_SPEAKER_EMAIL_REQUIRED)
    // See UNCLAIMABLE_EMAIL_MESSAGE.
    .refine(isClaimableEmail, { message: UNCLAIMABLE_EMAIL_MESSAGE }),
  title: z.string().nullable().optional().transform(nullToUndefined),
  bio: z.string().nullable().optional().transform(nullToUndefined),
  /**
   * UPGRADING AN INVITATION into a profile: the id of the invitation this
   * create replaces. Optional — the plain create path does not set it.
   *
   * It is not a shortcut. The mutation still does everything it does for a
   * typed-in profile; what this adds is a REFUSAL — the invitation must be on
   * this proposal, must not be already accepted or canceled, and its address
   * must match `email`.
   *
   * It is NOT where declined invitations are refused. That rule is keyed on the
   * ADDRESS in the router and applies to every route into this mutation,
   * because an operator who simply types a declined invitee's address would
   * otherwise override their answer with no invitation id in sight.
   */
  fromInvitationId: z.string().min(1).nullable().optional(),
})

export const InvitationResponseSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  accept: z.boolean(),
  declineReason: z.string().nullable().optional().transform(nullToUndefined),
})

export const InvitationCancelSchema = z.object({
  invitationId: z.string().min(1, 'Invitation ID is required'),
})

// Sanity document ids are restricted to this character set; enforcing it
// here keeps interpolated JSONMatch selectors (speakers[_ref=="<id>"])
// well-formed by construction
const SANITY_ID_PATTERN = /^[A-Za-z0-9._-]+$/

export const RemoveCoSpeakerSchema = z.object({
  proposalId: z
    .string()
    .min(1, 'Proposal ID is required')
    .regex(SANITY_ID_PATTERN, 'Invalid proposal ID'),
  speakerId: z
    .string()
    .min(1, 'Speaker ID is required')
    .regex(SANITY_ID_PATTERN, 'Invalid speaker ID'),
})

export const AudienceFeedbackSchema = z.object({
  greenCount: z.number().int().min(0),
  yellowCount: z.number().int().min(0),
  redCount: z.number().int().min(0),
})

export const ReviewScoreSchema = z.object({
  content: z.number().int().min(1).max(5),
  relevance: z.number().int().min(1).max(5),
  speaker: z.number().int().min(1).max(5),
})

export const SubmitReviewSchema = CommonIdParamSchema.extend({
  comment: z.string(),
  score: ReviewScoreSchema,
})

export const ProposalFilterSchema = z.object({
  status: z.array(z.nativeEnum(Status)).optional().default([]),
  format: z.array(z.nativeEnum(Format)).optional().default([]),
  level: z.array(z.nativeEnum(Level)).optional().default([]),
  language: z.array(z.nativeEnum(Language)).optional().default([]),
  audience: z.array(z.nativeEnum(Audience)).optional().default([]),
  speakerFlags: z.array(z.nativeEnum(Flags)).optional().default([]),
  reviewStatus: z.nativeEnum(ReviewStatus).optional().default(ReviewStatus.all),
  hideMultipleTalks: z.boolean().optional().default(false),
  searchQuery: z.string().optional(),
  sortBy: z
    .enum(['title', 'status', 'created', 'speaker', 'rating', 'reviews'])
    .optional()
    .default('created'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

export { CommonIdParamSchema as IdParamSchema }
