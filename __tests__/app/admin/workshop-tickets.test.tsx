/**
 * @vitest-environment jsdom
 *
 * THE WORKSHOP-TICKET LIST, FROM THE PAGE TO THE PORTAL (#1332).
 *
 * One path, with our own code real at every step:
 *
 *   the section as /admin/workshops loads it (`LoadedWorkshopTickets`: the
 *   provider's ticket types, the stored answers read live)
 *     -> an organizer's click
 *     -> `tickets.admin.setWorkshopAccess`, called with what the click sent
 *     -> a real `@sanity/client` patch applied by Sanity's `@sanity/mutator`
 *     -> the portal's gate (`checkWorkshopEligibility`, real `workshopAccessOf`)
 *        reading that conference back.
 *
 * Mocked: the Sanity transport (an in-memory dataset behind real patches and
 * real GROQ), the ticketing provider's HTTP client, the organization read, and
 * the tRPC transport (the hook hands its input to the real procedure). So an
 * assertion here is on what the portal decides and what is stored, and none of
 * it can pass on a mock's say-so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  commits: 0,
  /** The provider's ticket types, or an error to throw. */
  types: [] as string[] | Error,
  tickets: [] as { category: string; crm: { email: string } }[],
  /** Saves the page has sent, so a test can wait for them. */
  saves: [] as Promise<unknown>[],
  save: null as null | ((input: unknown) => Promise<unknown>),
  /** The organization the request resolves to. */
  org: {} as Record<string, unknown>,
  /** Thrown while the ticketing provider is being resolved, when set. */
  resolveError: null as Error | null,
  refresh: vi.fn(),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const { parse, evaluate } = await import('groq-js')
  const { createRequire: req } = await import('node:module')
  const { Mutation } = req(req(import.meta.url).resolve('sanity/package.json'))(
    '@sanity/mutator',
  ) as {
    Mutation: new (o: { mutations: unknown[] }) => {
      apply: (d: unknown) => Record<string, unknown> | null
    }
  }
  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2024-01-01',
    useCdn: false,
  })
  const fetch = async (query: string, params: Record<string, unknown> = {}) =>
    (await evaluate(parse(query), { dataset: h.dataset, params })).get()

  return {
    clientRead: { fetch },
    clientReadCached: { fetch },
    clientReadUncached: { fetch },
    clientWrite: {
      fetch,
      patch: (id: string) => {
        const patch = client.patch(id)
        patch.commit = (async () => {
          const index = h.dataset.findIndex((d) => d._id === id)
          if (index === -1) throw new Error(`no such document: ${id}`)
          h.commits += 1
          const next = new Mutation({
            mutations: [{ patch: patch.serialize() }],
          }).apply(structuredClone(h.dataset[index]))
          if (next) h.dataset[index] = { ...next, _rev: `rev-${h.commits}` }
          return { _id: id }
        }) as typeof patch.commit
        return patch
      },
    },
  }
})

