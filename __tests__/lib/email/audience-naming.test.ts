/**
 * @vitest-environment node
 *
 * RESEND AUDIENCE NAMING MUST BE KEYED BY CONFERENCE ID (#886).
 *
 * Audiences are account-scoped objects looked up by NAME on every call (nothing
 * is persisted). The name used to be `"${conference.title} Speakers"`, so two
 * tenants on the SHARED platform account whose conferences share a title
 * resolved to the SAME audience id — and every sync then merged one tenant's
 * contact list into the other's. That is a privacy incident, and it is silent:
 * both sides get a working audience and a successful send.
 *
 * The fake Resend account below is a real object with real state — audiences
 * created against it persist for the duration of a test — so the assertions are
 * about WHICH AUDIENCE ID came back and HOW MANY audiences exist afterwards, not
 * about the name string a helper computed.
 */

const h = vi.hoisted(() => ({ resolveEmailSender: vi.fn() }))

vi.mock('@/lib/email/config', () => ({
  resolveEmailSender: h.resolveEmailSender,
  retryWithBackoff: async (fn: () => unknown) => await fn(),
  delay: async () => {},
  isRateLimitError: () => false,
  EMAIL_CONFIG: { RATE_LIMIT_DELAY: 0, MAX_RETRIES: 3 },
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Resend } from 'resend'
import type { Conference } from '@/lib/conference/types'
import {
  getOrCreateConferenceAudienceByType,
  conferenceAudienceName,
} from '@/lib/email/audience'

/** The three production conferences that predate the rename are allowlisted. */
const LEGACY_CONFERENCE_ID = 'eb7b16c6-00fa-44a0-adcd-4a480de34242'

/**
 * One Resend account, holding audiences by name. `create` does NOT dedupe by
 * name — the real API does not either, which is exactly why a title collision
 * used to resolve to a shared id rather than erroring.
 */
function fakeAccount() {
  const audiences: { id: string; name: string }[] = []
  let n = 0
  const client = {
    audiences: {
      list: async () => ({ data: { data: audiences }, error: null }),
      create: async ({ name }: { name: string }) => {
        const audience = { id: `aud-${++n}`, name }
        audiences.push(audience)
        return { data: audience, error: null }
      },
    },
  }
  return { client: client as unknown as Resend, audiences }
}

const conference = (id: string, title: string) =>
  ({ _id: id, title }) as Conference

let account: ReturnType<typeof fakeAccount>

beforeEach(() => {
  vi.clearAllMocks()
  account = fakeAccount()
  // One SHARED account for every tenant — the T0 tier, where the collision lives.
  h.resolveEmailSender.mockResolvedValue({ client: account.client })
})

describe('audience naming — two tenants must never share an audience', () => {
  it('gives two same-titled conferences on ONE account DIFFERENT audiences', async () => {
    const a = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Cloud Native Days'),
      'speakers',
    )
    const b = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-b', 'Cloud Native Days'),
      'speakers',
    )

    expect(a.error).toBeUndefined()
    expect(b.error).toBeUndefined()
    expect(a.audienceId).toBeTruthy()
    expect(b.audienceId).toBeTruthy()
    // The defect, stated as a value: these used to be the same id.
    expect(a.audienceId).not.toBe(b.audienceId)
    expect(account.audiences).toHaveLength(2)
  })

  it('is stable for one conference: a second call reuses its audience', async () => {
    const conf = conference('conf-tenant-a', 'Cloud Native Days')
    const first = await getOrCreateConferenceAudienceByType(conf, 'speakers')
    const second = await getOrCreateConferenceAudienceByType(conf, 'speakers')

    expect(second.audienceId).toBe(first.audienceId)
    expect(account.audiences).toHaveLength(1)
  })

  it('keeps speakers and sponsors apart for the same conference', async () => {
    const conf = conference('conf-tenant-a', 'Cloud Native Days')
    const speakers = await getOrCreateConferenceAudienceByType(conf, 'speakers')
    const sponsors = await getOrCreateConferenceAudienceByType(conf, 'sponsors')

    expect(speakers.audienceId).not.toBe(sponsors.audienceId)
  })

  it('puts the conference id in the name and keeps the title readable', () => {
    const name = conferenceAudienceName(
      conference('conf-tenant-a', 'Cloud Native Days'),
      'speakers',
    )
    expect(name).toContain('conf-tenant-a')
    expect(name).toContain('Cloud Native Days')
  })
})

describe('the live audience under the OLD name must not be orphaned', () => {
  it('adopts the legacy title-keyed audience instead of creating a second one', async () => {
    // The state of the production account today: an audience created under the
    // pre-#886 name.
    const legacy = await account.client.audiences.create({
      name: 'Cloud Native Days Norway 2026 Speakers',
    })

    const { audienceId, error } = await getOrCreateConferenceAudienceByType(
      conference(LEGACY_CONFERENCE_ID, 'Cloud Native Days Norway 2026'),
      'speakers',
    )

    expect(error).toBeUndefined()
    // The SAME audience — its contacts, and whatever unsubscribe state Resend
    // keeps on them, stay reachable.
    expect(audienceId).toBe(legacy.data!.id)
    // Nothing new was created: no empty audience for the next broadcast to
    // succeed into and reach nobody.
    expect(account.audiences).toHaveLength(1)
  })

  it('does NOT let a different conference adopt that audience, same title or not', async () => {
    await account.client.audiences.create({
      name: 'Cloud Native Days Norway 2026 Speakers',
    })

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      // A second tenant that picked the identical title. Not allowlisted,
      // because it did not exist when the rename landed.
      conference('conf-tenant-b', 'Cloud Native Days Norway 2026'),
      'speakers',
    )

    expect(account.audiences).toHaveLength(2)
    expect(audienceId).toBe(account.audiences[1].id)
    expect(account.audiences[1].name).toContain('conf-tenant-b')
  })

  it('creates an id-keyed audience for an allowlisted conference when no legacy one exists', async () => {
    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference(LEGACY_CONFERENCE_ID, 'Cloud Native Days Norway 2026'),
      'sponsors',
    )

    expect(account.audiences).toHaveLength(1)
    expect(account.audiences[0].name).toContain(LEGACY_CONFERENCE_ID)
    expect(audienceId).toBe(account.audiences[0].id)
  })
})
