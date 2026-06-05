import type { SponsorForConferenceExpanded } from './types'

/**
 * The sponsor record moves along several independent axes (pipeline status,
 * contract status, etc.). Each axis is its own coordinated state machine.
 * Only the pipeline axis is implemented today; contract/signature/invoice
 * axes are added in later slices.
 */
export type TransitionAxis = 'pipeline'

/** A required field that is missing for a guarded transition. */
export interface MissingRequirement {
  field: string
  message: string
}

export type TransitionResult =
  | { ok: true }
  | { ok: false; missing: MissingRequirement[] }

interface FieldGuard {
  field: string
  message: string
  satisfied: (sponsor: SponsorForConferenceExpanded) => boolean
}

/**
 * Permissive-with-guards: every transition is allowed unless the target state
 * carries required-field guards. Backward moves and unguarded targets always
 * pass. Keyed by target state.
 */
const PIPELINE_GUARDS: Record<string, FieldGuard[]> = {
  'closed-won': [
    {
      field: 'tier',
      message:
        'Set a sponsor tier before marking as Won — untiered sponsors are hidden from the public site.',
      satisfied: (sponsor) => sponsor.tier != null,
    },
  ],
}

const GUARDS: Record<TransitionAxis, Record<string, FieldGuard[]>> = {
  pipeline: PIPELINE_GUARDS,
}

/**
 * Decides whether `sponsor` may move along `axis` from `from` to `to`.
 * Returns `{ ok: true }` when allowed, or `{ ok: false, missing }` listing the
 * required fields (with user-facing messages) that block the transition.
 */
export function canTransition(
  axis: TransitionAxis,
  from: string,
  to: string,
  sponsor: SponsorForConferenceExpanded,
): TransitionResult {
  const guards = GUARDS[axis][to] ?? []
  const missing = guards
    .filter((guard) => !guard.satisfied(sponsor))
    .map(({ field, message }) => ({ field, message }))

  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}
