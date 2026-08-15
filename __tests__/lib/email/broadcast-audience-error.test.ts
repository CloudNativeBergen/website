/**
 * @vitest-environment node
 *
 * THE REFUSAL HAS TO REACH A HUMAN (#893).
 *
 * `getOrCreateConferenceAudienceByType` refuses to create an audience when the
 * Resend audience list could not be paged to exhaustion, because a lookup miss
 * on a truncated list is not an absence. That refusal is only worth anything if
 * the operator who pressed the button is told WHY: the sync endpoints in
 * `speaker.ts`/`sponsor.ts` already put `error.message` into their `TRPCError`,
 * and the broadcast path used to replace it with a bare "Failed to prepare email
 * audience" — indistinguishable from a rate limit, a bad API key, or anything
 * else, and only the server log knew the difference.
 */

const h = vi.hoisted(() => ({
  getOrCreateConferenceAudience: vi.fn(),
  getOrCreateConferenceAudienceByType: vi.fn(),
}))

vi.mock('@/lib/email/audience', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/audience')>()
  return {
    ...actual,
    getOrCreateConferenceAudience: h.getOrCreateConferenceAudience,
    getOrCreateConferenceAudienceByType: h.getOrCreateConferenceAudienceByType,
  }
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Conference } from '@/lib/conference/types'
import { sendBroadcastEmail } from '@/lib/email/broadcast'

const conference = { _id: 'conf-tenant-a', title: 'Alpha' } as Conference

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a refused audience explains itself to the operator (#893)', () => {
  it('returns the audience error message rather than a bare failure', async () => {
    h.getOrCreateConferenceAudience.mockResolvedValue({
      audienceId: '',
      client: {},
      error: new Error(
        'Refusing to create the audience "Alpha Speakers [conf-tenant-a]": Resend returned an incomplete audience list (no-progress)',
      ),
    })

    const response = await sendBroadcastEmail({
      conference,
      subject: 'Hello',
      messagePortableText: [],
    })
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(500)
    // The VALUE an organizer reads. Without this the only difference between
    // "your audience list was truncated" and "Resend is rate limiting you" is a
    // server log nobody is watching.
    expect(body.error).toContain('incomplete audience list')
    expect(body.error).toContain('Alpha Speakers [conf-tenant-a]')
  })

  it('still says something sensible when there is no message to pass on', async () => {
    h.getOrCreateConferenceAudience.mockResolvedValue({
      audienceId: '',
      client: {},
    })

    const response = await sendBroadcastEmail({
      conference,
      subject: 'Hello',
      messagePortableText: [],
    })
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(500)
    expect(body.error).toBe('Failed to prepare email audience')
  })
})
