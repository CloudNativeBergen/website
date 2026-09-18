import {
  collectMissing,
  hasPrimaryContact,
  hasPositiveContractValue,
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
export type TransitionAxis = 'pipeline' | 'contract' | 'signature' | 'invoice'

/**
 * The slice of a sponsor record the guards read. A tier may arrive as the
 * dereferenced object (read paths), a reference id string (create/update
 * input), or be absent/cleared — all are normalised by truthiness.
 */
export interface SponsorState {
  tier?: { _id?: string } | string | null
  contractValue?: number | null
  contractCurrency?: string
  status?: string
  billing?: { email?: string }
  contractStatus?: string
  signatureStatus?: string
  invoiceStatus?: string
  contactPersons?: ContactPerson[] | null
}

export type TransitionResult =
  { ok: true } | { ok: false; missing: MissingField[] }

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
  check: (sponsor) => hasPositiveContractValue(sponsor.contractValue),
}

/** No contracts on dead deals — applies to sending and to marking signed. */
const NOT_CLOSED_LOST_GUARD: FieldDef<SponsorState> = {
  field: 'status',
  label: 'Pipeline status',
  source: 'pipeline',
  severity: 'required',
  message: "Can't send or sign a contract on a closed-lost deal.",
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
  check: (sponsor) => hasPrimaryContact(sponsor.contactPersons),
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
    NOT_CLOSED_LOST_GUARD,
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

const INVOICE_GUARDS: Record<string, FieldDef<SponsorState>[]> = {
  sent: [
    {
      field: 'contractValue',
      label: 'Contract value',
      source: 'pipeline',
      severity: 'required',
      message: 'Set a contract value before marking the invoice as sent.',
      check: (sponsor) =>
        sponsor.contractValue != null && sponsor.contractValue > 0,
    },
    {
      field: 'contractCurrency',
      label: 'Contract currency',
      source: 'pipeline',
      severity: 'required',
      message: 'Set a contract currency before marking the invoice as sent.',
      check: (sponsor) => Boolean(sponsor.contractCurrency),
    },
    {
      field: 'billing.email',
      label: 'Billing email',
      source: 'sponsor',
      severity: 'required',
      message:
        'Add a billing email address before marking the invoice as sent.',
      check: (sponsor) => Boolean(sponsor.billing?.email),
    },
    {
      field: 'contractStatus',
      label: 'Contract status',
      source: 'pipeline',
      severity: 'required',
      message:
        'A contract must be signed before the invoice can be marked as sent.',
      check: (sponsor) => sponsor.contractStatus === 'contract-signed',
    },
  ],
}

const GUARDS: Record<
  TransitionAxis,
  Record<string, FieldDef<SponsorState>[]>
> = {
  pipeline: PIPELINE_GUARDS,
  contract: CONTRACT_GUARDS,
  signature: SIGNATURE_GUARDS,
  invoice: INVOICE_GUARDS,
}

function evaluate(
  axis: TransitionAxis,
  state: string,
  sponsor: SponsorState,
): TransitionResult {
  const missing = collectMissing((GUARDS[axis] ?? {})[state] ?? [], sponsor)
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

/** The sponsor field each axis' state lives in, and its value when unset. */
const AXIS_FIELD: Record<TransitionAxis, keyof SponsorState> = {
  pipeline: 'status',
  contract: 'contractStatus',
  signature: 'signatureStatus',
  invoice: 'invoiceStatus',
}

const AXIS_DEFAULT_STATE: Record<TransitionAxis, string> = {
  pipeline: 'prospect',
  contract: 'none',
  signature: 'not-started',
  invoice: 'not-sent',
}

const AXES = Object.keys(AXIS_FIELD) as TransitionAxis[]

/**
 * An invoice that is paid or overdue was necessarily sent (the ordering rules
 * below allow no other route), so it rests under the `sent` invariants. Without
 * this, `paid` would look unguarded and a signed contract could be unsigned out
 * from under a paid invoice.
 */
const RESTING_STATE_ALIAS: Partial<
  Record<TransitionAxis, Record<string, string>>
> = {
  invoice: { paid: 'sent', overdue: 'sent' },
}

function restingState(axis: TransitionAxis, sponsor: SponsorState): string {
  const raw =
    (sponsor[AXIS_FIELD[axis]] as string | undefined) ||
    AXIS_DEFAULT_STATE[axis]
  return RESTING_STATE_ALIAS[axis]?.[raw] ?? raw
}

/** Names the axis state that a move would strand, for the block message. */
function conflictSubject(axis: TransitionAxis, sponsor: SponsorState): string {
  const state = (sponsor[AXIS_FIELD[axis]] as string | undefined) ?? ''
  switch (axis) {
    case 'invoice':
      return `this sponsor has ${state === 'overdue' ? 'an' : 'a'} ${state} invoice`
    case 'signature':
      return `this sponsor's signature is marked ${state}`
    case 'contract':
      return `this sponsor's contract is marked ${state}`
    case 'pipeline':
      return `this sponsor's deal is ${state}`
  }
}

/**
 * Guards are per-axis, but the fields they read are shared: the invoice axis
 * reads `contractStatus`, the signature axis reads it too. So a move that is
 * legal on its own axis can still strand another one — unsigning a contract
 * under a paid invoice, for instance.
 *
 * Validates the *resulting* record on every other axis at that axis' resting
 * state. Only a violation the move itself introduces blocks: an axis already
 * broken before the move stays broken and is not this move's fault (the
 * back-catalog of invalid records must stay editable).
 */
function crossAxisMissing(
  axis: TransitionAxis,
  to: string,
  sponsor: SponsorState,
): MissingField[] {
  const after: SponsorState = { ...sponsor, [AXIS_FIELD[axis]]: to }
  const missing: MissingField[] = []

  for (const other of AXES) {
    if (other === axis) continue
    // A dead deal carries no live contract/signature/invoice obligations — the
    // leftover statuses are history. Mirrors the same carve-out in the health
    // audit (`auditSponsorHealth`).
    if (after.status === 'closed-lost' && other !== 'pipeline') continue

    const state = restingState(other, after)
    if (!checkState(other, state, sponsor).ok) continue

    const result = checkState(other, state, after)
    if (result.ok) continue

    missing.push(
      ...result.missing.map((field) => ({
        ...field,
        message: `Can't do that — ${conflictSubject(other, after)}. Change or clear that first.`,
      })),
    )
  }

  return missing
}

/**
 * Decides whether `sponsor` may move along `axis` from `from` to `to`.
 * A same-state move is a no-op and always allowed (nothing changes, so there
 * is nothing to guard). Otherwise the target state's required-field guards
 * must be satisfied *and* the resulting record must still satisfy every other
 * axis it touches (see {@link crossAxisMissing}). Returns `{ ok: false,
 * missing }` listing the blocking fields with user-facing messages.
 */
export function canTransition(
  axis: TransitionAxis,
  from: string,
  to: string,
  sponsor: SponsorState,
): TransitionResult {
  if (from === to) return { ok: true }

  if (axis === 'invoice') {
    if (to === 'paid' && from !== 'sent' && from !== 'overdue') {
      return {
        ok: false,
        missing: [
          {
            field: 'invoiceStatus',
            label: 'Invoice status',
            source: 'pipeline',
            severity: 'required',
            message: `Invoice must be sent or overdue before it can be marked as paid.`,
          },
        ],
      }
    }
    if (to === 'overdue' && from !== 'sent') {
      return {
        ok: false,
        missing: [
          {
            field: 'invoiceStatus',
            label: 'Invoice status',
            source: 'pipeline',
            severity: 'required',
            message: `Invoice must be sent before it can be marked as overdue.`,
          },
        ],
      }
    }
  }

  const target = evaluate(axis, to, sponsor)
  if (!target.ok) return target

  const stranded = crossAxisMissing(axis, to, sponsor)
  return stranded.length === 0 ? { ok: true } : { ok: false, missing: stranded }
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
