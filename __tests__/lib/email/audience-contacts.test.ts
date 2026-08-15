/**
 * @vitest-environment node
 *
 * CONTACTS.LIST IS PAGINATED, AND A REMOVAL THAT READS ONE PAGE DOES NOT REMOVE (#895).
 *
 * `contacts.list` was called as `list({ audienceId })` — no `limit`, no cursor.
 * `PaginationOptions` in `resend@6.18.1` documents `limit` as "1-100, default:
 * 20", so that call sees AT MOST TWENTY CONTACTS. On any audience holding more
 * than twenty:
 *
 *  - `removeContactFromAudience` looks the target up in those twenty, does not
 *    find it, and returns `{ success: true }` HAVING REMOVED NOTHING. Someone
 *    asks to come off a speaker or sponsor list, the request reports success,
 *    and they keep receiving mail. That is the failure this file exists for.
 *  - `syncAudienceWithContacts` reconciles against those twenty, so every
 *    contact past them is invisible to the reconciliation and is never removed.
 *
 * Every assertion below is on WHO IS ACTUALLY IN THE AUDIENCE afterwards, or on
 * an error VALUE — never on an absence, and never on a count the code under test
 * reported about itself.
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
import type { Conference } from '@/lib/conference/types'
import {
  removeContactFromAudience,
  syncAudienceWithContacts,
  ContactListTruncatedError,
  type Contact,
} from '@/lib/email/audience'
import { fakeAccount, type FakeAccount } from './fakeResendAccount'

const CONF_ID = 'conf-tenant-a'
const conference = { _id: CONF_ID, title: 'Alpha' } as Conference

/** The page size the paginating implementation asks for: the documented maximum. */
const PAGE = 100

let account: FakeAccount

beforeEach(() => {
  vi.clearAllMocks()
  account = fakeAccount()
  h.resolveEmailSender.mockResolvedValue({ client: account.client })
})

/** The conference's own audience, already resolvable by key. */
async function liveAudience() {
  const created = await account.create({
    name: `Alpha Speakers [${CONF_ID}]`,
  })
  return created.data.id
}

const emails = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => `speaker-${from + i}@example.test`)

const asContacts = (list: string[]): Contact[] =>
  list.map((email) => ({ email, firstName: 'A', lastName: 'B' }))

