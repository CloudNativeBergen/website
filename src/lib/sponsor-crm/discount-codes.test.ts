/**
 * @vitest-environment node
 *
 * THE CLAIMANT SET and ADOPTION (#1262, adversarial review of PR #1272).
 *
 * The conference's public sponsors are the `closed-won` CRM rows only, but a
 * code can be SENT to a sponsor at any stage — so a CRM row outside that list
 * may store codes. Its stored codes must stay its own on every surface, and a
 * sponsor's first link must never adopt them, nor adopt a code that the name
 * heuristic cannot pin to exactly one sponsor.
 */
import { describe, expect, it } from 'vitest'
import { sponsorOwningCode } from '@/lib/discounts/attribution'
import type { Conference } from '@/lib/conference/types'
import type { EventDiscount } from '@/lib/discounts/types'
import {
  codesToAdopt,
  resolveChosenCodes,
  withLinkedCodes,
  type SponsorCodeLink,
} from './discount-codes'

const discount = (triggerValue: string) =>
  ({ triggerValue }) as unknown as EventDiscount
const sponsors = (...rows: [string, string][]) =>
  rows.map(([_id, name]) => ({
    sponsor: { _id, name },
  })) as unknown as Conference['sponsors']
const link = (
  sfc: string,
  sponsorId: string,
  name: string,
  linkedCodes: string[] = [],
): SponsorCodeLink => ({
  sponsorForConferenceId: sfc,
  sponsorId,
  name,
  linkedCodes,
})

// "AI" is closed-won and stores nothing; "AI Corp" is still negotiating — NOT
// a conference sponsor — but was sent, and so stores, AICORP2026.
const LINKS = [
  link('sfc-ai', 'sp-ai', 'AI'),
  link('sfc-aicorp', 'sp-aicorp', 'AI Corp', ['AICORP2026']),
]
const CLAIMANTS = withLinkedCodes(sponsors(['sp-ai', 'AI']), LINKS)

describe('withLinkedCodes — every CRM row that stores codes owns them', () => {
  it('a code stored on a non-closed-won sponsor is never attributed to another sponsor by name', () => {
    expect(sponsorOwningCode('AICORP2026', CLAIMANTS)?.name).toBe('AI Corp')
  })

  it('agrees with the send check about whose the code is', () => {
    expect(() =>
      resolveChosenCodes(
        ['AICORP2026'],
        [discount('AICORP2026')],
        LINKS,
        'sfc-ai',
      ),
    ).toThrow('Discount code "AICORP2026" is already linked to AI Corp')
  })

  it('a CRM row that stores NOTHING still claims nothing — not even by name', () => {
    const claimants = withLinkedCodes(sponsors(['sp-ai', 'AI']), [
      link('sfc-ai', 'sp-ai', 'AI'),
      link('sfc-aicorp', 'sp-aicorp', 'AICORP'),
    ])
    expect(claimants.map((c) => c.name)).toEqual(['AI'])
    expect(sponsorOwningCode('AICORP1234', claimants)?.name).toBe('AI')
  })

  it('a sponsor with two CRM rows in one conference keeps the codes of both', () => {
    const claimants = withLinkedCodes(sponsors(['sp-acme', 'Acme']), [
      link('sfc-acme-1', 'sp-acme', 'Acme', ['ACME-A']),
      link('sfc-acme-2', 'sp-acme', 'Acme', ['ACME-B']),
    ])
    expect(sponsorOwningCode('ACME-B', claimants)?.id).toBe('sp-acme')
    expect(claimants[0].linkedCodes).toEqual(['ACME-A', 'ACME-B'])
  })

  it('conference sponsors come first, in their own order', () => {
    expect(CLAIMANTS.map((c) => c.id)).toEqual(['sp-ai', 'sp-aicorp'])
  })
})

describe('codesToAdopt', () => {
  it('never adopts a code another CRM row stores', () => {
    expect(
      codesToAdopt(
        [discount('AICORP2026'), discount('AI5555')],
        CLAIMANTS,
        'sfc-ai',
      ).map((c) => c.code),
    ).toEqual(['AI5555'])
  })

  it('never adopts a code whose name match is ambiguous', () => {
    // "AICORP1234" contains both "ai" and "aicorp": the heuristic's answer
    // depends on list order, so it is not a fact worth storing.
    const both = withLinkedCodes(
      sponsors(['sp-ai', 'AI'], ['sp-aicorp', 'AI Corp']),
      [
        link('sfc-ai', 'sp-ai', 'AI'),
        link('sfc-aicorp', 'sp-aicorp', 'AI Corp'),
      ],
    )
    expect(
      codesToAdopt(
        [discount('AI1234'), discount('AICORP1234')],
        both,
        'sfc-ai',
      ).map((c) => c.code),
    ).toEqual(['AI1234'])
  })

  it('still adopts an unambiguous name match', () => {
    const one = withLinkedCodes(sponsors(['sp-acme', 'Acme Cloud']), [
      link('sfc-acme', 'sp-acme', 'Acme Cloud'),
    ])
    expect(
      codesToAdopt([discount('ACMECLOUD1234')], one, 'sfc-acme').map(
        (c) => c.code,
      ),
    ).toEqual(['ACMECLOUD1234'])
  })
})
