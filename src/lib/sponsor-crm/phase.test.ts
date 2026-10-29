import { describe, expect, it } from 'vitest'
import { sponsorPhase, sponsorTimeline } from './phase'

const base = {
  status: 'prospect' as const,
  contractStatus: 'none' as const,
  invoiceStatus: 'not-sent' as const,
}

describe('sponsorPhase', () => {
  it.each([
    [{}, 'Prospect'],
    [{ status: 'contacted' }, 'Contacted'],
    [{ status: 'negotiating' }, 'Negotiating'],
    [{ status: 'closed-lost', invoiceStatus: 'paid' }, 'Lost'],
    [{ status: 'closed-won' }, 'Won – registration'],
    [
      { status: 'closed-won', contractStatus: 'registration-sent' },
      'Won – registration',
    ],
    [
      {
        status: 'closed-won',
        contractStatus: 'registration-sent',
        registrationComplete: true,
      },
      'Won – contract',
    ],
    [
      { status: 'closed-won', contractStatus: 'contract-sent' },
      'Won – contract',
    ],
    [
      {
        status: 'closed-won',
        contractStatus: 'contract-sent',
        signatureStatus: 'signed',
      },
      'Won – invoice',
    ],
    [
      {
        status: 'closed-won',
        contractStatus: 'contract-signed',
        invoiceStatus: 'sent',
      },
      'Won – invoice',
    ],
    [
      {
        status: 'closed-won',
        contractStatus: 'contract-signed',
        invoiceStatus: 'paid',
      },
      'Paid',
    ],
  ])('%o is %s', (patch, phase) => {
    expect(sponsorPhase({ ...base, ...patch } as never)).toBe(phase)
  })
})

describe('sponsorTimeline', () => {
  it('prefers stored dates and falls back to the activity log', () => {
    const steps = sponsorTimeline(
      {
        ...base,
        status: 'closed-won',
        contractStatus: 'contract-signed',
        contactInitiatedAt: '2026-01-02T10:00:00Z',
        contractSignedAt: '2026-03-01T10:00:00Z',
      },
      [
        {
          activityType: 'stage_change',
          createdAt: '2026-01-05T10:00:00Z',
          metadata: { newValue: 'contacted' },
        },
        {
          activityType: 'stage_change',
          createdAt: '2026-02-01T10:00:00Z',
          metadata: { newValue: 'closed-won' },
        },
        {
          activityType: 'stage_change',
          createdAt: '2026-02-10T10:00:00Z',
          metadata: {
            newValue: 'closed-won',
            timestamp: '2026-02-09T10:00:00Z',
          },
        },
        {
          activityType: 'contract_status_change',
          createdAt: '2026-02-20T10:00:00Z',
          metadata: { newValue: 'contract-sent' },
        },
      ],
    )
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]))
    expect(byKey.contacted.date).toBe('2026-01-02T10:00:00Z')
    expect(byKey.won.date).toBe('2026-02-09T10:00:00Z')
    expect(byKey['contract-sent']).toMatchObject({
      date: '2026-02-20T10:00:00Z',
      reached: true,
    })
    expect(byKey.signed.date).toBe('2026-03-01T10:00:00Z')
    expect(byKey.registered).toMatchObject({ reached: false, date: undefined })
    expect(byKey.invoiced.reached).toBe(false)
    expect(steps.map((s) => s.key)).toEqual([
      'contacted',
      'won',
      'registered',
      'contract-sent',
      'signed',
      'invoiced',
      'paid',
    ])
  })

  it('ends a lost deal with Lost and drops unreached steps', () => {
    const steps = sponsorTimeline(
      {
        ...base,
        status: 'closed-lost',
        contactInitiatedAt: '2026-01-02T10:00:00Z',
      },
      [
        {
          activityType: 'stage_change',
          createdAt: '2026-01-09T10:00:00Z',
          metadata: { newValue: 'closed-lost' },
        },
      ],
    )
    expect(steps).toEqual([
      {
        key: 'contacted',
        label: 'Contacted',
        date: '2026-01-02T10:00:00Z',
        reached: true,
      },
      {
        key: 'lost',
        label: 'Lost',
        date: '2026-01-09T10:00:00Z',
        reached: true,
      },
    ])
  })
})