describe('a removal must find the contact wherever it is (#895)', () => {
  it('removes a contact sitting BEYOND the default first page of 20', async () => {
    // THE DECISIVE TEST. Thirty contacts, the one asking to be removed at index
    // 25 — inside the audience, outside the twenty an unpaginated `list()` sees.
    const audienceId = await liveAudience()
    const roster = emails(30)
    roster[25] = 'unsubscribe-me@example.test'
    account.fillWith(audienceId, roster)

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'unsubscribe-me@example.test',
    )

    expect(error).toBeUndefined()
    expect(success).toBe(true)
    // The defect, stated as state rather than as a return value: this used to
    // report success with the contact still in the audience.
    expect(account.contactsIn(audienceId)).not.toContain(
      'unsubscribe-me@example.test',
    )
    expect(account.contactsIn(audienceId)).toHaveLength(29)
    expect(account.contactsRemove).toHaveBeenCalledTimes(1)
  })

  it('follows the cursor to reach a contact beyond the FIRST FULL PAGE too', async () => {
    // Raising the limit to the maximum is not the fix: it only moves the cliff
    // to the hundredth contact. 250 contacts, the target at index 210.
    const audienceId = await liveAudience()
    const roster = emails(250)
    roster[210] = 'unsubscribe-me@example.test'
    account.fillWith(audienceId, roster)

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'unsubscribe-me@example.test',
    )

    expect(error).toBeUndefined()
    expect(success).toBe(true)
    expect(account.contactsIn(audienceId)).not.toContain(
      'unsubscribe-me@example.test',
    )
    expect(account.contactsIn(audienceId)).toHaveLength(249)
  })

  it('walks the cursor forward instead of re-reading the first page', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(250))
    const listed = account.contactIdsIn(audienceId)

    await removeContactFromAudience(
      account.client,
      audienceId,
      'speaker-249@example.test',
    )

    const calls = account.contactsList.mock.calls.map(([options]) => options)
    expect(calls).toHaveLength(3)
    // Page one carries no cursor — `toEqual` on the whole options object says so
    // — and every page asks for the documented maximum.
    expect(calls[0]).toEqual({ audienceId, limit: PAGE })
    expect(calls[1]).toEqual({ audienceId, limit: PAGE, after: listed[99] })
    expect(calls[2]).toEqual({ audienceId, limit: PAGE, after: listed[199] })
  })

  it('does not page at all when one page holds the whole audience', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(5))

    await removeContactFromAudience(
      account.client,
      audienceId,
      'speaker-2@example.test',
    )

    // The common case must not pay for the rare one.
    expect(account.contactsList).toHaveBeenCalledTimes(1)
    expect(account.contactsIn(audienceId)).toHaveLength(4)
  })

  it('reports success without removing anything when the contact is genuinely absent', async () => {
    // The other half of the rule: a COMPLETE listing that does not contain the
    // email means there is nothing to remove, and refusing there would be a
    // fabricated outage.
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(250))

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'never-joined@example.test',
    )

    expect(error).toBeUndefined()
    expect(success).toBe(true)
    expect(account.contactsRemove).not.toHaveBeenCalled()
    expect(account.contactsIn(audienceId)).toHaveLength(250)
  })

  it('fails loudly when the contact list cannot be read at all', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.breakContactsList('Too many requests')

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'speaker-25@example.test',
    )

    expect(success).toBe(false)
    expect(error?.message).toContain('Failed to list contacts')
    expect(account.contactsRemove).not.toHaveBeenCalled()
    expect(account.contactsIn(audienceId)).toHaveLength(30)
  })

  it('treats a failure on a LATER page as a failure, not as a short list', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(250))
    account.breakContactsList('Too many requests', 2)

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'speaker-210@example.test',
    )

    expect(success).toBe(false)
    expect(error?.message).toContain('Failed to list contacts')
    expect(account.contactsIn(audienceId)).toHaveLength(250)
  })
})

describe('a sync must reconcile against the WHOLE audience (#895)', () => {
  it('removes every contact that is no longer eligible, not just the first 20', async () => {
    // Thirty in the audience, five still eligible. Twenty-five must go — an
    // unpaginated sync removes only those of the first twenty that are stale,
    // and leaves everything past them subscribed.
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    const stillEligible = emails(5)

    const result = await syncAudienceWithContacts(
      conference,
      'speakers',
      asContacts(stillEligible),
    )

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    // The audience itself, not the count the sync reported about itself.
    expect(account.contactsIn(audienceId).sort()).toEqual(
      [...stillEligible].sort(),
    )
    expect(result.removedCount).toBe(25)
  })

  it('reconciles an audience larger than a single page', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(250))
    const stillEligible = [...emails(3), 'brand-new@example.test']

    const result = await syncAudienceWithContacts(
      conference,
      'speakers',
      asContacts(stillEligible),
    )

    expect(result.success).toBe(true)
    expect(account.contactsIn(audienceId).sort()).toEqual(
      [...stillEligible].sort(),
    )
    expect(result.removedCount).toBe(247)
    expect(result.addedCount).toBe(1)
  })

  it('does not re-list the audience once per removal', async () => {
    // The removal path resolves a contact by paging; a sync already HAS the
    // contact it is removing, so paging again per contact would make a 250-
    // contact sync quadratic in round-trips.
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(250))

    await syncAudienceWithContacts(conference, 'speakers', [])

    // Three pages for the reconciliation listing, and nothing more.
    expect(account.contactsList).toHaveBeenCalledTimes(3)
    expect(account.contactsRemove).toHaveBeenCalledTimes(250)
    expect(account.contactsIn(audienceId)).toHaveLength(0)
  })

  it('adds the contacts that are missing, wherever the existing ones sit', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))

    const result = await syncAudienceWithContacts(
      conference,
      'speakers',
      asContacts([...emails(30), 'newcomer@example.test']),
    )

    expect(result.success).toBe(true)
    expect(result.addedCount).toBe(1)
    expect(result.removedCount).toBe(0)
    expect(account.contactsIn(audienceId)).toContain('newcomer@example.test')
    expect(account.contactsIn(audienceId)).toHaveLength(31)
  })
})

