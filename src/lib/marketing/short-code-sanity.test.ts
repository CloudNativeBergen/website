import { describe, expect, it, vi, beforeEach } from 'vitest'

const read = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => read(...a) },
}))

import {
  conferenceShortCodes,
  shortCodeForMutation,
  shortCodeMinterFor,
} from './short-code-sanity'
import { normalizeShortCode } from './short-code'

beforeEach(() => {
  vi.clearAllMocks()
  read.mockResolvedValue([])
})

describe('conferenceShortCodes — ONE tenant-scoped query over both types', () => {
  it('scopes to the conference and asks both document types in one root', async () => {
    await conferenceShortCodes('conf-1')
    const [query, params] = read.mock.calls[0]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('_type in ["socialPostVariant", "marketingTask"]')
    expect(query.match(/\*\[/g)).toHaveLength(1)
    expect(params).toMatchObject({ conferenceId: 'conf-1' })
  })

  it('reads through the uncached client, so it sees the previous mint', async () => {
    await conferenceShortCodes('conf-1')
    expect(read.mock.calls[0][2]).toMatchObject({ cache: 'no-store' })
  })

  it('keeps only the strings', async () => {
    read.mockResolvedValue(['abc987', null, 42, 'defg23'])
    await expect(conferenceShortCodes('conf-1')).resolves.toEqual([
      'abc987',
      'defg23',
    ])
  })

  it('treats a non-array answer as no codes rather than throwing', async () => {
    read.mockResolvedValue({ unexpected: true })
    await expect(conferenceShortCodes('conf-1')).resolves.toEqual([])
  })
})

describe('shortCodeMinterFor — one query per batch', () => {
  it('reads the conference codes ONCE however many codes the batch draws', async () => {
    read.mockResolvedValue(['aaaaaa'])
    const mint = await shortCodeMinterFor('conf-1')
    const codes = [mint(), mint(), mint()]
    expect(read).toHaveBeenCalledTimes(1)
    expect(codes).not.toContain('aaaaaa')
    expect(new Set(codes).size).toBe(3)
    for (const code of codes) expect(normalizeShortCode(code)).toBe(code)
  })
})

describe('shortCodeForMutation — the backfill (spec §2.2)', () => {
  it('keeps a code the document already has, and reads nothing', async () => {
    await expect(shortCodeForMutation('conf-1', 'abc987')).resolves.toBe(
      'abc987',
    )
    expect(read).not.toHaveBeenCalled()
  })

  it('normalizes a stored code rather than minting a second one', async () => {
    await expect(shortCodeForMutation('conf-1', 'ABC987')).resolves.toBe(
      'abc987',
    )
    expect(read).not.toHaveBeenCalled()
  })

  it('mints for a document that predates the field', async () => {
    read.mockResolvedValue([])
    const code = await shortCodeForMutation('conf-1', null)
    expect(normalizeShortCode(code)).toBe(code)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('mints for a stored value that is not a code', async () => {
    read.mockResolvedValue([])
    const code = await shortCodeForMutation('conf-1', 'NOT-A-CODE')
    expect(code).not.toBe('NOT-A-CODE')
    expect(normalizeShortCode(code)).toBe(code)
  })
})
