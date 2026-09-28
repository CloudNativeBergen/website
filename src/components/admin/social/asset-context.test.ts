import { describe, expect, it } from 'vitest'
import { assetContext } from './asset-context'

const ADA = { _id: 'sp-ada', _type: 'speaker' as const, name: 'Ada Lovelace' }

describe('the picker tile context (#1163)', () => {
  it("names the edition of a subject's asset, so two years' cards differ", () => {
    expect(
      assetContext({ subject: ADA, scope: 'edition', edition: 'CND 2025' }),
    ).toBe('About Ada Lovelace · CND 2025')
    expect(
      assetContext({ subject: ADA, scope: 'edition', edition: 'CND 2026' }),
    ).toBe('About Ada Lovelace · CND 2026')
  })

  it('says only the subject for an organization-wide one', () => {
    expect(
      assetContext({ subject: ADA, scope: 'organization', edition: null }),
    ).toBe('About Ada Lovelace')
  })

  it('names the edition, or the whole organization, without a subject', () => {
    expect(
      assetContext({ subject: null, scope: 'edition', edition: 'CND 2026' }),
    ).toBe('CND 2026')
    expect(
      assetContext({ subject: null, scope: 'organization', edition: null }),
    ).toBe('Whole organization')
  })
})