vi.mock('@/lib/tickets/provider/checkin', () => ({
  CheckinProvider: class {
    readonly name = 'Checkin.no'
    static canCallApi() {
      return true
    }
    constructor() {
      if (h.resolveError) throw h.resolveError
    }
    isConfigured() {
      return true
    }
    fetchEventTickets = async () => h.tickets
    fetchPublicTicketTypes = async () => {
      if (h.types instanceof Error) throw h.types
      return {
        event: { id: 1, name: 'Event', currencies: ['NOK'] },
        // Out of order on purpose: the page sorts by position.
        tickets: h.types
          .map((name, index) => ({ id: index, name, position: index }))
          .reverse(),
      }
    }
  },
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: async () => h.org,
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: CONFERENCE,
    domain: 'a.test',
    error: null,
  }),
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('@/lib/tickets/summary', () => ({ buildTicketSummary: vi.fn() }))
vi.mock('@/lib/email/from', () => ({
  platformFallbackContact: () => 'help@a.test',
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
// The real module, for `notFound` and `unstable_rethrow`; only the router hook
// (which needs a mounted app router) is replaced.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: h.refresh }),
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))
// THE TRANSPORT ONLY: the hook's `mutate` calls the real procedure.
vi.mock('@/lib/trpc/client', () => ({
  api: {
    tickets: {
      admin: {
        setWorkshopAccess: {
          useMutation: () => ({
            mutate: (input: unknown) => {
              h.saves.push(h.save!(input))
            },
            isPending: false,
          }),
        },
      },
    },
  },
}))

import { initTRPC } from '@trpc/server'
import type { Conference } from '@/lib/conference/types'
import type { Context } from '@/server/trpc'
import { ticketsRouter } from '@/server/routers/tickets'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'
import { checkWorkshopEligibility } from '@/lib/workshop/eligibility'
import { stubOwnTicketingSecret } from '../../helpers/ticketingSecrets'
import { LoadedWorkshopTickets } from '@/components/admin/workshop/tickets/WorkshopTickets'
import { TenantEnvSlugUnavailableError } from '@/lib/secrets/env-per-org'
import WorkshopAdminPage from '@/app/(admin)/admin/workshops/page'
import { notFound } from 'next/navigation'
import { prerender } from 'react-dom/static'

const ORG_A = 'org-A'
const CONF_A = 'conf-A'
const CONFERENCE = {
  _id: CONF_A,
  organization: { _ref: ORG_A, _type: 'reference' },
  checkinEventId: 4242,
  checkinCustomerId: 7,
} as unknown as Conference

const SPEAKER = 'Speaker ticket'
const TWO_DAY = 'Workshop + Conference (2 days)'

type Role = { typeName: string; admits?: boolean; grantsWorkshop?: boolean }

function seed(roles: Role[] | undefined, types: string[] | Error) {
  h.commits = 0
  h.resolveError = null
  h.org = { _id: ORG_A, name: 'Tenant A', slug: 'tenant-a', plan: 'pro' }
  h.saves = []
  h.types = types
  h.dataset = [
    {
      _id: CONF_A,
      _type: 'conference',
      _rev: 'rev-0',
      ...(roles && {
        ticketTypeRoles: roles.map((role, i) => ({ _key: `k${i}`, ...role })),
      }),
    },
  ]
}

/** `ticketTypeRoles` as Sanity holds it now, without the generated keys. */
const stored = () =>
  ((h.dataset[0].ticketTypeRoles ?? []) as (Role & { _key: string })[]).map(
    ({ _key, ...role }) => {
      void _key
      return role
    },
  )

/** Render the section the way /admin/workshops loads it. */
async function openSection(conference: Conference = CONFERENCE) {
  cleanup()
  render(await LoadedWorkshopTickets({ conference }))
}

/** Every save the page sent has reached Sanity (or been refused). */
async function saved() {
  await act(async () => {
    await Promise.allSettled(h.saves)
  })
}

/** The row of one ticket type: a group named after it. */
const row = (typeName: string) =>
  within(screen.getByRole('group', { name: typeName }))

/**
 * The answer shown for each listed type, in page order: each row's name and
 * its accessible description, which is how the row ties the two together.
 */
const answers = () =>
  screen
    .getAllByRole('group')
    .map((group) => [
      group.getAttribute('aria-label'),
      document.getElementById(group.getAttribute('aria-describedby')!)!
        .textContent,
    ])

/** The portal's decision for the one holder of one ticket type. */
async function gate(category: string) {
  __resetRedeemedCache()
  h.tickets = [{ category, crm: { email: 'ada@x.test' } }]
  return checkWorkshopEligibility({
    userEmail: 'ada@x.test',
    conference: CONFERENCE,
    contactEmail: 'help@a.test',
  })
}

beforeEach(() => {
  vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
  stubOwnTicketingSecret(ORG_A)
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  const caller = initTRPC
    .context<Context>()
    .create()
    .createCallerFactory(ticketsRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
  h.save = (input) =>
    caller.admin.setWorkshopAccess(
      input as Parameters<typeof caller.admin.setWorkshopAccess>[0],
    )
})

afterEach(async () => {
  // A case that fails mid-way can leave a save in flight. Let it land in ITS
  // dataset, so it cannot write into the next case's.
  await Promise.allSettled(h.saves)
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('a save from the section changes what the portal decides', () => {
  it('admits a holder of a type once it is marked there', async () => {
    seed(
      [{ typeName: 'Two-day pass', grantsWorkshop: true }],
      ['Two-day pass', 'Workshop 2026'],
    )
    const before = await gate('Workshop 2026')
    expect(before.isEligible).toBe(false)
    expect(before.reason).toContain('has not been set up for workshop access')

    await openSection()
    expect(answers()).toEqual([
      ['Two-day pass', 'Grants workshop access'],
      ['Workshop 2026', 'Not set'],
    ])
    fireEvent.click(
      row('Workshop 2026').getByRole('button', {
        name: /^Grants workshop access/,
      }),
    )
    await saved()

    expect((await gate('Workshop 2026')).isEligible).toBe(true)
    // And the page, loaded again, shows the answer the portal now gives.
    await openSection()
    expect(answers()).toEqual([
      ['Two-day pass', 'Grants workshop access'],
      ['Workshop 2026', 'Grants workshop access'],
    ])
  })

  it('refuses a holder with the upgrade text once their type is answered no', async () => {
    seed(
      [
        { typeName: 'Two-day pass', grantsWorkshop: true },
        { typeName: 'Day pass', grantsWorkshop: true },
      ],
      ['Two-day pass', 'Day pass'],
    )
    expect((await gate('Day pass')).isEligible).toBe(true)

    await openSection()
    fireEvent.click(
      row('Day pass').getByRole('button', { name: /^No workshop access/ }),
    )
    await saved()

    const after = await gate('Day pass')
    expect(after.isEligible).toBe(false)
    expect(after.reason).toBe(
      'No valid workshop ticket found. Please upgrade your ticket to include workshop access, or contact us at help@a.test if you believe this is an error.',
    )
  })
})

/**
 * THE RULE AGREES WITH THE PAGE. On a conference that has marked a type, an
 * entry that only answers the seating question is not a workshop answer: the
 * page shows "Not set" and the holder reads the text that names the missing
 * decision, where an explicit no shows "No workshop access" and the other text.
 */
describe('a type whose entry carries only a seating answer', () => {
  it('shows as not set, and its holder is told the decision is missing', async () => {
    seed(
      [
        { typeName: 'Two-day pass', grantsWorkshop: true },
        { typeName: 'Student', admits: true },
        { typeName: 'Day pass', admits: true, grantsWorkshop: false },
      ],
      ['Two-day pass', 'Student', 'Day pass'],
    )

    await openSection()
    expect(answers()).toEqual([
      ['Two-day pass', 'Grants workshop access'],
      ['Student', 'Not set'],
      ['Day pass', 'No workshop access'],
    ])
    expect(
      screen.getByRole('status', { name: 'Needs a decision' }),
    ).toHaveTextContent(
      '“Student” is not set. Its holders cannot sign up for workshops until you choose an answer below.',
    )

    expect((await gate('Student')).reason).toBe(
      'Your ticket type “Student” has not been set up for workshop access yet. This is a configuration gap on our side, not a problem with your ticket — please contact us at help@a.test so an organizer can mark which ticket types include workshop access.',
    )
    expect((await gate('Day pass')).reason).toBe(
      'No valid workshop ticket found. Please upgrade your ticket to include workshop access, or contact us at help@a.test if you believe this is an error.',
    )
  })
})

describe('marking the first type', () => {
  const TYPES = ['Early Bird', SPEAKER, TWO_DAY]
  const markFirst = async () => {
    seed(undefined, TYPES)
    await openSection()
    expect(answers()).toEqual([
      ['Early Bird', 'No workshop access (built-in list)'],
      [SPEAKER, 'Grants workshop access (built-in list)'],
      [TWO_DAY, 'Grants workshop access (built-in list)'],
    ])
    fireEvent.click(
      row('Early Bird').getByRole('button', {
        name: /^Grants workshop access/,
      }),
    )
    // The confirmation, before anything is written.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This is the first ticket type set to grant access.',
    )
    expect(h.commits).toBe(0)
  }

  it('keeps every previously granted type granted when they are carried over', async () => {
    await markFirst()
    fireEvent.click(
      screen.getByRole('button', { name: /^Grant “Early Bird”, keep/ }),
    )
    await saved()

    expect(h.commits).toBe(1)
    await openSection()
    expect(answers()).toEqual([
      ['Early Bird', 'Grants workshop access'],
      [SPEAKER, 'Grants workshop access'],
      [TWO_DAY, 'Grants workshop access'],
    ])
    expect((await gate(TWO_DAY)).isEligible).toBe(true)
    expect((await gate(SPEAKER)).isEligible).toBe(true)
  })

  it('leaves them not set when the organizer declines the carry-over', async () => {
    await markFirst()
    fireEvent.click(
      screen.getByRole('button', { name: /^Grant “Early Bird” only/ }),
    )
    await saved()

    await openSection()
    expect(answers()).toEqual([
      ['Early Bird', 'Grants workshop access'],
      [SPEAKER, 'Not set'],
      [TWO_DAY, 'Not set'],
    ])
    const refused = await gate(TWO_DAY)
    expect(refused.isEligible).toBe(false)
    expect(refused.reason).toContain('has not been set up for workshop access')
  })
})

/**
 * A CARRY-OVER NEVER OVERWRITES A STORED NO. The sequence the page now leads
 * to: a No for a type the built-in list lets in is saved on its own ("block
 * nothing yet"), and later another type is the first set to grant access, with
 * the carry-over. The earlier No must stand: it is what finally takes effect.
 */
describe('a No saved before any type grants access', () => {
  it('is not overwritten by a later carry-over, and then blocks its holders', async () => {
    seed(undefined, ['Early Bird', SPEAKER, TWO_DAY])

    await openSection()
    fireEvent.click(
      row(SPEAKER).getByRole('button', { name: /^No workshop access/ }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      `This No won’t block “${SPEAKER}” yet.`,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Save the No, block nothing yet' }),
    )
    await saved()
    expect(stored()).toEqual([{ typeName: SPEAKER, grantsWorkshop: false }])
    // Exactly as the question said: nothing is blocked yet.
    expect((await gate(SPEAKER)).isEligible).toBe(true)

    await openSection()
    fireEvent.click(
      row('Early Bird').getByRole('button', {
        name: /^Grants workshop access/,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Holders of “${TWO_DAY}” sign up through that list today, and are blocked unless that type is set to grant access in the same save. “${SPEAKER}” is already set to No, so its holders are blocked when the built-in list goes off.`,
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: `Grant “Early Bird”, keep “${TWO_DAY}”`,
      }),
    )
    await saved()

    expect(stored()).toEqual([
      { typeName: SPEAKER, grantsWorkshop: false },
      { typeName: 'Early Bird', grantsWorkshop: true },
      { typeName: TWO_DAY, grantsWorkshop: true },
    ])
    expect((await gate(SPEAKER)).isEligible).toBe(false)
    expect((await gate(TWO_DAY)).isEligible).toBe(true)
    expect((await gate('Early Bird')).isEligible).toBe(true)
  })
})

/**
 * THE FIRST GRANT SWITCHES THE BUILT-IN LIST OFF, AND THAT IS ALWAYS ASKED
 * ABOUT. Here every other type the list lets in already holds a No, so there
 * is nothing to keep: their holders sign up today and cannot after the save.
 */
describe('a first grant when the other built-in types hold a No', () => {
  const NOES = [
    { typeName: SPEAKER, grantsWorkshop: false },
    { typeName: TWO_DAY, grantsWorkshop: false },
  ]
  const lets = async () => ({
    [SPEAKER]: (await gate(SPEAKER)).isEligible,
    [TWO_DAY]: (await gate(TWO_DAY)).isEligible,
    'Early Bird': (await gate('Early Bird')).isEligible,
  })

  it('asks, writes nothing on cancel, and blocks them on confirm without touching their No', async () => {
    seed(NOES, ['Early Bird', SPEAKER, TWO_DAY])
    // The built-in list overrules the stored Noes today.
    expect(await lets()).toEqual({
      [SPEAKER]: true,
      [TWO_DAY]: true,
      'Early Bird': false,
    })

    await openSection()
    const grant = () =>
      fireEvent.click(
        row('Early Bird').getByRole('button', {
          name: /^Grants workshop access/,
        }),
      )
    grant()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Saving it switches the built-in list off. “${SPEAKER}” and “${TWO_DAY}” are already set to No, so their holders are blocked when the built-in list goes off.`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await saved()
    expect(h.commits).toBe(0)
    expect(stored()).toEqual(NOES)

    grant()
    fireEvent.click(screen.getByRole('button', { name: 'Grant “Early Bird”' }))
    await saved()

    expect(stored()).toEqual([
      ...NOES,
      { typeName: 'Early Bird', grantsWorkshop: true },
    ])
    expect(await lets()).toEqual({
      [SPEAKER]: false,
      [TWO_DAY]: false,
      'Early Bird': true,
    })
  })
})

/**
 * AN ORPHANED GRANT BEHIND ANOTHER SPELLING is listed, and its removal reaches
 * the spelling that holds it.
 */
describe('an orphaned grant held by a later spelling of a renamed type', () => {
  it('is listed and removed, and the built-in list then decides', async () => {
    seed(
      [
        { typeName: 'Workshop 2025', admits: true },
        { typeName: 'workshop 2025 ', grantsWorkshop: true },
      ],
      ['Workshop 2026', SPEAKER],
    )
    expect((await gate(SPEAKER)).isEligible).toBe(false)

    await openSection()
    expect(
      screen.getByRole('status', { name: 'Needs a decision' }),
    ).toHaveTextContent(
      '“Workshop 2025” is saved as granting workshop access, but Checkin.no lists no ticket type with that name.',
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove the entry for "Workshop 2025"',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove and use the built-in list' }),
    )
    await saved()

    expect(stored()).toEqual([{ typeName: 'Workshop 2025', admits: true }])
    expect((await gate(SPEAKER)).isEligible).toBe(true)
    await openSection()
    expect(screen.getByText('This list is not configured yet.')).toBeVisible()
  })
})

describe('losing the last granting type', () => {
  it('asks, writes nothing on cancel, and brings the built-in list back on confirm', async () => {
    seed(
      [{ typeName: 'Early Bird', admits: true, grantsWorkshop: true }],
      ['Early Bird', SPEAKER],
    )
    expect((await gate(SPEAKER)).isEligible).toBe(false)

    await openSection()
    const no = () =>
      fireEvent.click(
        row('Early Bird').getByRole('button', { name: /^No workshop access/ }),
      )
    no()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Holders of “${SPEAKER}” will be able to sign up for workshops, and nobody else.`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await saved()
    expect(h.commits).toBe(0)
    expect(stored()).toEqual([
      { typeName: 'Early Bird', admits: true, grantsWorkshop: true },
    ])

    no()
    fireEvent.click(
      screen.getByRole('button', { name: 'Save and use the built-in list' }),
    )
    await saved()

    expect(stored()).toEqual([
      { typeName: 'Early Bird', admits: true, grantsWorkshop: false },
    ])
    // The built-in list decides again, exactly as the question said.
    expect((await gate(SPEAKER)).isEligible).toBe(true)
    expect((await gate('Early Bird')).isEligible).toBe(false)
    await openSection()
    expect(screen.getByText('This list is not configured yet.')).toBeVisible()
  })

  it('asks before removing an orphaned entry that is the last one, and keeps its seating answer', async () => {
    seed(
      [
        { typeName: 'Workshop 2025', admits: false, grantsWorkshop: true },
        { typeName: 'Workshop 2026', grantsWorkshop: false },
      ],
      ['Workshop 2026', SPEAKER],
    )

    await openSection()
    const remove = () =>
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Remove the entry for "Workshop 2025"',
        }),
      )
    remove()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Holders of “${SPEAKER}” will be able to sign up for workshops, and nobody else.`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await saved()
    expect(h.commits).toBe(0)

    remove()
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove and use the built-in list' }),
    )
    await saved()

    expect(stored()).toEqual([
      { typeName: 'Workshop 2026', grantsWorkshop: false },
      { typeName: 'Workshop 2025', admits: false },
    ])
    expect((await gate(SPEAKER)).isEligible).toBe(true)
  })

  it('removes an orphaned entry without asking while another type grants', async () => {
    seed(
      [
        { typeName: 'Two-day pass', grantsWorkshop: true },
        { typeName: 'Workshop 2025', admits: true, grantsWorkshop: true },
      ],
      ['Two-day pass'],
    )

    await openSection()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove the entry for "Workshop 2025"',
      }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await saved()

    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
      { typeName: 'Workshop 2025', admits: true },
    ])
    await openSection()
    expect(
      screen.queryByRole('status', { name: 'Needs a decision' }),
    ).not.toBeInTheDocument()
  })
})

describe('a provider that cannot be read', () => {
  it('says so, offers no switch, and never lists the stored answers as orphaned', async () => {
    seed(
      [{ typeName: 'Two-day pass', grantsWorkshop: true }],
      new Error('checkin down'),
    )

    await openSection()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The ticket types could not be read from Checkin.no.',
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByText(/Two-day pass/)).not.toBeInTheDocument()
  })
})

/**
 * A PROVIDER THAT ANSWERS WITH NO TYPES is not a failed read, and it says
 * nothing about the stored answers. Compared against an empty list every one
 * of them would look orphaned, with a remove action and, for the last granting
 * one, the confirmation on top.
 */
describe('a provider that lists no ticket types', () => {
  it('says so, and offers neither a switch nor a removal for the stored answers', async () => {
    seed(
      [
        { typeName: 'Two-day pass', admits: true, grantsWorkshop: true },
        { typeName: 'Day pass', grantsWorkshop: false },
      ],
      [],
    )

    await openSection()

    expect(
      screen.getByText(
        'Checkin.no lists no ticket types for this event, so there is nothing to set here. Who can sign up has not changed.',
      ),
    ).toBeVisible()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByText(/Two-day pass|Day pass/)).not.toBeInTheDocument()
    // The read worked: this is not the unreadable state.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

/**
 * TICKETING THAT IS NOT READY IS NOT A FAILED READ. With workshops on and no
 * event bound, or ticketing switched off by an operator, reloading never
 * helps: the section says what /admin/tickets/types says, and offers no switch.
 */
describe('ticketing that is not ready', () => {
  it('points at the ticket settings when the conference is not bound to an event', async () => {
    seed([{ typeName: 'Two-day pass', grantsWorkshop: true }], ['Two-day pass'])

    await openSection({
      _id: CONF_A,
      organization: { _ref: ORG_A, _type: 'reference' },
    } as unknown as Conference)

    expect(screen.getByText('Ticketing is not connected yet')).toBeVisible()
    expect(
      screen.getByText(
        'Connect this conference to its Checkin.no event in the ticket settings and workshop tickets will show up here.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Open ticket settings' }),
    ).toHaveAttribute('href', '/admin/settings#tickets-registration')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
    // Still where the ticket-types page links to.
    expect(
      screen.getByRole('region', { name: 'Workshop tickets' }),
    ).toHaveAttribute('id', 'workshop-tickets')
  })

  it('says ticketing was turned off when an operator denied it', async () => {
    seed([{ typeName: 'Two-day pass', grantsWorkshop: true }], ['Two-day pass'])
    h.org = {
      ...h.org,
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    }

    await openSection()

    expect(
      screen.getByText('Ticketing has been turned off for your organization'),
    ).toBeVisible()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
  })
})

/**
 * THE SECTION FAILS ON ITS OWN. It streams inside /admin/workshops, and there
 * is no error boundary under `src/app`: an error that escaped here would take
 * the workshops, the sign-ups and the registration settings down with it.
 * Resolving the ticketing provider can throw (the per-organization credential
 * lookup refuses to guess, `TenantEnvSlugUnavailableError`); the error here is
 * thrown from the same call.
 */
describe('a failure while the section loads', () => {
  it('shows the unreadable state instead of throwing', async () => {
    seed([{ typeName: 'Two-day pass', grantsWorkshop: true }], ['Two-day pass'])
    h.resolveError = new TenantEnvSlugUnavailableError(ORG_A, 'test')

    await openSection()

    // It does not blame the ticketing provider for what may be our own fault.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This list could not be loaded.The list cannot be shown or changed right now. Who can sign up has not changed. Reload the page to try again.',
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('lets a signal of the framework through from the ticket-type read too', async () => {
    // That read has a catch of its own (a failed read names the provider), so
    // it needs its own way out for a signal.
    let signal: unknown
    try {
      notFound()
    } catch (error) {
      signal = error
    }
    seed([], signal as Error)

    await expect(
      LoadedWorkshopTickets({ conference: CONFERENCE }),
    ).rejects.toBe(signal)
  })

  it('lets a signal of the framework through', async () => {
    seed([], ['Two-day pass'])
    // What `notFound()` throws: not a failure of this section to swallow.
    let signal: unknown
    try {
      notFound()
    } catch (error) {
      signal = error
    }
    h.resolveError = signal as Error

    await expect(
      LoadedWorkshopTickets({ conference: CONFERENCE }),
    ).rejects.toBe(signal)
  })
})

/**
 * WHAT /admin/workshops RENDERS IN THE SLOT. The page hands the section to its
 * client shell; rendered on its own (the shell needs a live tRPC provider) it
 * is the whole section, loaded.
 */
describe('/admin/workshops', () => {
  it('renders the section for the conference of the request', async () => {
    seed(
      [{ typeName: 'Two-day pass', grantsWorkshop: true }],
      ['Two-day pass', 'Student'],
    )

    const page = (await WorkshopAdminPage()) as {
      props: { ticketsSection: React.ReactElement }
    }
    const { prelude } = await prerender(page.props.ticketsSection)
    document.body.innerHTML = await new Response(prelude).text()

    expect(
      screen.getByRole('region', { name: 'Workshop tickets' }),
    ).toHaveAttribute('id', 'workshop-tickets')
    expect(answers()).toEqual([
      ['Two-day pass', 'Grants workshop access'],
      ['Student', 'Not set'],
    ])
  })
})
