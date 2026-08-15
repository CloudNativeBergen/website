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
 * `created_at` is on the real `Segment` payload (`resend@6.18.1`, the version
 * this repo pins: `ListSegmentsResponseSuccess = { object, data: Segment[],
 * has_more }` and `Segment = { created_at, id, name }`) and is minted in
 * creation order here.
 *
 * `list()` deliberately returns the audiences in REVERSE creation order. The
 * real API promises no order at all, and if the fake echoed creation order then
 * "the oldest" and "whatever Resend listed first" would be indistinguishable —
 * a test that cannot tell the difference cannot prove the code picked on
 * purpose.
 *
 * There is deliberately NO `update`/rename here, because the real `audiences`
 * resource (class `Segments`) has none — see the header of `audience.ts`. That
 * absence is the whole reason a title edit cannot be followed by a rename on
 * Resend's side.
 */
function fakeAccount() {
  const audiences: { id: string; name: string; created_at: string }[] = []
  const contactsByAudience = new Map<string, { email: string }[]>()
  let n = 0
  let contactsListError: string | null = null

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
      list: async () => ({
        data: { data: [...audiences].reverse(), has_more: false },
        error: null,
      }),
      create,
    },
    contacts: {
      /**
       * PAGINATED LIKE THE REAL ONE. `PaginationOptions` in `resend@6.18.1`
       * documents `limit` as "1-100, default: 20", and `buildPaginationQuery`
       * sends nothing when it is undefined — so a caller that omits `limit`
       * really does see at most 20 contacts, and `has_more` really is the only
       * signal that there are more. A fake with unbounded pages would let a
       * saturating count look decisive.
       */
      list: vi.fn(
        async ({
          audienceId,
          limit,
        }: {
          audienceId: string
          limit?: number
        }) => {
          if (contactsListError) {
            return { data: null, error: { message: contactsListError } }
          }
          const all = contactsByAudience.get(audienceId) ?? []
          const page = Math.min(limit ?? 20, 100)
          return {
            data: { data: all.slice(0, page), has_more: all.length > page },
            error: null,
          }
        },
      ),
    },
  }

  return {
    client: client as unknown as Resend,
    audiences,
    create,
    contactsList: client.contacts.list,
    /** Put `count` contacts in an audience, as a sync or an event handler would. */
    fill: (audienceId: string, count: number) =>
      contactsByAudience.set(
        audienceId,
        Array.from({ length: count }, (_, i) => ({
          email: `contact-${i}@${audienceId}.test`,
        })),
      ),
    breakContactsList: (message: string) => {
      contactsListError = message
    },
    /** Break the contacts list for ONE audience — a 429 hits one call, not all. */
    breakContactsListFor: (audienceId: string) => {
      const inner = client.contacts.list.getMockImplementation()!
      client.contacts.list.mockImplementation(async (options) =>
        options.audienceId === audienceId
          ? { data: null, error: { message: 'Too many requests' } }
          : inner(options),
      )
    },
  }
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
    // Mangled: the key is no longer at the END of the name. The `$` anchor is
    // what rejects this, and rejecting it is the point — see the cross-tenant
    // case below.
    const mangled = await account.create({
      name: 'CNDN Speakers [conf-tenant-a] (do not delete)',
    })
    const keptTheKey = await account.create({
      name: 'CNDN — the speaker list, do not delete Speakers [conf-tenant-a]',
    })

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Cloud Native Days Norway 2027'),
      'speakers',
    )

    // The one that kept the `<Type> [id]` key at the end is adopted; the one
    // that moved it is not, even though it also mentions the id.
    expect(audienceId).toBe(keptTheKey.data.id)
    expect(audienceId).not.toBe(mangled.data.id)
    expect(account.audiences).toHaveLength(2)
  })

  it.each([
    ['a trailing space', 'Renamed By Hand Speakers [conf-tenant-a] '],
    [
      'a double space before the type',
      'Renamed By Hand  Speakers [conf-tenant-a]',
    ],
    [
      'a double space after the type',
      'Renamed By Hand Speakers  [conf-tenant-a]',
    ],
    ['a trailing newline', 'Renamed By Hand Speakers [conf-tenant-a]\n'],
  ])(
    'tolerates a cosmetic dashboard edit that kept the key: %s',
    async (_label, name) => {
      // The contract offered to a human is "keep the `<Type> [<id>]` tail and
      // you keep the audience". A stray space has kept it, and treating that as
      // a miss would empty the next broadcast.
      const renamedByHand = await account.create({ name })

      const { audienceId } = await getOrCreateConferenceAudienceByType(
        conference('conf-tenant-a', 'Cloud Native Days Norway 2027'),
        'speakers',
      )

      expect(audienceId).toBe(renamedByHand.data.id)
      expect(account.audiences).toHaveLength(1)
    },
  )
})

