/**
 * @vitest-environment node
 *
 * The device cookie and the deterministic response id (speaker feedback spec
 * §7.3). Expected ids are fixed literals of SHA-256 over `<token>:<talk id>`
 * (computed with `shasum -a 256`), not recomputed the way the code does.
 */
import { describe, expect, it } from 'vitest'
import {
  DEVICE_COOKIE_MAX_AGE,
  MAX_ANSWERED_TALKS,
  answeredOn,
  feedbackResponseId,
  forgetAnswer,
  readDeviceCookie,
  recordAnswer,
} from './device'

const NOW = new Date('2026-10-26T09:30:00.000Z')
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000)

describe('feedbackResponseId', () => {
  it('is the first 32 hex characters of SHA-256 over token and talk id', () => {
    expect(feedbackResponseId('tok', 'talk-1')).toBe(
      'feedbackResponse-62d551a86fa6f8564725caa073596a49',
    )
  })

  it('is the same for the same device and talk, and differs otherwise', () => {
    const id = feedbackResponseId('tok', 'talk-1')
    expect(feedbackResponseId('tok', 'talk-1')).toBe(id)
    expect(feedbackResponseId('tok', 'talk-2')).not.toBe(id)
    expect(feedbackResponseId('tok2', 'talk-1')).not.toBe(id)
  })
})

describe('the device cookie', () => {
  it('reads back the device it was written for, with the talk answered', () => {
    const first = recordAnswer(null, 'talk-1', NOW)
    const device = readDeviceCookie(first.cookie.value, later(60))
    expect(device?.token).toBe(first.device.token)
    expect(device && answeredOn(device, 'talk-1')).toBe(true)
    expect(device && answeredOn(device, 'talk-2')).toBe(false)
  })

  it('mints a random 128-bit token for a new device', () => {
    const a = recordAnswer(null, 'talk-1', NOW).device.token
    const b = recordAnswer(null, 'talk-1', NOW).device.token
    expect(a).not.toBe(b)
    expect(Buffer.from(a, 'base64url')).toHaveLength(16)
  })

  it('keeps the token on a later answer and adds the talk', () => {
    const first = recordAnswer(null, 'talk-1', NOW)
    const second = recordAnswer(
      readDeviceCookie(first.cookie.value, later(60)),
      'talk-2',
      later(60),
    )
    expect(second.device.token).toBe(first.device.token)
    const device = readDeviceCookie(second.cookie.value, later(120))
    expect(device && answeredOn(device, 'talk-1')).toBe(true)
    expect(device && answeredOn(device, 'talk-2')).toBe(true)
  })

  it('never holds a talk id, only a keyed hash of it', () => {
    const {
      cookie: { value },
    } = recordAnswer(null, 'talk-secret-id', NOW)
    const payload = Buffer.from(value.split('.')[0], 'base64url').toString()
    expect(payload).not.toContain('talk-secret-id')
  })

  it('is treated as absent 30 days after the last answer, whatever the browser keeps', () => {
    const {
      cookie: { value },
    } = recordAnswer(null, 'talk-1', NOW)
    expect(readDeviceCookie(value, later(DEVICE_COOKIE_MAX_AGE))).not.toBeNull()
    expect(readDeviceCookie(value, later(DEVICE_COOKIE_MAX_AGE + 1))).toBeNull()
    expect(DEVICE_COOKIE_MAX_AGE).toBe(30 * 24 * 60 * 60)
  })

  it('restarts the 30 days on every answer', () => {
    const first = recordAnswer(null, 'talk-1', NOW)
    const at = later(DEVICE_COOKIE_MAX_AGE - 10)
    const second = recordAnswer(
      readDeviceCookie(first.cookie.value, at),
      'talk-1',
      at,
    )
    expect(
      readDeviceCookie(
        second.cookie.value,
        later(DEVICE_COOKIE_MAX_AGE + 1000),
      ),
    ).not.toBeNull()
  })

  it('is not trusted when forged, tampered with, or malformed', () => {
    const {
      cookie: { value },
    } = recordAnswer(null, 'talk-1', NOW)
    const [payload, signature] = value.split('.')
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString())
    forged.t = Buffer.alloc(16, 7).toString('base64url')
    const reSigned = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`
    for (const bad of [
      reSigned,
      `${payload}.${signature.slice(0, -2)}AA`,
      payload,
      '',
      'a.b',
      undefined,
    ]) {
      expect(readDeviceCookie(bad, later(60))).toBeNull()
    }
  })

  it('keeps only the most recent talks, so it stays under the 4 KB browser limit', () => {
    let device = null
    let value = ''
    for (let i = 0; i < MAX_ANSWERED_TALKS + 20; i++) {
      ;({
        device,
        cookie: { value },
      } = recordAnswer(device, `talk-${i}`, NOW))
      device = readDeviceCookie(value, NOW)
    }
    expect(MAX_ANSWERED_TALKS).toBe(100)
    expect(`konf_feedback=${value}`.length).toBeLessThan(4096)
    expect(answeredOn(device!, `talk-${MAX_ANSWERED_TALKS + 19}`)).toBe(true)
    expect(answeredOn(device!, 'talk-20')).toBe(true)
    expect(answeredOn(device!, 'talk-19')).toBe(false)
  })

  it('moves a talk answered again to the front instead of listing it twice', () => {
    let device = null
    let value = ''
    for (const talk of ['a', 'b', 'a']) {
      ;({
        device,
        cookie: { value },
      } = recordAnswer(device, talk, NOW))
      device = readDeviceCookie(value, NOW)
    }
    expect(device!.answered).toHaveLength(2)
  })
})

describe('forgetAnswer (Delete my answer, §7.4)', () => {
  it('drops the talk from the list and keeps the token', () => {
    const first = recordAnswer(null, 'talk-1', NOW)
    const both = recordAnswer(first.device, 'talk-2', NOW)
    const after = forgetAnswer(
      readDeviceCookie(both.cookie.value, later(60))!,
      'talk-1',
      later(60),
    )
    expect(after.device.token).toBe(first.device.token)
    const device = readDeviceCookie(after.cookie.value, later(120))
    expect(device?.token).toBe(first.device.token)
    expect(device && answeredOn(device, 'talk-1')).toBe(false)
    expect(device && answeredOn(device, 'talk-2')).toBe(true)
  })

  it('does not restart the 30 days: they run from the last ANSWER', () => {
    const {
      cookie: { value },
    } = recordAnswer(null, 'talk-1', NOW)
    const at = later(DEVICE_COOKIE_MAX_AGE - 10)
    const after = forgetAnswer(readDeviceCookie(value, at)!, 'talk-1', at)
    expect(
      readDeviceCookie(after.cookie.value, later(DEVICE_COOKIE_MAX_AGE)),
    ).not.toBeNull()
    expect(
      readDeviceCookie(after.cookie.value, later(DEVICE_COOKIE_MAX_AGE + 1)),
    ).toBeNull()
  })

  it('leaves a list without the talk as it was', () => {
    const { device } = recordAnswer(null, 'talk-1', NOW)
    const after = forgetAnswer(device, 'talk-9', NOW)
    expect(readDeviceCookie(after.cookie.value, later(60))?.answered).toEqual(
      device.answered,
    )
  })
})
