import { describe, expect, it } from 'vitest'
import { acceptedSharedHandleLines } from './erasure-mentions'

describe('acceptedSharedHandleLines (the CLI’s DSR lines, #1232)', () => {
  it('one line per accepted handle, with who lists it and where it stays', () => {
    expect(
      acceptedSharedHandleLines([
        {
          handle: 'team.dev',
          listedBy: ['spk-b', 'spk-c'],
          variantIds: ['v1', 'v2'],
        },
        { handle: 'ada.dev', listedBy: ['spk-d'], variantIds: ['v3'] },
      ]),
    ).toEqual([
      'Accepted as shared (record in the DSR): @team.dev — listed by spk-b, spk-c — variants v1, v2',
      'Accepted as shared (record in the DSR): @ada.dev — listed by spk-d — variants v3',
    ])
  })

  it('nothing when nothing was accepted', () => {
    expect(acceptedSharedHandleLines([])).toEqual([])
  })
})
