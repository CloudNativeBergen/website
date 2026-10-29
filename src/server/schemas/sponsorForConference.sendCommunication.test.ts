import { describe, it, expect } from 'vitest'
import { SendCommunicationSchema } from './sponsorForConference'

const base = {
  sponsorForConferenceId: 'sfc-1',
  subject: 'Hello',
  message: '[]',
}

describe('SendCommunicationSchema recipients', () => {
  it('requires a recipient for every kind but contract', () => {
    for (const kind of ['information', 'discount', 'registration'] as const) {
      const parsed = SendCommunicationSchema.safeParse({
        ...base,
        kind,
        recipientKeys: [],
        ...(kind === 'discount' && { discountCodes: ['CODE'] }),
      })
      expect(parsed.success).toBe(false)
      expect(
        parsed.error?.issues.some(
          (i) =>
            i.path[0] === 'recipientKeys' && /at least one/.test(i.message),
        ),
      ).toBe(true)
    }
  })

  it('requires a contract send to name the action it was composed for', () => {
    const parsed = SendCommunicationSchema.safeParse({
      ...base,
      kind: 'contract',
      recipientKeys: ['c1'],
    })
    expect(parsed.success).toBe(false)
    expect(
      parsed.error?.issues.some((i) => i.path[0] === 'contractAction'),
    ).toBe(true)
  })

  it('lets a contract send name no contact — the server addresses the signer on record', () => {
    expect(
      SendCommunicationSchema.safeParse({
        ...base,
        kind: 'contract',
        recipientKeys: [],
        contractAction: 'remind',
      }).success,
    ).toBe(true)
  })
})
