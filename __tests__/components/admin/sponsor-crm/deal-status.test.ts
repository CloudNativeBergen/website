import { describe, expect, it } from 'vitest'
import {
  getPrimaryAction,
  nextStepBlockers,
  gateOptions,
  toSponsorState,
  type DealStatusFormData,
} from '@/components/admin/sponsor-crm/form/deal-status'
import { INVOICE_STATUSES } from '@/components/admin/sponsor-crm/form/constants'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

function form(overrides: Partial<DealStatusFormData> = {}): DealStatusFormData {
  return {
    tierId: '',
    contractValue: '',
    contractCurrency: 'NOK',
    status: 'prospect',
    contractStatus: 'none',
    invoiceStatus: 'not-sent',
    ...overrides,
  }
}

/** A sponsor with billing + a primary contact, so contract/invoice guards pass. */
const readySponsor = {
  billing: { email: 'pay@acme.example' },
  contactPersons: [{ name: 'A', email: 'a@acme.example', isPrimary: true }],
} as unknown as SponsorForConferenceExpanded

describe('getPrimaryAction — the contextual CTA ladder', () => {
  it('advances the pipeline stage by stage', () => {
    expect(getPrimaryAction(form({ status: 'prospect' }), null)).toMatchObject({
      kind: 'status',
      target: 'contacted',
      label: 'Advance to Contacted',
    })
    expect(getPrimaryAction(form({ status: 'contacted' }), null)).toMatchObject(
      {
        kind: 'status',
        target: 'negotiating',
      },
    )
  })

  it('offers "Mark as Won" but blocks it until a tier is set', () => {
    const noTier = getPrimaryAction(form({ status: 'negotiating' }), null)
    expect(noTier).toMatchObject({ kind: 'status', target: 'closed-won' })
    expect(
      noTier && noTier.kind === 'status' && noTier.blockedReason,
    ).toContain('tier')

    const withTier = getPrimaryAction(
      form({ status: 'negotiating', tierId: 'tier-1' }),
      null,
    )
    expect(
      withTier && withTier.kind === 'status' && withTier.blockedReason,
    ).toBeUndefined()
  })

  it('drives the contract workflow once won', () => {
    const won = (contractStatus: DealStatusFormData['contractStatus']) =>
      getPrimaryAction(
        form({ status: 'closed-won', tierId: 'tier-1', contractStatus }),
        readySponsor,
      )
    expect(won('none')).toMatchObject({
      kind: 'view',
      target: 'contract',
      label: 'Start contract',
    })
    expect(won('verbal-agreement')).toMatchObject({
      label: 'Send registration',
    })
    expect(won('registration-sent')).toMatchObject({
      label: 'Generate contract',
    })
    expect(won('contract-sent')).toMatchObject({ label: 'Check signature' })
  })

  it('drives the invoice once the contract is signed', () => {
    const signed = getPrimaryAction(
      form({
        status: 'closed-won',
        tierId: 'tier-1',
        contractValue: '100000',
        contractStatus: 'contract-signed',
        invoiceStatus: 'not-sent',
      }),
      readySponsor,
    )
    expect(signed).toMatchObject({ kind: 'invoice', target: 'sent' })

    const sent = getPrimaryAction(
      form({
        status: 'closed-won',
        contractStatus: 'contract-signed',
        invoiceStatus: 'sent',
      }),
      readySponsor,
    )
    expect(sent).toMatchObject({ kind: 'invoice', target: 'paid' })
  })

  it('returns no action for a lost deal', () => {
    expect(getPrimaryAction(form({ status: 'closed-lost' }), null)).toBeNull()
  })
})

describe('nextStepBlockers — inline next-step hint', () => {
  it('reports the tier requirement blocking Won from Negotiating', () => {
    const state = toSponsorState(form({ status: 'negotiating' }), null)
    const blockers = nextStepBlockers('pipeline', 'negotiating', state)
    expect(blockers?.join(' ')).toContain('tier')
  })

  it('clears once the prerequisite is met', () => {
    const state = toSponsorState(
      form({ status: 'negotiating', tierId: 'tier-1' }),
      null,
    )
    expect(nextStepBlockers('pipeline', 'negotiating', state)).toBeNull()
  })
})

describe('gateOptions — per-option disabling', () => {
  it('disables an illegal invoice transition and explains why', () => {
    const state = toSponsorState(
      form({ contractStatus: 'none', contractValue: '' }),
      null,
    )
    const gated = gateOptions('invoice', 'not-sent', INVOICE_STATUSES, state)
    const sent = gated.find((o) => o.value === 'sent')
    expect(sent?.disabled).toBe(true)
    expect(sent?.disabledReason).toContain('contract')

    // The current value is always selectable (a no-op transition).
    const notSent = gated.find((o) => o.value === 'not-sent')
    expect(notSent?.disabled).toBe(false)
  })
})
