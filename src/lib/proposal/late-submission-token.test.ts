import { describe, it, expect, beforeAll } from 'vitest'
import {
  mintLateSubmissionToken,
  isLateSubmissionAllowed,
} from './late-submission-token'

beforeAll(() => {
  process.env.INVITATION_TOKEN_SECRET = 'test-secret'
})

const NOW = Date.UTC(2026, 10, 2)
const ctx = { conferenceId: 'conf-a', email: 'Ada@Example.com', now: NOW }

describe('late submission token', () => {
  it('accepts a valid unbound token', () => {
    const t = mintLateSubmissionToken({ conferenceId: 'conf-a', exp: NOW + 1 })
    expect(isLateSubmissionAllowed(t, ctx)).toBe(true)
  })

  it('accepts an email-bound token for the same email, any case', () => {
    const t = mintLateSubmissionToken({
      conferenceId: 'conf-a',
      exp: NOW + 1,
      email: ' ada@example.COM ',
    })
    expect(isLateSubmissionAllowed(t, ctx)).toBe(true)
  })

  it('refuses an expired token', () => {
    const t = mintLateSubmissionToken({ conferenceId: 'conf-a', exp: NOW - 1 })
    expect(isLateSubmissionAllowed(t, ctx)).toBe(false)
  })

  it("refuses another conference's token", () => {
    const t = mintLateSubmissionToken({ conferenceId: 'conf-b', exp: NOW + 1 })
    expect(isLateSubmissionAllowed(t, ctx)).toBe(false)
  })

  it('refuses a tampered payload', () => {
    const t = mintLateSubmissionToken({ conferenceId: 'conf-b', exp: NOW + 1 })
    const [, sig] = t.split('.')
    const forged = Buffer.from(
      JSON.stringify({ conferenceId: 'conf-a', exp: NOW + 1 }),
    ).toString('base64url')
    expect(isLateSubmissionAllowed(`${forged}.${sig}`, ctx)).toBe(false)
  })

  it('refuses a token bound to a different email', () => {
    const t = mintLateSubmissionToken({
      conferenceId: 'conf-a',
      exp: NOW + 1,
      email: 'someone@else.no',
    })
    expect(isLateSubmissionAllowed(t, ctx)).toBe(false)
    expect(isLateSubmissionAllowed(t, { ...ctx, email: undefined })).toBe(false)
  })

  it('refuses garbage', () => {
    expect(isLateSubmissionAllowed(undefined, ctx)).toBe(false)
    expect(isLateSubmissionAllowed('nope', ctx)).toBe(false)
    expect(isLateSubmissionAllowed('a.b', ctx)).toBe(false)
  })
})
