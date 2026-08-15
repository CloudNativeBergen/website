/**
 * ONE FAKE RESEND ACCOUNT, SHARED BY EVERY AUDIENCE TEST.
 *
 * It lives here rather than inside a test file because a fake that cannot
 * reproduce the API's pagination cannot show a pagination bug — and that is not
 * hypothetical. Before #893 this fake's `audiences.list` returned everything in
 * one unbounded page with `has_more: false`, which made the unpaginated caller
 * look correct; before #895 its `contacts.list` honoured `limit` but IGNORED
 * `after`, so it could truncate but could not page, and a caller that paged
 * would have looped on page one forever. Both are the defect wearing the test
 * double's clothes. Keeping ONE account means neither list can regress to a
 * shape that hides the other.
 *
 * It is a real object with real state: audiences created against it persist for
 * the duration of a test, contacts removed from it are gone. So assertions are
 * about WHICH audience id came back, WHO is still in an audience afterwards, and
 * HOW MANY audiences exist — not about a string a helper computed.
 *
 * THE CONTRACT IT IMITATES, verified against the installed `resend@6.18.1`
 * rather than the docs (`node -e` against this repo's `node_modules`):
 *
 * ```
 * async list(options = {}) {                       // audiences (class Segments)
 *   const queryString = buildPaginationQuery(options);
 *   const url = queryString ? `/segments?${queryString}` : "/segments";
 * }
 * async list(options = {}) {                       // contacts
 *   const segmentId = options.segmentId ?? options.audienceId;
 *   ...
 *   const url = queryString ? `/segments/${segmentId}/contacts?${queryString}` : ...;
 * }
 * function buildPaginationQuery(options) {
 *   if (options.limit !== void 0) searchParams.set("limit", options.limit.toString());
 *   if ("after" in options && options.after !== void 0) searchParams.set("after", options.after);
 *   if ("before" in options && options.before !== void 0) searchParams.set("before", options.before);
 * }
 * ```
 *
 * Both lists therefore go through the SAME `buildPaginationQuery`, so they
 * paginate identically: `PaginationOptions = { limit?: 1-100, default 20 } &
 * ({ after?: string } | { before?: string })`, cursor rather than offset, and
 * `has_more` as the only signal that anything is behind the page.
 * `ListContactsResponseSuccess = { object, data: Contact[], has_more }` with
 * `Contact = { created_at, id, email, first_name, last_name, unsubscribed }`,
 * and `ListSegmentsResponseSuccess = { object, data: Segment[], has_more }` with
 * `Segment = { created_at, id, name }`.
 *
 * There is deliberately NO `audiences.update`/rename here, because the real
 * `Segments` resource has none — create / list / get / remove. That absence is
 * the whole reason a title edit cannot be followed by a rename on Resend's side.
 */

import { vi } from 'vitest'
import type { Resend } from 'resend'

interface FakeAudience {
  id: string
  name: string
  created_at: string
}

interface FakeContact {
  id: string
  email: string
}

/** The faults a real server can present on a paginated list. */
interface ListFaults {
  /** Fail the call — optionally only from the Nth call onwards. */
  error: string | null
  errorFromCall: number | null
  /** Stop honouring `after` while still claiming `has_more`. */
  ignoreCursor: boolean
  /** Answer without `has_more` at all. */
  omitHasMore: boolean
  /** Never run out: every page full, cursor honoured, always more. */
  endless: boolean
  /** Answer with neither an error nor a payload. */
  emptyPayload: boolean
  calls: number
}

const noFaults = (): ListFaults => ({
  error: null,
  errorFromCall: null,
  ignoreCursor: false,
  omitHasMore: false,
  endless: false,
  emptyPayload: false,
  calls: 0,
})

/**
 * One page of a cursor-paginated list, with every fault the real server can
 * present applied in the same order for audiences and for contacts. Shared so
 * the two lists cannot drift into behaving differently under test.
 */