/**
 * THE KEY IS ANCHORED AT THE END OF THE NAME, AND THAT IS A TENANCY GUARD.
 *
 * A conference title is free text, so a tenant can title its conference
 * `"Alpha Speakers [conf-a]"`. Its OWN sponsors audience is then written as
 * `"Alpha Speakers [conf-a] Sponsors [conf-b]"` — a name containing another
 * conference's speakers key. Without the `$` anchor that name parses as
 * `conf-a`/speakers, and conference A adopts tenant B's sponsors audience: the
 * #886 cross-tenant merge, reachable from a title alone.
 */
describe('an audience key hidden inside a title cannot be claimed (#889)', () => {
  it('does not let a title that embeds another conference key hijack it', async () => {
    // Tenant B, titled to look like tenant A's speakers audience.
    const b = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-b', 'Alpha Speakers [conf-tenant-a]'),
      'sponsors',
    )
    expect(account.audiences[0].name).toBe(
      'Alpha Speakers [conf-tenant-a] Sponsors [conf-tenant-b]',
    )

    // Conference A now asks for its speakers audience. Tenant B's audience is
    // the only thing on the account whose name contains A's key.
    const a = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Alpha'),
      'speakers',
    )

    expect(a.audienceId).not.toBe(b.audienceId)
    expect(account.audiences).toHaveLength(2)
    expect(account.audiences[1].name).toBe('Alpha Speakers [conf-tenant-a]')
  })

  it.each([
    ['a title that is itself a key', 'Sponsors [conf-tenant-b]'],
    ['a title ending in a bracket', 'Alpha [2027]'],
    ['a title with brackets inside', 'Alpha [beta] Gamma'],
    ['a title with a trailing space', 'Alpha '],
    ['a title with regex metacharacters', 'Alpha (.*)+ [x]|y'],
    ['a unicode title', 'Ålpha — Ædition ✨'],
    ['an empty title', ''],
  ])(
    'round-trips a name it wrote back to the same audience: %s',
    async (_label, title) => {
      const conf = conference('conf-tenant-a', title)
      const first = await getOrCreateConferenceAudienceByType(conf, 'speakers')
      const again = await getOrCreateConferenceAudienceByType(conf, 'speakers')

      // Whatever the writer produced, the matcher must find it again — otherwise
      // every call mints another audience and the broadcast goes to an empty one.
      expect(again.audienceId).toBe(first.audienceId)
      expect(account.audiences).toHaveLength(1)
    },
  )
})

/**
 * WHICH OF SEVERAL AUDIENCES SHARING A KEY IS THE LIVE ONE.
 *
 * An account can already hold the original plus the empty one a pre-#889 rename
 * minted. Age does not settle it: after a rename under the old code the NEW
 * audience is the one every incremental add/remove went to, and a full sync
 * would have filled it and frozen the old one. So the code counts contacts, and
 * only falls back to age when counting cannot separate them.
 *
 * `list()` returns reverse creation order throughout, so nothing below can pass
 * by accidentally agreeing with the order Resend listed.
 */
