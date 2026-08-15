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
 *
 * `created_at` is on the real `Segment` payload (`resend@6.16.0`,
 * `ListSegmentsResponseSuccess = { object, data: Segment[], has_more }`, and
 * `Segment = { created_at, id, name }`) and is minted in creation order here, so
 * "the oldest audience carrying this key" is a well-defined thing to assert on.
 *
 * There is deliberately NO `update`/rename here, because the real
 * `audiences` resource (class `Segments`) has none — see the header of
 * `audience.ts`. That absence is the whole reason a title edit cannot be
 * followed by a rename on Resend's side.
 */
function fakeAccount() {
  const audiences: { id: string; name: string; created_at: string }[] = []
  let n = 0
  const create = async ({ name }: { name: string }) => {
    const audience = {
      id: `aud-${++n}`,
      name,
      created_at: new Date(Date.UTC(2026, 0, n)).toISOString(),
    }
    audiences.push(audience)
    return { data: audience, error: null }
  }
  const client = {
    audiences: {
      list: async () => ({ data: { data: audiences }, error: null }),
      create,
    },
  }
  return { client: client as unknown as Resend, audiences, create }
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

/**
 * RENAMING A CONFERENCE MUST NOT ORPHAN ITS AUDIENCE (#889).
 *
 * The id-keyed name still embeds the title, so a title edit used to rotate the
 * lookup key: nothing matched, a fresh EMPTY audience was created, and the next
 * broadcast reached nobody while reporting success. Nothing can repair that
 * afterwards — `resend@6.16.0` audiences (class `Segments`) are
 * create/list/get/remove, with no update, so the live audience can never be
 * renamed to catch up.
 *
 * Every assertion below is on an audience ID and on how many audiences exist,
 * i.e. on the thing a broadcast would actually be sent to.
 */
describe('renaming a conference keeps its audience (#889)', () => {
  it('finds the audience again after the title changes', async () => {
    const first = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Working Title'),
      'speakers',
    )

    // Same conference document, retitled in Sanity. Resend still holds the
    // audience under the OLD name, because audiences cannot be renamed.
    const afterRename = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Cloud Native Days Norway 2027'),
      'speakers',
    )

    expect(afterRename.error).toBeUndefined()
    // The defect, stated as a value: this used to be a different, empty audience.
    expect(afterRename.audienceId).toBe(first.audienceId)
    // And nothing was orphaned behind it.
    expect(account.audiences).toHaveLength(1)
    expect(account.audiences[0].name).toContain('Working Title')
  })

  it('survives a rename in either direction, sponsors as well as speakers', async () => {
    const conf = (title: string) => conference('conf-tenant-a', title)
    const speakers = await getOrCreateConferenceAudienceByType(
      conf('Draft'),
      'speakers',
    )
    const sponsors = await getOrCreateConferenceAudienceByType(
      conf('Draft'),
      'sponsors',
    )

    expect(
      (await getOrCreateConferenceAudienceByType(conf('Final'), 'speakers'))
        .audienceId,
    ).toBe(speakers.audienceId)
    expect(
      (await getOrCreateConferenceAudienceByType(conf('Final'), 'sponsors'))
        .audienceId,
    ).toBe(sponsors.audienceId)
    // Renaming back is not a special case either.
    expect(
      (await getOrCreateConferenceAudienceByType(conf('Draft'), 'speakers'))
        .audienceId,
    ).toBe(speakers.audienceId)

    expect(speakers.audienceId).not.toBe(sponsors.audienceId)
    expect(account.audiences).toHaveLength(2)
  })

  it('never lets one conference reach another one by taking its title', async () => {
    const a = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Alpha Conf'),
      'speakers',
    )
    const b = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-b', 'Beta Conf'),
      'speakers',
    )

    // Tenant A now renames its conference to exactly tenant B's title.
    const renamed = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Beta Conf'),
      'speakers',
    )

    expect(renamed.audienceId).toBe(a.audienceId)
    expect(renamed.audienceId).not.toBe(b.audienceId)
    expect(account.audiences).toHaveLength(2)
  })

  it('does not hand a conference the audience of the OTHER type', async () => {
    // Only a sponsors audience exists for this conference. Matching on the
    // `[id]` alone would return it for a speakers request, and every speaker
    // broadcast would go to the sponsors.
    const sponsors = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Alpha Conf'),
      'sponsors',
    )

    const speakers = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Renamed Alpha'),
      'speakers',
    )

    expect(speakers.audienceId).not.toBe(sponsors.audienceId)
    expect(account.audiences).toHaveLength(2)
    expect(account.audiences[1].name).toContain('Speakers')
  })

  it('does not adopt an audience whose key is a different conference id', async () => {
    await account.create({ name: 'Alpha Conf Speakers [conf-tenant-b]' })

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Alpha Conf'),
      'speakers',
    )

    expect(account.audiences).toHaveLength(2)
    expect(audienceId).toBe(account.audiences[1].id)
    expect(account.audiences[1].name).toContain('conf-tenant-a')
  })

  it('takes the OLDEST audience when a pre-#889 rename already orphaned one', async () => {
    // The state a production account can be in right now: the original, full
    // audience plus the empty one the rotation created after a title edit.
    const original = await account.create({
      name: 'Working Title Speakers [conf-tenant-a]',
    })
    const orphan = await account.create({
      name: 'Cloud Native Days Norway 2027 Speakers [conf-tenant-a]',
    })

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      // Current title — so the EMPTY one is the exact-name match, and the right
      // answer is the other one.
      conference('conf-tenant-a', 'Cloud Native Days Norway 2027'),
      'speakers',
    )

    expect(audienceId).toBe(original.data.id)
    expect(audienceId).not.toBe(orphan.data.id)
    expect(account.audiences).toHaveLength(2)
  })

  it('still adopts the legacy audience of an allowlisted conference after a rename', async () => {
    const legacy = await account.create({
      name: 'Cloud Native Days Norway 2026 Speakers',
    })

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      // Allowlisted conference, renamed since. The legacy audience keeps the
      // OLD title forever, so the fallback cannot be computed from the current
      // one.
      conference(LEGACY_CONFERENCE_ID, 'Cloud Native Days Norway 2026 (Oslo)'),
      'speakers',
    )

    expect(audienceId).toBe(legacy.data.id)
    expect(account.audiences).toHaveLength(1)
  })

  it('leaves an audience with NO key alone, and gives the conference a keyed one', async () => {
    // A human renamed this in the Resend dashboard and dropped the `[id]`. Its
    // name now carries only a title, and matching on a title is the collision
    // #886 closed — so it is deliberately unclaimable, and the conference gets a
    // fresh keyed audience instead.
    const unkeyed = await account.create({ name: 'Our Speakers List' })

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Our Speakers List'),
      'speakers',
    )

    expect(audienceId).not.toBe(unkeyed.data.id)
    expect(account.audiences).toHaveLength(2)
    expect(account.audiences[1].name).toBe(
      'Our Speakers List Speakers [conf-tenant-a]',
    )
  })

  it('finds it when a human retitles in the dashboard but keeps the key', async () => {
    const renamedByHand = await account.create({
      name: 'CNDN — speakers, do not delete [conf-tenant-a] ',
    })
    const keptTheKey = await account.create({
      name: 'CNDN — speakers, do not delete Speakers [conf-tenant-a]',
    })

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Cloud Native Days Norway 2027'),
      'speakers',
    )

    // The one that kept the `<Type> [id]` key is adopted; the one that mangled
    // it away is not, even though it also mentions the id.
    expect(audienceId).toBe(keptTheKey.data.id)
    expect(audienceId).not.toBe(renamedByHand.data.id)
    expect(account.audiences).toHaveLength(2)
  })
})
