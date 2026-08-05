import { TRPCError } from '@trpc/server'
import { ProposalInputSchema } from '@/server/schemas/proposal'
import { hasSubmittableFormats, isCfpOpen } from '@/lib/conference/state'
import type { Conference } from '@/lib/conference/types'

/**
 * Fold a `topics` value — in EITHER shape — down to plain topic ids.
 *
 * A proposal's topics arrive as `{ _type: 'reference', _ref }` on the way IN
 * (client payload) but come back as dereferenced documents `{ _id, title,
 * color }` on the way OUT (`getProposal` projects `topics[]->`). Both shapes
 * are accepted here so a single fold serves every caller: the submit gate
 * below (which validates content in either shape) and the reference-injection
 * check in `proposal.ts` (which counts ids against this org).
 *
 * Entries it cannot read are DROPPED rather than preserved, which callers rely
 * on in opposite directions: the gate sees them as missing topics, and
 * `requireTopicsReferenceable` compares the id count against the input length
 * to detect them.
 */
export function topicIdsOf(topics: unknown): string[] {
  if (!Array.isArray(topics)) return []
  return topics
    .map((topic) => {
      if (!topic || typeof topic !== 'object') return undefined
      const t = topic as { _ref?: unknown; _id?: unknown }
      if (typeof t._ref === 'string') return t._ref
      if (typeof t._id === 'string') return t._id
      return undefined
    })
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

const CFP_CLOSED_MESSAGE =
  'The Call for Papers is currently closed. We&apos;d love to have you speak at our next conference! Please check back when the next CFP opens, or contact the organizers if you have any questions.'

const NO_FORMATS_MESSAGE =
  'The organizers have not announced any session formats yet, so proposals cannot be submitted. Please check back soon.'

/**
 * The ONE answer to "may this proposal become `submitted`?".
 *
 * CALLED BY BOTH SPEAKER-FACING SUBMIT ROUTES in
 * `src/server/routers/proposal.ts`: `proposal.create` when `status` is not
 * `draft`, and `proposal.action` on the `draft` → `submitted` transition (the
 * path `ProposalForm` uses for an existing draft). It exists because those two
 * drifted three times — the submittable-formats gate (#824), strict content
 * validation (#833) and the CFP window (#837) were each added to `create` and
 * each found missing from `action` by a separate audit. A new condition belongs
 * HERE, where neither route can miss it.
 *
 * `proposal.admin.create` is a THIRD way a document reaches `submitted` and
 * deliberately does NOT call this. It is organizer-only and sits OUTSIDE the
 * CFP flow by design — an invited or keynote talk entered on a speaker's behalf
 * has to be enterable after the window closes — and its input schema
 * (`ProposalAdminCreateSchema`) is the strict one, so the content condition is
 * already enforced at that boundary. If it ever becomes speaker-reachable, it
 * belongs here.
 *
 * Refuses, in order:
 * 1. the CFP window is closed (`FORBIDDEN`),
 * 2. the conference announced no session format to submit into (`FORBIDDEN`),
 * 3. a topic entry is unreadable AND the content came from a client payload
 *    (`BAD_REQUEST` — see `contentSource`),
 * 4. the content does not satisfy strict submit validation (`BAD_REQUEST`).
 *
 * NO ORGANIZER CARVE-OUT, deliberately: an invalid or out-of-window submission
 * is wrong whoever promotes it. (Contrast the neighbouring 3-proposal cap,
 * which IS a per-speaker fairness rule an organizer may override.)
 *
 * WHAT IT DOES NOT COVER. It answers nothing about any other transition: the
 * per-speaker proposal cap, withdraw, unsubmit, and organizer decisions
 * (accept/reject/waitlist) are each gated separately by their callers, and
 * editing an existing proposal stays on the plain {@link isCfpOpen} window.
 * Creating a DRAFT is not a submission and is never gated here — a draft is the
 * incomplete-work path, and an API/CLI caller must stay able to prepare one
 * before the CFP opens or before the organizers announce their formats.
 *
 * WHAT IT MAY READ. The parameter type lists every conference field it looks
 * at, and `topics` is deliberately NOT among them: the routers call
 * `getConferenceForCurrentDomain()` WITHOUT projecting topics, and the boundary
 * normaliser coerces the absent field to `[]`, so a topic-aware conference gate
 * here would fail CLOSED on every well-configured conference (see
 * `canAcceptProposals`). What refuses a topic-less proposal is step 3 — the
 * content carries its own topics — not a conference-level check. Do not widen
 * this signature without widening the projection first.
 *
 * THE ONE ASYMMETRY, and why it is not a policy knob. `topicIdsOf` is LOSSY —
 * it drops entries it cannot read — so validating the folded list would
 * otherwise let a proposal through on whatever survived. `contentSource` says
 * where the content came from, which is a fact about the call site rather than
 * a choice, and decides what an unreadable entry means:
 *
 * - `'payload'`: the caller just sent it, so an entry that does not fold is a
 *   bad request and is REFUSED. Silently dropping it would hand the caller a
 *   proposal with fewer topics than they asked for and no error. (`_ref` is
 *   `z.string()` with no `.min(1)`, so an empty `_ref` reaches this having
 *   passed the input schema.)
 * - `'stored'`: the entries are pre-existing data some earlier write produced,
 *   and a `topics[]->` projection legitimately yields `null` for a topic that
 *   was since deleted. They are TOLERATED and logged. Refusing here would
 *   strand a speaker behind a data problem they did not cause and cannot fix;
 *   what they can fix — having at least one readable topic — is still enforced
 *   by step 4, because the fold leaves the survivors to be validated.
 */
export function assertMayBecomeSubmitted({
  conference,
  content,
  contentSource,
}: {
  conference: Pick<Conference, 'cfpStartDate' | 'cfpEndDate'> & {
    formats?: Conference['formats']
  }
  content: { topics?: unknown; _id?: unknown }
  contentSource: 'payload' | 'stored'
}): void {
  if (!isCfpOpen(conference)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: CFP_CLOSED_MESSAGE })
  }

  if (!hasSubmittableFormats(conference)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: NO_FORMATS_MESSAGE })
  }

  // `content` is either an incoming payload (`create`) or the STORED document
  // (`action`), so two fields are folded back to what the schema describes
  // before parsing: `speakers` is dropped (the stored document carries
  // dereferenced speaker objects, and the incoming payload never carries
  // speakers at all) and `topics` is folded through `topicIdsOf`, which reads
  // both the reference and the dereferenced shape. Parsing a stored document
  // without that fold would reject EVERY legitimate submission on `topics`.
  const topicIds = topicIdsOf(content.topics)

  // The fold is LOSSY, so account for what it dropped before validating what
  // survived — see THE ONE ASYMMETRY above.
  const unreadableTopics = Array.isArray(content.topics)
    ? content.topics.length - topicIds.length
    : 0
  if (unreadableTopics > 0) {
    if (contentSource === 'payload') {
      // Same wording as `requireTopicsReferenceable`, which refuses the same
      // shape a few lines later in `create`: one client-visible message for
      // "a topic entry in your payload is not a usable reference".
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid topic reference',
      })
    }
    console.warn(
      `Proposal ${String(content._id ?? 'unknown')} carries ${unreadableTopics} unreadable topic entr${unreadableTopics === 1 ? 'y' : 'ies'}; submitting on the readable ones.`,
    )
  }

  const candidate = {
    ...content,
    speakers: undefined,
    topics: topicIds.map((ref) => ({
      _type: 'reference' as const,
      _ref: ref,
    })),
  }

  const strict = ProposalInputSchema.safeParse(candidate)
  if (!strict.success) {
    const fieldErrors = strict.error.issues.map((i) => i.message)
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Please fix the following before submitting: ${fieldErrors.join('. ')}`,
    })
  }
}
