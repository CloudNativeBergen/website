import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTalkStatus, parseTalkDateTime } from './time-utils'
import type { TrackTalk } from '@/lib/conference/types'

// Schedule times are Oslo wall-clock; a viewer in another zone must get the
// same instant.
describe('parseTalkDateTime in a non-Oslo zone', () => {
  let originalTz: string | undefined
  beforeEach(() => {
    originalTz = process.env.TZ
    process.env.TZ = 'America/Sao_Paulo'
  })
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('reads a summer time as CEST (UTC+2)', () => {
    expect(parseTalkDateTime('2026-06-15', '10:00').toISOString()).toBe(
      '2026-06-15T08:00:00.000Z',
    )
  })

  it('reads a winter time as CET (UTC+1)', () => {
    expect(parseTalkDateTime('2026-11-05', '10:00').toISOString()).toBe(
      '2026-11-05T09:00:00.000Z',
    )
  })

  it('tolerates HH:MM:SS and rejects garbage', () => {
    expect(parseTalkDateTime('2026-11-05', '10:00:00').toISOString()).toBe(
      '2026-11-05T09:00:00.000Z',
    )
    expect(Number.isNaN(parseTalkDateTime('nope', '10:00').getTime())).toBe(
      true,
    )
  })

  it('getTalkStatus uses the Oslo instant', () => {
    const talk = { startTime: '10:00', endTime: '10:45' } as TrackTalk
    const at = (iso: string) => getTalkStatus(talk, '2026-11-05', new Date(iso))
    expect(at('2026-11-05T09:10:00Z')).toBe('happening-now')
    expect(at('2026-11-05T09:50:00Z')).toBe('past')
    expect(at('2026-11-05T08:59:00Z')).toBe('happening-soon')
  })
})
