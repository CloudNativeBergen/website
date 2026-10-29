import { describe, it, expect } from 'vitest'
import { rewritesFor, SEEDED, LINKED } from './index'

const span = (text: string, key = 's1') => ({ _type: 'span', _key: key, text })
const block = (text: string, key: string) => ({
  _type: 'block',
  _key: key,
  children: [span(text)],
})

describe('055 contract-signed template', () => {
  it('rewrites only the seeded "attached" sentence of the contract-signed template', () => {
    expect(
      rewritesFor({
        slug: { current: 'contract-signed' },
        body: [block('Dear {{{SIGNER_NAME}}},', 'b1'), block(SEEDED, 'b3')],
      }),
    ).toEqual([{ blockKey: 'b3', spanKey: 's1' }])
  })

  it('leaves an edited body, another template, and an already rewritten one alone', () => {
    expect(
      rewritesFor({
        slug: { current: 'contract-signed' },
        body: [block('A copy is attached, see below.', 'b3')],
      }),
    ).toEqual([])
    expect(
      rewritesFor({
        slug: { current: 'contract-sent' },
        body: [block(SEEDED, 'b3')],
      }),
    ).toEqual([])
    expect(
      rewritesFor({
        slug: { current: 'contract-signed' },
        body: [block(LINKED, 'b3')],
      }),
    ).toEqual([])
  })
})