function paginate<T extends { id: string }>(
  items: T[],
  options: { limit?: number; after?: string },
  faults: ListFaults,
  endlessItem: (index: number) => T,
) {
  faults.calls++

  if (
    faults.error &&
    (faults.errorFromCall === null || faults.calls >= faults.errorFromCall)
  ) {
    return { data: null, error: { message: faults.error } }
  }

  if (faults.emptyPayload) {
    // Neither an error nor a payload. `Response<T>` says this cannot happen,
    // which is exactly why it must not be read as "empty".
    return { data: null, error: null }
  }

  // The server default is 20 and the documented maximum is 100. A caller that
  // omits `limit` really does see at most 20 — that default is the bug.
  const page = Math.min(options.limit ?? 20, 100)

  if (faults.endless) {
    const start = options.after
      ? Number(String(options.after).replace(/^.*?(\d+)$/, '$1')) + 1
      : 0
    return {
      data: {
        data: Array.from({ length: page }, (_, i) => endlessItem(start + i)),
        has_more: true,
      },
      error: null,
    }
  }

  const cursorAt =
    options.after !== undefined && !faults.ignoreCursor
      ? items.findIndex((item) => item.id === options.after)
      : -1
  const start = cursorAt >= 0 ? cursorAt + 1 : 0
  const slice = items.slice(start, start + page)
  const hasMore = items.length > start + page

  if (faults.omitHasMore) {
    // `PaginatedData` types `has_more` as required, so this is the defensive
    // case: the only remaining signal that a page might be truncated is that it
    // came back exactly full.
    return { data: { data: slice }, error: null }
  }

  return {
    data: { data: slice, has_more: faults.ignoreCursor ? true : hasMore },
    error: null,
  }
}

/**
 * One Resend account, holding audiences by name. `create` does NOT dedupe by
 * name — the real API does not either, which is exactly why a title collision
 * used to resolve to a shared id rather than erroring.
 *
 * `created_at` is minted in creation order, and `audiences.list` deliberately
 * returns audiences in REVERSE creation order. The real API promises no order at
 * all, and if the fake echoed creation order then "the oldest" and "whatever
 * Resend listed first" would be indistinguishable — a test that cannot tell the
 * difference cannot prove the code picked on purpose.
 */
