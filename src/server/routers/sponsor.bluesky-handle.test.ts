/**
 * @vitest-environment node
 *
 * The sponsor company's Bluesky handle (tagging spec §3.3, #1154), entered in
 * the CRM and checked against Bluesky on save. Bluesky is faked at the HTTP
 * boundary (MSW); `resolveBlueskyHandle` and `updateSponsor` run for real,
 * down to the patch the Sanity client is handed.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  /** What the ownership probe reports for the sponsor. */
  tenant: null as Record<string, unknown> | null,
  /** The stored sponsor document. */
  stored: null as Record<string, unknown> | null,
  /** Every patch committed: its sets and unsets. */
  patches: [] as {
    id: string
    set: Record<string, unknown>
    unset: string[]
  }[],
  created: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))

vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string) => {
    if (query.includes('"memberOrgIds"')) return h.tenant
    if (query.includes('_type == "sponsor" && _id == $id')) return h.stored
    return null
  }
  const patch = (id: string) => {
    const entry = {
      id,
      set: {} as Record<string, unknown>,
      unset: [] as string[],
    }
    const chain = {
      set: (v: Record<string, unknown>) => {
        Object.assign(entry.set, v)
        return chain
      },
      unset: (keys: string[]) => {
        entry.unset.push(...keys)
        return chain
      },
      commit: async () => {
        h.patches.push(entry)
        const next = { ...h.stored, ...entry.set }
        for (const k of entry.unset) delete next[k]
        h.stored = next
        return next
      },
    }
    return chain
  }
  const client = {
    fetch,
    patch,
    create: async (doc: Record<string, unknown>) => {
      h.created.push(doc)
      return { _id: 'sp-new', _createdAt: 'x', _updatedAt: 'x', ...doc }
    },
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { server } from '../../../__tests__/mocks/msw/server'
import { sponsorRouter } from './sponsor'

const RESOLVE =
  'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle'
const DID = 'did:plc:acmeacmeacmeacmeacmeacme'
const ORG_A = 'org-A'

const t = initTRPC.context<Context>().create()
function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}
const sponsor = () => t.createCallerFactory(sponsorRouter)(ctx())

/** Handles Bluesky was asked about, in order. */
let asked: string[] = []
function bluesky(answer: 'resolves' | 'unknown' | 'down') {
  server.use(
    http.get(RESOLVE, ({ request }) => {
      asked.push(new URL(request.url).searchParams.get('handle') ?? '')
      if (answer === 'resolves') return HttpResponse.json({ did: DID })
      if (answer === 'unknown')
        return HttpResponse.json(
          { error: 'InvalidRequest', message: 'Unable to resolve handle' },
          { status: 400 },
        )
      return HttpResponse.json(
        { error: 'InternalServerError' },
        { status: 502 },
      )
    }),
  )
}

const ours = {
  _type: 'sponsor',
  orgId: ORG_A,
  conferenceId: null,
  conferenceOrgId: null,
  memberOrgIds: [],
}

beforeEach(() => {
  asked = []
  h.patches.length = 0
  h.created.length = 0
  h.tenant = ours
  h.stored = {
    _id: 'sp-A',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    name: 'Acme AS',
    website: 'https://acme.example',
  }
  h.getConference.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: ORG_A } },
    domain: 'localhost',
    error: null,
  })
})
afterEach(() => vi.useRealTimers())

