import {
  canTransition,
  type TransitionAxis,
  type SponsorState,
} from '@/lib/sponsor-crm/state-machine'
import type {
  SponsorForConferenceExpanded,
  SponsorStatus,
  ContractStatus,
  InvoiceStatus,
} from '@/lib/sponsor-crm/types'

/**
 * The pipeline-form fields the Deal Status controls read/write. Kept structural
 * (not importing SponsorPipelineView) so this module has no component deps.
 */
export interface DealStatusFormData {
  tierId: string
  contractValue: string
  contractCurrency: string
  status: SponsorStatus
  contractStatus: ContractStatus
  invoiceStatus: InvoiceStatus
}

/** Sub-views the header CTA / Manage cards can open (never the main pipeline). */
export type SponsorSubView = 'contract' | 'contacts' | 'logo' | 'history'

/**
 * Project the staged form + persisted sponsor into the shape the state-machine
 * guards read. Mirrors the mapping the form uses elsewhere so the UI and the
 * server agree on what "ready" means.
 */
export function toSponsorState(
  formData: DealStatusFormData,
  sponsor: SponsorForConferenceExpanded | null,
): SponsorState {
  return {
    tier: formData.tierId || null,
    contractValue: formData.contractValue
      ? parseFloat(formData.contractValue)
      : null,
    contractCurrency: formData.contractCurrency,
    status: formData.status,
    contractStatus: formData.contractStatus,
    invoiceStatus: formData.invoiceStatus,
    billing: sponsor?.billing,
    contactPersons: sponsor?.contactPersons,
  }
}

interface StatusOptionBase<T extends string> {
  value: T
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

export interface GatedStatusOption<
  T extends string,
> extends StatusOptionBase<T> {
  disabled: boolean
  disabledReason?: string
}

/**
 * Disable the options a record can't legally move to from `from`, attaching the
 * blocking reasons as a tooltip. The current value is never disabled (a no-op
 * transition is always allowed), so a record can always re-select where it is.
 */
export function gateOptions<T extends string>(
  axis: TransitionAxis,
  from: T,
  options: StatusOptionBase<T>[],
  state: SponsorState,
): GatedStatusOption<T>[] {
  return options.map((option) => {
    const result = canTransition(axis, from, option.value, state)
    return {
      ...option,
      disabled: !result.ok,
      disabledReason: result.ok
        ? undefined
        : result.missing.map((m) => m.message).join('\n'),
    }
  })
}

/** The natural forward step on each axis, used to surface the next blocker. */
const NEXT_STATE: Record<TransitionAxis, Record<string, string>> = {
  pipeline: {
    prospect: 'contacted',
    contacted: 'negotiating',
    negotiating: 'closed-won',
  },
  contract: {
    none: 'verbal-agreement',
    'verbal-agreement': 'registration-sent',
    'registration-sent': 'contract-sent',
    'contract-sent': 'contract-signed',
  },
  invoice: {
    'not-sent': 'sent',
    sent: 'paid',
  },
  signature: {},
}

/**
 * If the natural next step on `axis` is currently blocked, the unmet
 * prerequisites (as user-facing messages) — otherwise `null`. Rendered as an
 * inline hint under the control so the "what's missing" answer is visible, not
 * hidden in a per-option tooltip.
 */
export function nextStepBlockers(
  axis: TransitionAxis,
  from: string,
  state: SponsorState,
): string[] | null {
  const to = NEXT_STATE[axis]?.[from]
  if (!to) return null
  const result = canTransition(axis, from, to, state)
  if (result.ok) return null
  const messages = result.missing
    .map((m) => m.message)
    .filter((m): m is string => Boolean(m))
  return messages.length > 0 ? messages : null
}

/**
 * The single most-relevant next action for a sponsor given its current state —
 * the header's contextual primary CTA. `kind` tells the caller how to apply it:
 * `status`/`invoice` stage a field on the form (committed on Save), `view`
 * opens a sub-view (the multi-step contract workflow). `blockedReason`, when
 * set, means the action's precondition isn't met yet (render disabled + hint).
 */
export type PrimaryAction =
  | {
      label: string
      kind: 'status'
      target: SponsorStatus
      blockedReason?: string
    }
  | {
      label: string
      kind: 'invoice'
      target: InvoiceStatus
      blockedReason?: string
    }
  | { label: string; kind: 'view'; target: SponsorSubView }

export function getPrimaryAction(
  formData: DealStatusFormData,
  sponsor: SponsorForConferenceExpanded | null,
): PrimaryAction | null {
  const state = toSponsorState(formData, sponsor)

  const statusStep = (label: string, target: SponsorStatus): PrimaryAction => {
    const result = canTransition('pipeline', formData.status, target, state)
    return {
      label,
      kind: 'status',
      target,
      blockedReason: result.ok
        ? undefined
        : result.missing.map((m) => m.message).join('\n'),
    }
  }

  switch (formData.status) {
    case 'prospect':
      return statusStep('Advance to Contacted', 'contacted')
    case 'contacted':
      return statusStep('Advance to Negotiating', 'negotiating')
    case 'negotiating':
      return statusStep('Mark as Won', 'closed-won')
    case 'closed-lost':
      return null
    case 'closed-won':
      break
    default:
      return null
  }

  // Won: drive the contract, then the invoice.
  switch (formData.contractStatus) {
    case 'none':
      return { label: 'Start contract', kind: 'view', target: 'contract' }
    case 'verbal-agreement':
      return { label: 'Send registration', kind: 'view', target: 'contract' }
    case 'registration-sent':
      return { label: 'Generate contract', kind: 'view', target: 'contract' }
    case 'contract-sent':
      return { label: 'Check signature', kind: 'view', target: 'contract' }
    case 'contract-signed':
      break
    default:
      return { label: 'Open contract', kind: 'view', target: 'contract' }
  }

  // Signed: drive the invoice.
  if (formData.invoiceStatus === 'not-sent') {
    const result = canTransition('invoice', 'not-sent', 'sent', state)
    return {
      label: 'Mark invoice sent',
      kind: 'invoice',
      target: 'sent',
      blockedReason: result.ok
        ? undefined
        : result.missing.map((m) => m.message).join('\n'),
    }
  }
  if (
    formData.invoiceStatus === 'sent' ||
    formData.invoiceStatus === 'overdue'
  ) {
    return { label: 'Mark invoice paid', kind: 'invoice', target: 'paid' }
  }
  return null
}
