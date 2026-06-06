import { checkState, type TransitionAxis } from './state-machine'
import type { MissingField } from './contract-readiness'
import type { SponsorForConferenceExpanded } from './types'

/**
 * A single sponsor breaking a single axis's invariant: the rule(s) it violates
 * and whether the violation hides a paying sponsor from the public site.
 */
export interface SponsorHealthViolation {
  sponsorId: string
  sponsorName: string
  axis: TransitionAxis
  state: string
  missing: MissingField[]
  hidesFromPublicSite: boolean
}

/**
 * The current resting state of a sponsor on each guarded axis. Adding an axis to
 * the state machine surfaces here as a type error until it is mapped, so the
 * audit can never silently skip a guarded axis.
 */
const AXIS_STATE: Record<
  TransitionAxis,
  (sponsor: SponsorForConferenceExpanded) => string
> = {
  pipeline: (s) => s.status,
  contract: (s) => s.contractStatus,
  signature: (s) => s.signatureStatus ?? 'not-started',
}

const AXES = Object.keys(AXIS_STATE) as TransitionAxis[]

/**
 * Lists every sponsor currently violating a state-machine invariant, one entry
 * per (sponsor × axis). Reuses the shared guard predicates (via
 * {@link checkState}) so it stays in sync with the rules rather than duplicating
 * them — new guards on any axis are picked up automatically.
 */
export function auditSponsorHealth(
  sponsors: SponsorForConferenceExpanded[],
): SponsorHealthViolation[] {
  const violations: SponsorHealthViolation[] = []

  for (const sponsor of sponsors) {
    for (const axis of AXES) {
      const state = AXIS_STATE[axis](sponsor)
      const result = checkState(axis, state, sponsor)
      if (result.ok) continue

      violations.push({
        sponsorId: sponsor._id,
        sponsorName: sponsor.sponsor.name,
        axis,
        state,
        missing: result.missing,
        hidesFromPublicSite:
          axis === 'pipeline' &&
          state === 'closed-won' &&
          result.missing.some((m) => m.field === 'tier'),
      })
    }
  }

  // Surface public-site hides first so the panel can highlight them most
  // prominently. Array.sort is stable, so the rest keep their discovery order.
  return violations.sort(
    (a, b) => Number(b.hidesFromPublicSite) - Number(a.hidesFromPublicSite),
  )
}