/**
 * A CONTACT NOT SEEN IS NOT A CONTACT ABSENT (#895).
 *
 * The same asymmetry #893 established for audiences, one level down. "Not in the
 * list" only means "not in the audience" when the list was exhaustive; on a
 * truncated one it means nothing at all, and answering `success` is how an
 * unsubscribe request comes to report done while the person stays subscribed.
 *
 * Every assertion below is on the audience NOT having changed and on the error
 * VALUE — never on an absence.
 */
describe('a truncated contact list refuses to conclude (#895)', () => {
  it('refuses the removal when the cursor stops making progress', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.breakContactCursor()

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'never-listed@example.test',
    )

    expect(success).toBe(false)
    expect(error).toBeInstanceOf(ContactListTruncatedError)
    expect(error?.message).toContain('incomplete contact list')
    expect((error as ContactListTruncatedError).stoppedBecause).toBe(
      'no-progress',
    )
    // Nothing was touched, and — the point — nothing was reported as done.
    expect(account.contactsRemove).not.toHaveBeenCalled()
    expect(account.contactsIn(audienceId)).toHaveLength(30)
  })

  it('refuses on a page that came back exactly full without has_more', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(100))
    account.dropContactHasMore()

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'never-listed@example.test',
    )

    expect(success).toBe(false)
    expect((error as ContactListTruncatedError).stoppedBecause).toBe(
      'full-page-without-has-more',
    )
    expect(account.contactsIn(audienceId)).toHaveLength(100)
  })

  it('accepts a SHORT page with no has_more, because a short page hides nothing', async () => {
    // The mirror case: refusing here would be a fabricated outage on every
    // audience whose size happens to sit under a page.
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(99))
    account.dropContactHasMore()

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'speaker-90@example.test',
    )

    expect(error).toBeUndefined()
    expect(success).toBe(true)
    expect(account.contactsIn(audienceId)).toHaveLength(98)
  })

  it('does not read a response with no payload as an empty audience', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.dropContactPayload()

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'speaker-25@example.test',
    )

    expect(success).toBe(false)
    expect((error as ContactListTruncatedError).stoppedBecause).toBe(
      'no-payload',
    )
    expect(account.contactsIn(audienceId)).toHaveLength(30)
  })

  it('stops at the page cap rather than looping forever, and refuses', async () => {
    const audienceId = await liveAudience()
    account.makeContactsEndless()

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'never-listed@example.test',
    )

    expect(account.contactsList).toHaveBeenCalledTimes(100)
    expect(success).toBe(false)
    expect((error as ContactListTruncatedError).stoppedBecause).toBe('page-cap')
    expect(account.contactsRemove).not.toHaveBeenCalled()
  })

  it('does NOT refuse when the truncated listing still found the contact', async () => {
    // The refusal belongs at the MISS, not at the lookup. A contact that was
    // seen is removed whatever the rest of the audience is doing — refusing here
    // would break every removal on a large audience instead of protecting one.
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.breakContactCursor()

    const { success, error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'speaker-25@example.test',
    )

    expect(error).toBeUndefined()
    expect(success).toBe(true)
    expect(account.contactsIn(audienceId)).not.toContain(
      'speaker-25@example.test',
    )
    expect(account.contactsIn(audienceId)).toHaveLength(29)
  })

  it('logs the refusal exactly ONCE, naming the outstanding consequence', async () => {
    // `handleAudienceUpdate` has nobody to return an error to, so for a
    // background removal this log IS the whole operator signal. A refusal
    // printed twice in two formats is how a channel stops being read — and a
    // line that says only "refused" leaves the reader to work out that somebody
    // is still on a list they asked to leave.
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.breakContactCursor()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await removeContactFromAudience(
      account.client,
      audienceId,
      'unsubscribe-me@example.test',
    )

    const lines = errors.mock.calls.map(([first]) => String(first))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('REFUSED')
    expect(lines[0]).toContain('unsubscribe-me@example.test')
    expect(lines[0]).toContain('STILL SUBSCRIBED')
    errors.mockRestore()
  })

  it('still names the contact when an ordinary removal failure is logged', async () => {
    // The other half of the Copilot note: a non-refusal failure used to log
    // without the email or the `[Audience]` prefix, which made it ambiguous.
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.breakContactsList('Boom')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await removeContactFromAudience(
      account.client,
      audienceId,
      'speaker-25@example.test',
    )

    const removalLines = errors.mock.calls.filter(([first]) =>
      String(first).includes('Failed to remove contact from audience'),
    )
    expect(removalLines).toHaveLength(1)
    expect(String(removalLines[0][0])).toContain('[Audience]')
    expect(removalLines[0][1]).toMatchObject({
      audienceId,
      email: 'speaker-25@example.test',
    })
    errors.mockRestore()
  })

  it('names the contact, the audience and the reason, so an operator can act', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.breakContactCursor()

    const { error } = await removeContactFromAudience(
      account.client,
      audienceId,
      'unsubscribe-me@example.test',
    )

    expect(error?.message).toContain('unsubscribe-me@example.test')
    expect(error?.message).toContain(audienceId)
    expect(error?.message).toContain('no-progress')
    expect(error?.message).toContain('still subscribed')
  })
})

