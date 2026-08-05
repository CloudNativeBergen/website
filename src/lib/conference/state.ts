import { Conference } from './types'

/**
 * Conference state helper functions to centralize date-based logic
 * and prevent duplication of complex conditions across components.
 */

/**
 * Number of days before the conference `startDate` after which speakers can no
 * longer self-withdraw a proposal. Once inside this window a withdrawal is too
 * disruptive to the program, so speakers must contact the organizers instead.
 */
export const WITHDRAWAL_CUTOFF_DAYS = 14

/**
 * Whether speaker self-withdrawal is closed because we are within
 * `WITHDRAWAL_CUTOFF_DAYS` days of the conference `startDate` (or the
 * conference has already started/ended).
 *
 * Fails OPEN: a missing or unparseable `startDate` returns `false` (withdrawal
 * allowed) so a bad/absent date can never trap a speaker into a proposal they
 * want to withdraw. Organizers are unaffected — this gate is only applied to
 * speaker self-withdrawal in the mutation handler.
 */
export function isWithdrawalCutoffActive(
  conference: Pick<Conference, 'startDate'>,
  now: Date = new Date(),
): boolean {
  if (!conference.startDate) {
    return false
  }
  const startDate = new Date(conference.startDate)
  if (Number.isNaN(startDate.getTime())) {
    return false
  }
  const cutoffMs = WITHDRAWAL_CUTOFF_DAYS * 24 * 60 * 60 * 1000
  return startDate.getTime() - now.getTime() <= cutoffMs
}

/**
 * Check if the conference has ended (day after endDate has passed)
 */
export function isConferenceOver(conference: Conference): boolean {
  const endDate = new Date(conference.endDate)
  const dayAfterEnd = new Date(endDate)
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1)
  return new Date() >= dayAfterEnd
}

/**
 * Check if the Call for Papers is currently open.
 *
 * Takes only the two dates it reads, so a caller holding a partially projected
 * conference — or a gate that wants its signature to state exactly which fields
 * it depends on, as `assertMayBecomeSubmitted` does — can pass one without a
 * cast. A full `Conference` satisfies it unchanged.
 */
export function isCfpOpen(
  conference: Pick<Conference, 'cfpStartDate' | 'cfpEndDate'>,
): boolean {
  if (!conference.cfpStartDate || !conference.cfpEndDate) {
    return false
  }
  const now = new Date()
  const startDate = new Date(conference.cfpStartDate + 'T00:00:00Z')
  const endDate = new Date(conference.cfpEndDate + 'T23:59:59.999Z')
  return now >= startDate && now <= endDate
}

/**
 * Whether the conference offers any session format a speaker could submit.
 *
 * A proposal MUST carry a format (`validateProposalForm`), and the submit form
 * only offers the formats this conference configured — so with `formats` empty
 * there is literally nothing submittable. A freshly provisioned tenant starts
 * in exactly that state (see `@/lib/onboarding/create.ts`), which makes an
 * "open" CFP a trap: the page advertises "Submit your proposal" and the form
 * shows an empty format dropdown.
 *
 * DELIBERATELY SEPARATE FROM {@link isCfpOpen} rather than folded into it.
 * `isCfpOpen` answers a purely date-based question and is consumed by surfaces
 * that only care about the window — the homepage lifecycle stage, the admin
 * phase summary, the edit/unsubmit gates on proposals that ALREADY exist.
 * Widening that predicate would silently change all of them. Pair the two only
 * on surfaces that invite a NEW submission.
 *
 * The parameter type says `formats?` even though `Conference` declares it
 * required, because the whole point of this predicate is the case where the
 * document does NOT have it — a caller holding a not-yet-normalised conference
 * must be able to ask without a cast. The `Array.isArray` test additionally
 * covers a legacy document carrying a scalar where the schema says array.
 */
export function hasSubmittableFormats(conference: {
  formats?: Conference['formats']
}): boolean {
  return Array.isArray(conference.formats) && conference.formats.length > 0
}

/**
 * Whether the conference offers any topic a speaker could tag a proposal with.
 *
 * The SAME trap as {@link hasSubmittableFormats}, one field over: strict submit
 * validation requires at least one topic (`validateProposalForm`, and
 * `ProposalInputSchema.topics.min(1)` server-side), and the submit form's topic
 * picker is populated purely from `conference.topics`. With none configured the
 * picker is an empty dropdown over a required field — unsatisfiable.
 *
 * Provisioning deliberately seeds NO topics (`@/lib/onboarding/create.ts`): a
 * topic list is conference-specific in a way session lengths are not, so it is
 * the organizer's to choose. That makes this the day-one blocker that remains
 * after starter formats.
 */
export function hasSubmittableTopics(conference: {
  topics?: Conference['topics']
}): boolean {
  return Array.isArray(conference.topics) && conference.topics.length > 0
}

/**
 * Whether a NEW proposal could actually be completed on this conference —
 * everything strict submit validation needs that comes from the CONFERENCE
 * rather than the speaker. Deliberately excludes {@link isCfpOpen}: the window
 * is a separate question with separate copy ("closed" vs "not set up yet").
 *
 * ONLY FOR CALLERS THAT PROJECTED TOPICS. `topics` is an opt-in join
 * (`getConferenceForDomain({ topics: true })`) — a caller that did not ask for
 * it gets `[]` from the boundary normaliser and this predicate would fail
 * CLOSED on a perfectly well configured conference. Both current call sites
 * (the public `/cfp` page and the `/cfp/proposal` submit page) pass
 * `{ topics: true }`.
 *
 * `src/server/routers/proposal.ts` does NOT project topics, so the submit gate
 * both of its routes share (`assertMayBecomeSubmitted`) keeps the narrower
 * `hasSubmittableFormats` check. What refuses a topic-less proposal there is
 * that gate's STRICT CONTENT VALIDATION — the proposal's own topics — not a
 * conference-level check. Do not read the formats gate as covering topics; it
 * does not.
 */
export function canAcceptProposals(conference: {
  formats?: Conference['formats']
  topics?: Conference['topics']
}): boolean {
  return hasSubmittableFormats(conference) && hasSubmittableTopics(conference)
}

/**
 * Check if the program has been published
 */
export function isProgramPublished(conference: Conference): boolean {
  if (!conference.programDate) {
    return false
  }
  return new Date() >= new Date(conference.programDate)
}

/**
 * Check if registration/tickets are available
 * Returns true only if:
 * - Registration is enabled
 * - Registration link exists
 * - Conference has not ended
 */
export function isRegistrationAvailable(conference: Conference): boolean {
  return (
    conference.registrationEnabled &&
    !!conference.registrationLink &&
    !isConferenceOver(conference)
  )
}

/**
 * Check if workshop registration is currently open
 */
export function isWorkshopRegistrationOpen(conference: Conference): boolean {
  if (
    !conference.workshopRegistrationStart ||
    !conference.workshopRegistrationEnd
  ) {
    return false
  }
  const now = new Date()
  const startDate = new Date(
    conference.workshopRegistrationStart + 'T00:00:00Z',
  )
  const endDate = new Date(
    conference.workshopRegistrationEnd + 'T23:59:59.999Z',
  )
  return now >= startDate && now <= endDate
}

/**
 * Check if we should be seeking sponsors (more than 4 weeks before conference)
 */
export function isSeekingSponsors(conference: Conference): boolean {
  if (!conference.startDate) {
    return false
  }
  const timeUntilConference =
    new Date(conference.startDate).getTime() - new Date().getTime()
  const fourWeeks = 4 * 7 * 24 * 60 * 60 * 1000
  return timeUntilConference > fourWeeks
}
