import { describe, it, expect } from 'vitest'
import { DEFAULT_CLONE_FLAGS } from '@/lib/conference/edition'
import {
  validateBasics,
  basicsComplete,
  domainsLocalErrors,
  domainsComplete,
  cleanDomains,
  typeToConfirmMatches,
  canProceed,
  canCreate,
  type BasicsState,
  type WizardState,
} from './wizardLogic'

const goodBasics: BasicsState = {
  title: 'CND Bergen 2026',
  organizer: 'CNB',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-03-01',
  cfpNotifyDate: '',
  programDate: '',
}

function state(overrides: Partial<WizardState> = {}): WizardState {
  return {
    basics: goodBasics,
    domains: ['2026.cnb.no'],
    clone: { ...DEFAULT_CLONE_FLAGS },
    confirmTitle: '',
    ...overrides,
  }
}

describe('validateBasics', () => {
  it('passes a well-formed basics', () => {
    expect(validateBasics(goodBasics)).toEqual({})
    expect(basicsComplete(goodBasics)).toBe(true)
  })
  it('requires a title', () => {
    expect(validateBasics({ ...goodBasics, title: '  ' }).title).toBeTruthy()
  })
  it('rejects end before start', () => {
    expect(
      validateBasics({ ...goodBasics, endDate: '2026-05-01' }).endDate,
    ).toBeTruthy()
  })
  it('rejects a reversed CFP window', () => {
    expect(
      validateBasics({
        ...goodBasics,
        cfpStartDate: '2026-03-01',
        cfpEndDate: '2026-01-01',
      }).cfpEndDate,
    ).toBeTruthy()
  })
})

describe('domains', () => {
  it('flags a non-hostname row', () => {
    expect(domainsLocalErrors(['https://x.com/foo'])['domains.0']).toBeTruthy()
  })
  it('requires at least one', () => {
    expect(domainsLocalErrors(['', '  ']).domains).toBeTruthy()
  })
  it('cleans + lowercases + drops blanks', () => {
    expect(cleanDomains([' 2026.CNB.no ', ''])).toEqual(['2026.cnb.no'])
  })
  it('is incomplete when a domain is claimed', () => {
    expect(domainsComplete(['2026.cnb.no'], ['2026.cnb.no'])).toBe(false)
    expect(domainsComplete(['2026.cnb.no'], [])).toBe(true)
  })
})

describe('type-to-confirm', () => {
  it('matches only the exact trimmed title', () => {
    expect(typeToConfirmMatches(' CND Bergen 2026 ', 'CND Bergen 2026')).toBe(
      true,
    )
    expect(typeToConfirmMatches('CND Bergen 2025', 'CND Bergen 2026')).toBe(
      false,
    )
    expect(typeToConfirmMatches('', '')).toBe(false)
  })
})

describe('step gating', () => {
  it('basics gate follows basicsComplete', () => {
    expect(canProceed('basics', state(), [])).toBe(true)
    expect(
      canProceed('basics', state({ basics: { ...goodBasics, title: '' } }), []),
    ).toBe(false)
  })
  it('domains gate rejects a claimed domain', () => {
    expect(canProceed('domains', state(), ['2026.cnb.no'])).toBe(false)
  })
  it('clone step always proceeds', () => {
    expect(canProceed('clone', state(), [])).toBe(true)
  })
  it('review has no next', () => {
    expect(canProceed('review', state(), [])).toBe(false)
  })
})

describe('canCreate', () => {
  it('requires basics, domains AND the confirm title', () => {
    expect(canCreate(state({ confirmTitle: 'CND Bergen 2026' }), [])).toBe(true)
    expect(canCreate(state({ confirmTitle: 'wrong' }), [])).toBe(false)
    expect(
      canCreate(state({ confirmTitle: 'CND Bergen 2026' }), ['2026.cnb.no']),
    ).toBe(false)
  })
})