describe('a sync refuses to reconcile against a partial roster (#895)', () => {
  it('refuses before adding or removing anything', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.breakContactCursor()

    const result = await syncAudienceWithContacts(
      conference,
      'speakers',
      asContacts(['someone-else@example.test']),
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeInstanceOf(ContactListTruncatedError)
    expect((result.error as ContactListTruncatedError).stoppedBecause).toBe(
      'no-progress',
    )
    // A HALF-DONE sync is worse than none: it reports the count it managed
    // rather than the count it owed. Guard before write, both directions.
    expect(account.contactsCreate).not.toHaveBeenCalled()
    expect(account.contactsRemove).not.toHaveBeenCalled()
    expect(account.contactsIn(audienceId).sort()).toEqual(emails(30).sort())
  })

  it('reports zero synced rather than a partial number', async () => {
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.dropContactPayload()

    const result = await syncAudienceWithContacts(
      conference,
      'speakers',
      asContacts(emails(5)),
    )

    expect(result.success).toBe(false)
    expect(result.syncedCount).toBe(0)
    expect(result.addedCount).toBe(0)
    expect(result.removedCount).toBe(0)
    expect(result.audienceId).toBe('')
  })

  it('names the audience and the reason in the message an organizer is shown', async () => {
    // `speaker.ts` and `sponsor.ts` put this message straight into the TRPCError
    // an organizer sees when they press Sync.
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(30))
    account.breakContactCursor()

    const { error } = await syncAudienceWithContacts(conference, 'speakers', [])

    expect(error?.message).toContain(audienceId)
    expect(error?.message).toContain('incomplete contact list')
    expect(error?.message).toContain('no-progress')
    expect(error?.message).toContain('under-removes')
  })

  it('still reconciles a large audience that IS fully listed', async () => {
    // The guard must not turn a big audience into a broken one.
    const audienceId = await liveAudience()
    account.fillWith(audienceId, emails(500))

    const result = await syncAudienceWithContacts(
      conference,
      'speakers',
      asContacts(emails(2)),
    )

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(account.contactsIn(audienceId).sort()).toEqual(emails(2).sort())
  })
})
