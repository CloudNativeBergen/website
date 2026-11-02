import { describe, it, expect, beforeAll } from 'vitest'
import { assertMayBecomeSubmitted } from './proposalSubmission'
import { mintLateSubmissionToken } from '@/lib/proposal/late-submission-token'

beforeAll(() => {
  process.env.INVITATION_TOKEN_SECRET = 'test-secret'
})

// CFP closed long ago; no formats, so a lifted window stops at the NEXT gate.
const conference = {
  _id: 'conf-a',
  cfpStartDate: '2020-01-01',
  cfpEndDate: '2020-02-01',
  formats: [],
}

function run(token?: string, email = 'ada@example.com') {
  return () =>
    assertMayBecomeSubmitted({
      conference,
      content: {},
      contentSource: 'payload',
      lateSubmission: { token, email },
    })
}

describe('assertMayBecomeSubmitted with a late link (#249)', () => {
  it('refuses with the CFP closed and no token', () => {
    expect(run()).toThrow(/Call for Papers is currently closed/)
  })

  it('lifts only the CFP window for a valid token', () => {
    const token = mintLateSubmissionToken({
      conferenceId: 'conf-a',
      exp: Date.now() + 60_000,
    })
    expect(run(token)).toThrow(/session formats/)
  })

  it('keeps the window shut for an expired, foreign or wrong-email token', () => {
    const expired = mintLateSubmissionToken({
      conferenceId: 'conf-a',
      exp: Date.now() - 1,
    })
    const foreign = mintLateSubmissionToken({
      conferenceId: 'conf-b',
      exp: Date.now() + 60_000,
    })
    const bound = mintLateSubmissionToken({
      conferenceId: 'conf-a',
      exp: Date.now() + 60_000,
      email: 'other@example.com',
    })
    for (const t of [expired, foreign, bound]) {
      expect(run(t)).toThrow(/Call for Papers is currently closed/)
    }
  })
})