describe('duplicate audiences under one key are resolved by contacts, not age (#889)', () => {
  it('takes the fuller audience even when it is the newer one', async () => {
    const original = await account.create({
      name: 'Working Title Speakers [conf-tenant-a]',
    })
    const afterRename = await account.create({
      name: 'Final Title Speakers [conf-tenant-a]',
    })
    // The rename happened a while ago: syncing has been filling the new one.
    account.fill(original.data.id, 2)
    account.fill(afterRename.data.id, 40)

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Final Title'),
      'speakers',
    )

    expect(audienceId).toBe(afterRename.data.id)
    expect(account.audiences).toHaveLength(2)
  })

  it('takes the fuller audience when it is the older one', async () => {
    const original = await account.create({
      name: 'Working Title Speakers [conf-tenant-a]',
    })
    const emptyOrphan = await account.create({
      name: 'Final Title Speakers [conf-tenant-a]',
    })
    // The rename just happened: the new one is still empty.
    account.fill(original.data.id, 37)

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Final Title'),
      'speakers',
    )

    // Note this is also the EXACT-NAME match losing to the key match.
    expect(audienceId).toBe(original.data.id)
    expect(audienceId).not.toBe(emptyOrphan.data.id)
  })

  it('falls back to the oldest when the counts cannot separate them', async () => {
    const older = await account.create({
      name: 'Working Title Speakers [conf-tenant-a]',
    })
    const newer = await account.create({
      name: 'Final Title Speakers [conf-tenant-a]',
    })
    account.fill(older.data.id, 5)
    account.fill(newer.data.id, 5)

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Final Title'),
      'speakers',
    )

    expect(audienceId).toBe(older.data.id)
    expect(audienceId).not.toBe(newer.data.id)
  })

  it('falls back to the oldest when the contacts cannot be counted at all', async () => {
    const older = await account.create({
      name: 'Working Title Speakers [conf-tenant-a]',
    })
    const newer = await account.create({
      name: 'Final Title Speakers [conf-tenant-a]',
    })
    account.fill(newer.data.id, 99)
    // Whatever the counts would have said, the account will not say it.
    account.breakContactsList('Something went wrong')

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Final Title'),
      'speakers',
    )

    // Deterministic, and never an error or a fresh empty audience.
    expect(audienceId).toBe(older.data.id)
    expect(account.audiences).toHaveLength(2)
  })

  it('does not count contacts at all when there is nothing to disambiguate', async () => {
    const conf = conference('conf-tenant-a', 'Alpha')
    const first = await getOrCreateConferenceAudienceByType(conf, 'speakers')
    const second = await getOrCreateConferenceAudienceByType(conf, 'speakers')

    expect(second.audienceId).toBe(first.audienceId)
    // Asserted on the CALL, not on the absence of an error: a resolver that
    // counted unconditionally would still return the right id here, and would
    // put a contacts.list on every audience resolution in the codebase.
    expect(account.contactsList).not.toHaveBeenCalled()
  })

  it('counts once per duplicate, and asks for a page bigger than the default 20', async () => {
    const older = await account.create({
      name: 'Working Title Speakers [conf-tenant-a]',
    })
    const newer = await account.create({
      name: 'Final Title Speakers [conf-tenant-a]',
    })
    account.fill(older.data.id, 25)
    account.fill(newer.data.id, 300)

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Final Title'),
      'speakers',
    )

    // 25 vs 300 is only visible if the count is not capped at the API default
    // of 20 — at that default both come back as 20 and tie into "oldest wins",
    // handing the broadcast to the stale audience.
    expect(audienceId).toBe(newer.data.id)
    expect(account.contactsList).toHaveBeenCalledTimes(2)
    for (const call of account.contactsList.mock.calls) {
      expect(call[0].limit).toBeGreaterThan(20)
    }
  })

  it('refuses to conclude when ONE count fails, rather than taking the empty one', async () => {
    const full = await account.create({
      name: 'Working Title Speakers [conf-tenant-a]',
    })
    const empty = await account.create({
      name: 'Final Title Speakers [conf-tenant-a]',
    })
    account.fill(full.data.id, 500)
    // A 429 hits one call, not the whole account: `contacts.list` returns
    // `{ data: null, error }` for a non-2xx rather than throwing, so
    // retryWithBackoff does not retry it.
    account.breakContactsListFor(full.data.id)

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Final Title'),
      'speakers',
    )

    // An unknown count is not a small one. Treating it as one would send the
    // next broadcast to the empty orphan and report success.
    expect(audienceId).toBe(full.data.id)
    expect(audienceId).not.toBe(empty.data.id)
  })

  it('falls back to the oldest when both counts are capped by pagination', async () => {
    const older = await account.create({
      name: 'Working Title Speakers [conf-tenant-a]',
    })
    const newer = await account.create({
      name: 'Final Title Speakers [conf-tenant-a]',
    })
    // Both past the biggest page the API will serve: the counts come back equal
    // and flagged `has_more`, so the comparison cannot separate them.
    account.fill(older.data.id, 140)
    account.fill(newer.data.id, 900)

    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference('conf-tenant-a', 'Final Title'),
      'speakers',
    )

    expect(audienceId).toBe(older.data.id)
  })
})