describe('sponsor.update: the Bluesky handle', () => {
  it('a handle that resolves is saved normalised, and reads back', async () => {
    bluesky('resolves')
    const saved = await sponsor().update({
      id: 'sp-A',
      data: { blueskyHandle: '@Acme.Example ' },
    })
    expect(asked).toEqual(['acme.example'])
    expect(h.patches.at(-1)!.set.blueskyHandle).toBe('acme.example')
    expect(saved.blueskyHandle).toBe('acme.example')
    expect(saved.warnings).toEqual([])
    // Reloads: the next read of the sponsor carries it.
    const again = await sponsor().getById({ id: 'sp-A' })
    expect(again.blueskyHandle).toBe('acme.example')
  })

  it('a bsky.app profile URL is taken as its handle', async () => {
    bluesky('resolves')
    await sponsor().update({
      id: 'sp-A',
      data: { blueskyHandle: 'https://bsky.app/profile/acme.example' },
    })
    expect(h.patches.at(-1)!.set.blueskyHandle).toBe('acme.example')
  })

  it('a handle Bluesky does not know is refused with a clear message, and nothing is written', async () => {
    bluesky('unknown')
    await expect(
      sponsor().update({
        id: 'sp-A',
        data: { blueskyHandle: 'nobody.example' },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining(
        '@nobody.example does not resolve on Bluesky',
      ),
    })
    expect(h.patches).toEqual([])
    expect(h.stored!.blueskyHandle).toBeUndefined()
  })

  it('Bluesky unreachable is a warning: the handle is saved', async () => {
    bluesky('down')
    const saved = await sponsor().update({
      id: 'sp-A',
      data: { blueskyHandle: 'acme.example' },
    })
    expect(h.stored!.blueskyHandle).toBe('acme.example')
    expect(saved.warnings).toEqual([
      expect.stringContaining(
        'Bluesky could not be reached to check @acme.example',
      ),
    ])
  })

  it('a handle that is not handle syntax is refused before Bluesky is asked', async () => {
    bluesky('resolves')
    await expect(
      sponsor().update({ id: 'sp-A', data: { blueskyHandle: 'not a handle' } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(asked).toEqual([])
    expect(h.patches).toEqual([])
  })

  it('an unchanged handle is not asked again', async () => {
    bluesky('unknown')
    h.stored!.blueskyHandle = 'acme.example'
    const saved = await sponsor().update({
      id: 'sp-A',
      data: { name: 'Acme Group', blueskyHandle: 'acme.example' },
    })
    expect(asked).toEqual([])
    expect(saved.name).toBe('Acme Group')
    expect(h.stored!.blueskyHandle).toBe('acme.example')
  })

  it('an empty handle clears it — without asking Bluesky', async () => {
    bluesky('resolves')
    h.stored!.blueskyHandle = 'acme.example'
    await sponsor().update({ id: 'sp-A', data: { blueskyHandle: '' } })
    expect(asked).toEqual([])
    expect(h.patches.at(-1)!.unset).toContain('blueskyHandle')
    expect(h.stored!.blueskyHandle).toBeUndefined()
  })

  it('a save that does not send the handle leaves it alone', async () => {
    h.stored!.blueskyHandle = 'acme.example'
    await sponsor().update({ id: 'sp-A', data: { name: 'Acme Group' } })
    expect(h.patches.at(-1)!.unset).not.toContain('blueskyHandle')
    expect(h.stored!.blueskyHandle).toBe('acme.example')
  })

  it('the LinkedIn company page saves, clears and reads back', async () => {
    await sponsor().update({
      id: 'sp-A',
      data: { linkedinUrl: 'https://www.linkedin.com/company/acme' },
    })
    expect(h.stored!.linkedinUrl).toBe('https://www.linkedin.com/company/acme')
    expect((await sponsor().getById({ id: 'sp-A' })).linkedinUrl).toBe(
      'https://www.linkedin.com/company/acme',
    )
    await sponsor().update({ id: 'sp-A', data: { linkedinUrl: '' } })
    expect(h.stored!.linkedinUrl).toBeUndefined()
  })

  it('a LinkedIn page is stored canonical; a profile or another site is refused', async () => {
    await sponsor().update({
      id: 'sp-A',
      data: { linkedinUrl: 'linkedin.com/company/acme/?locale=en_US' },
    })
    expect(h.stored!.linkedinUrl).toBe('https://www.linkedin.com/company/acme')
    for (const bad of [
      'https://www.linkedin.com/in/alice',
      'https://acme.example/linkedin',
    ]) {
      await expect(
        sponsor().update({ id: 'sp-A', data: { linkedinUrl: bad } }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }
    expect(h.stored!.linkedinUrl).toBe('https://www.linkedin.com/company/acme')
  })

  it("another organization's sponsor: refused before Bluesky is asked (guard before fetch)", async () => {
    bluesky('resolves')
    h.tenant = { ...ours, orgId: 'org-B' }
    await expect(
      sponsor().update({ id: 'sp-A', data: { blueskyHandle: 'acme.example' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(asked).toEqual([])
    expect(h.patches).toEqual([])
  })
})

describe('sponsor.create: the Bluesky handle', () => {
  it('is checked and saved on a new sponsor', async () => {
    bluesky('resolves')
    const created = await sponsor().create({
      name: 'Initech',
      website: 'https://initech.example',
      blueskyHandle: 'initech.example',
    })
    expect(asked).toEqual(['initech.example'])
    expect(h.created[0].blueskyHandle).toBe('initech.example')
    expect(created.warnings).toEqual([])
  })

  it('a handle Bluesky does not know: nothing is created', async () => {
    bluesky('unknown')
    await expect(
      sponsor().create({
        name: 'Initech',
        website: 'https://initech.example',
        blueskyHandle: 'nobody.example',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.created).toEqual([])
  })
})