export function fakeAccount() {
  const audiences: FakeAudience[] = []
  const contactsByAudience = new Map<string, FakeContact[]>()
  let n = 0
  let contactN = 0

  const audienceFaults = noFaults()
  const contactFaults = noFaults()

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
      list: vi.fn(async (options: { limit?: number; after?: string } = {}) =>
        paginate([...audiences].reverse(), options, audienceFaults, (i) => ({
          id: `endless-${i}`,
          name: `Endless ${i} Speakers [conf-endless-${i}]`,
          created_at: new Date(Date.UTC(2026, 0, 1)).toISOString(),
        })),
      ),
      create,
    },
    contacts: {
      list: vi.fn(
        async ({
          audienceId,
          limit,
          after,
        }: {
          audienceId: string
          limit?: number
          after?: string
        }) =>
          paginate(
            contactsByAudience.get(audienceId) ?? [],
            { limit, after },
            contactFaults,
            (i) => ({
              id: `endless-contact-${i}`,
              email: `endless-${i}@example.test`,
            }),
          ),
      ),
      create: vi.fn(
        async ({
          audienceId,
          email,
        }: {
          audienceId: string
          email: string
        }) => {
          const contacts = contactsByAudience.get(audienceId) ?? []
          if (contacts.some((contact) => contact.email === email)) {
            // What the real API answers, and what `addContactToAudience`
            // deliberately treats as success.
            return { data: null, error: { message: 'Contact already exists' } }
          }
          const contact = { id: `${audienceId}-c${++contactN}`, email }
          contacts.push(contact)
          contactsByAudience.set(audienceId, contacts)
          return { data: { object: 'contact', id: contact.id }, error: null }
        },
      ),
      /**
       * Removal is BY ID, addressed by audience — `contacts.remove({
       * audienceId, id })` in the real client deletes
       * `/audiences/<audienceId>/contacts/<id>`. Removing an id that is not
       * there is an error rather than a silent success, so a caller that
       * removes the wrong thing cannot pass unnoticed.
       */
      remove: vi.fn(
        async ({ audienceId, id }: { audienceId: string; id: string }) => {
          const contacts = contactsByAudience.get(audienceId) ?? []
          const index = contacts.findIndex((contact) => contact.id === id)
          if (index === -1) {
            return { data: null, error: { message: 'Contact not found' } }
          }
          const [removed] = contacts.splice(index, 1)
          return {
            data: { object: 'contact', deleted: true, contact: removed.id },
            error: null,
          }
        },
      ),
    },
  }

  const putContacts = (audienceId: string, emails: string[]) => {
    contactsByAudience.set(
      audienceId,
      emails.map((email) => ({ id: `${audienceId}-c${++contactN}`, email })),
    )
  }

  return {
    client: client as unknown as Resend,
    audiences,
    create,
    contactsList: client.contacts.list,
    contactsCreate: client.contacts.create,
    contactsRemove: client.contacts.remove,
    audiencesList: client.audiences.list,
    /** Create `count` filler audiences, as other conferences on the account would. */
    fillAccount: async (count: number, prefix = 'Other') => {
      for (let i = 0; i < count; i++) {
        await create({ name: `${prefix} ${i} Speakers [conf-other-${i}]` })
      }
    },
    /** The server stops honouring `after` and keeps claiming `has_more`. */
    breakCursor: () => {
      audienceFaults.ignoreCursor = true
    },
    /** The server answers without `has_more` at all. */
    dropHasMore: () => {
      audienceFaults.omitHasMore = true
    },
    /** An account with more audiences than any loop will ever page through. */
    makeEndless: () => {
      audienceFaults.endless = true
    },
    /** Answer with neither an error nor a payload. */
    dropPayload: () => {
      audienceFaults.emptyPayload = true
    },
    /** Fail `audiences.list` — optionally only from the Nth call onwards. */
    breakAudiencesList: (message: string, fromCall?: number) => {
      audienceFaults.error = message
      audienceFaults.errorFromCall = fromCall ?? null
    },
    /** Put `count` contacts in an audience, as a sync or an event handler would. */
    fill: (audienceId: string, count: number) =>
      putContacts(
        audienceId,
        Array.from(
          { length: count },
          (_, i) => `contact-${i}@${audienceId}.test`,
        ),
      ),
    /** Put exactly these emails in an audience, in this order. */
    fillWith: putContacts,
    /** Who is actually in the audience right now. */
    contactsIn: (audienceId: string) =>
      (contactsByAudience.get(audienceId) ?? []).map((c) => c.email),
    /** The ids, in listing order — what a cursor has to be built from. */
    contactIdsIn: (audienceId: string) =>
      (contactsByAudience.get(audienceId) ?? []).map((c) => c.id),
    breakContactsList: (message: string, fromCall?: number) => {
      contactFaults.error = message
      contactFaults.errorFromCall = fromCall ?? null
    },
    /** The server stops honouring `after` on CONTACTS while claiming `has_more`. */
    breakContactCursor: () => {
      contactFaults.ignoreCursor = true
    },
    /** `contacts.list` answers without `has_more` at all. */
    dropContactHasMore: () => {
      contactFaults.omitHasMore = true
    },
    /** An audience with more contacts than any loop will ever page through. */
    makeContactsEndless: () => {
      contactFaults.endless = true
    },
    /** `contacts.list` answers with neither an error nor a payload. */
    dropContactPayload: () => {
      contactFaults.emptyPayload = true
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

export type FakeAccount = ReturnType<typeof fakeAccount>
