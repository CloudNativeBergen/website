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

/**
 * The slice of a sponsor record the guards read. A tier may arrive as the
 * dereferenced object (read paths), a reference id string (create/update
 * input), or be absent/cleared — all are normalised by truthiness.
 */
export interface SponsorState {
  tier?: { _id?: string } | string | null
}

interface FieldGuard {
  field: string
  message: string
  satisfied: (sponsor: SponsorState) => boolean
}

/**
 * Permissive-with-guards: every state is allowed unless it carries required
 * fields. Keyed by the state being entered. Unguarded states always pass.
 */
const PIPELINE_GUARDS: Record<string, FieldGuard[]> = {
  'closed-won': [
    {
      field: 'tier',
      message:
        'Set a sponsor tier before marking as Won — untiered sponsors are hidden from the public site.',
      satisfied: (sponsor) => Boolean(sponsor.tier),
    },
  ],
}

const GUARDS: Record<TransitionAxis, Record<string, FieldGuard[]>> = {
  pipeline: PIPELINE_GUARDS,
}

function evaluate(
  axis: TransitionAxis,
  state: string,
  sponsor: SponsorState,
): TransitionResult {
  const guards = (GUARDS[axis] ?? {})[state] ?? []
  const missing = guards
    .filter((guard) => !guard.satisfied(sponsor))
    .map(({ field, message }) => ({ field, message }))

  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

/**
 * Decides whether `sponsor` may move along `axis` from `from` to `to`.
 * A same-state move is a no-op and always allowed (nothing changes, so there
 * is nothing to guard). Otherwise the target state's required-field guards
 * must be satisfied. Returns `{ ok: false, missing }` listing the blocking
 * fields with user-facing messages.
 */
export function canTransition(
  axis: TransitionAxis,
  from: string,
  to: string,
  sponsor: SponsorState,
): TransitionResult {
  if (from === to) return { ok: true }
  return evaluate(axis, to, sponsor)
}

/**
 * Validates that a record resting in pipeline `status` satisfies that state's
 * required-field invariants, independent of any transition. Use at direct
 * write paths (create / update / bulk) that set status without going through
 * a transition, so the same rule is enforced however the state is reached.
 */
export function checkPipelineState(
  status: string,
  sponsor: SponsorState,
): TransitionResult {
  return evaluate('pipeline', status, sponsor)
}
