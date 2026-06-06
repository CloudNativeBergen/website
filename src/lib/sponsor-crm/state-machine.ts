import {
  collectMissing,
  type FieldDef,
  type MissingField,
} from './contract-readiness'
import type { ContactPerson } from '@/lib/sponsor/types'

/**
 * The sponsor record moves along several independent axes (pipeline status,
 * contract status, etc.). Each axis is its own coordinated state machine.
 * Only the pipeline axis is implemented today; contract/signature/invoice
 * axes are added in later slices.
 */
export type TransitionAxis = 'pipeline' | 'contract' | 'signature'

/**
 * The slice of a sponsor record the guards read. A tier may arrive as the
 * dereferenced object (read paths), a reference id string (create/update
 * input), or be absent/cleared — all are normalised by truthiness.
 */
export interface SponsorState {
  tier?: { _id?: string } | string | null
  contractValue?: number | null
  status?: string
  contractStatus?: string
  contactPersons?: ContactPerson[] | null
}

export type TransitionResult =
  | { ok: true }
  | { ok: false; missing: MissingField[] }

/**
 * Permissive-with-guards: every state is allowed unless it carries required
 * fields. Keyed by the state being entered. Unguarded states always pass.
 * Guards reuse the shared readiness FieldDef model so UI and server agree on
 * one definition of "required fields".
 */
const PIPELINE_GUARDS: Record<string, FieldDef<SponsorState>[]> = {
  'closed-won': [
    {
      field: 'tier',
      label: 'Sponsor tier',
      source: 'pipeline',
      severity: 'required',
      message:
        'Set a sponsor tier before marking as Won — untiered sponsors are hidden from the public site.',
      check: (sponsor) => Boolean(sponsor.tier),
    },
  ],
}

/**
 * A valid contract — whether it is being *sent* or marked *signed* — requires a
 * tier and a positive value. These two guards are shared by both contract
 * states so the invariant holds path-independently (an offline mark-signed is
 * held to the same standard as an in-app send).
 */
const CONTRACT_TIER_GUARD: FieldDef<SponsorState> = {
  field: 'tier',
  label: 'Sponsor tier',
  source: 'pipeline',
  severity: 'required',
  message: 'Set a sponsor tier before sending or signing the contract.',
  check: (sponsor) => Boolean(sponsor.tier),
}

const CONTRACT_VALUE_GUARD: FieldDef<SponsorState> = {
  field: 'contractValue',
  label: 'Contract value',
  source: 'pipeline',
  severity: 'required',
  message: 'Set a contract value before sending or signing the contract.',
  check: (sponsor) =>
    sponsor.contractValue != null && sponsor.contractValue > 0,
}

/** No contracts on dead deals. */
const NOT_CLOSED_LOST_GUARD: FieldDef<SponsorState> = {
  field: 'status',
  label: 'Pipeline status',
  source: 'pipeline',
  severity: 'required',
  message: "Can't send a contract on a closed-lost deal.",
  check: (sponsor) => sponsor.status !== 'closed-lost',
}

/**
 * A signed contract names who signed it. Mirrors the readiness primary-contact
 * rule: a contact with name + email that is either flagged primary or the only
 * one on record.
 */
const PRIMARY_CONTACT_GUARD: FieldDef<SponsorState> = {
  field: 'contactPersons',
  label: 'Primary contact person',
  source: 'sponsor',
  severity: 'required',
  message:
    'Add a primary contact (name + email) before marking the contract signed.',
  check: (sponsor) =>
    !!sponsor.contactPersons?.some(
      (c) =>
        c.name &&
        c.email &&
        (c.isPrimary || sponsor.contactPersons?.length === 1),
    ),
}

const CONTRACT_GUARDS: Record<string, FieldDef<SponsorState>[]> = {
  'contract-sent': [
    CONTRACT_TIER_GUARD,
    CONTRACT_VALUE_GUARD,
    NOT_CLOSED_LOST_GUARD,
  ],
  'contract-signed': [
    CONTRACT_TIER_GUARD,
    CONTRACT_VALUE_GUARD,
    PRIMARY_CONTACT_GUARD,
  ],
}

/**
 * A signature can only be tracked once a contract is on the table. Both states
 * are reachable manually (mark pending / mark signed), so the rule lives in the
 * machine rather than only in the send flow. "Sent" subsumes "signed": a signed
 * contract was necessarily sent.
 */
const contractWasSent = (sponsor: SponsorState) =>
  sponsor.contractStatus === 'contract-sent' ||
  sponsor.contractStatus === 'contract-signed'

const CONTRACT_SENT_GUARD: FieldDef<SponsorState> = {
  field: 'contractStatus',
  label: 'Contract sent',
  source: 'pipeline',
  severity: 'required',
  message: 'Send the contract before tracking a signature.',
  check: contractWasSent,
}

const SIGNATURE_GUARDS: Record<string, FieldDef<SponsorState>[]> = {
  pending: [CONTRACT_SENT_GUARD],
  signed: [CONTRACT_SENT_GUARD],
}

const GUARDS: Record<
  TransitionAxis,
  Record<string, FieldDef<SponsorState>[]>
> = {
  pipeline: PIPELINE_GUARDS,
  contract: CONTRACT_GUARDS,
  signature: SIGNATURE_GUARDS,
}

function evaluate(
  axis: TransitionAxis,
  state: string,
  sponsor: SponsorState,
): TransitionResult {
  const missing = collectMissing((GUARDS[axis] ?? {})[state] ?? [], sponsor)
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
 * Validates that a record resting in `state` on `axis` satisfies that state's
 * required-field invariants, independent of any transition. Use at direct write
 * paths (create / update / bulk / send) that set a state without going through a
 * transition — including re-entering the same state — so the same rule holds
 * however the state is reached.
 */
export function checkState(
  axis: TransitionAxis,
  state: string,
  sponsor: SponsorState,
): TransitionResult {
  return evaluate(axis, state, sponsor)
}

/** Pipeline-axis convenience wrapper around {@link checkState}. */
export function checkPipelineState(
  status: string,
  sponsor: SponsorState,
): TransitionResult {
  return checkState('pipeline', status, sponsor)
}
