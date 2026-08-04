import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import type { Context } from '@/server/trpc'

// Mock the merge library so the router test exercises ONLY the tRPC wiring and
// the adminProcedure auth gate — not the Sanity transaction (covered elsewhere).
const mergeSpeakersMock = vi.fn()
vi.mock('@/lib/speaker/merge', async () => {
  const actual = await vi.importActual<typeof import('@/lib/speaker/merge')>(
    '@/lib/speaker/merge',
  )
  return {
    ...actual,
    mergeSpeakers: (...args: unknown[]) => mergeSpeakersMock(...args),
  }
})

// The org-scoped admin waist derives the REQUEST's org from the domain
// conference, then requires the caller's `organizerOrgIds` to contain it — so the
// resolved conference must carry the org `makeCaller` grants below.
vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-1',
      organization: { _type: 'reference', _ref: 'org-test' },
    },
    domain: 'localhost',
    error: null,
  }),
}))

// OWNERSHIP PROBE (#730): `speaker.admin.merge` now resolves each id's tenant
// before merging. Report both as speakers of this org so the wiring tests below
// still reach the merge library.
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string) => {
      if (query.includes('"memberOrgIds"')) {
        return {
          _type: 'speaker',
          orgId: null,
          conferenceId: null,
          conferenceOrgId: null,
          memberOrgIds: ['org-test'],
        }
      }
      // The participation probe: this org's conferences only, so both ids are
      // exclusive to it and the destructive guard permits the merge.
      if (query.includes('.conference->organization._ref')) return ['org-test']
      // The foreign-reference count.
      return 0
    },
  },
  clientWrite: { patch: vi.fn(), delete: vi.fn(), create: vi.fn() },
}))

import { speakerRouter } from './speaker'
import { MergeValidationError } from '@/lib/speaker/merge'
// NOTE: the ownership probe (#730) is mocked above as "both ids are speakers of
// this org"; the cross-tenant REFUSALS live in `tenancy.writes.test.ts`.

const ORG_ID = 'org-test'

const PREVIEW = {
  survivorId: 'survivor',
  loserId: 'loser',
  referencingDocCount: 2,
  referenceRepointsByType: { talk: 1, conference: 1 },
  fieldChanges: {
    providers: { before: [], after: ['github:1'] },
    knownEmails: { before: [], after: ['a@b.com'] },
    email: { before: 'a@b.com', after: 'a@b.com' },
    filledFromLoser: [],
  },
  willDeleteLoserId: 'loser',
}

function makeCaller(opts: { isOrganizer: boolean }) {
  // `organizerOrgIds` is what the waist reads; the deprecated global flag is kept
  // only because non-authz code still looks at it.
  const speaker = {
    _id: 'admin-1',
    name: 'Admin',
    isOrganizer: opts.isOrganizer,
    organizerOrgIds: opts.isOrganizer ? [ORG_ID] : [],
  }
  const ctx = {
    session: { speaker, user: { name: 'Admin' } },
    speaker,
  } as unknown as Context
  return speakerRouter.createCaller(ctx)
}

const input = { survivorId: 'survivor', loserId: 'loser' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('speaker.admin.merge auth gate', () => {
  it('rejects a non-organizer for the preview query', async () => {
    const caller = makeCaller({ isOrganizer: false })
    await expect(caller.admin.mergePreview(input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(mergeSpeakersMock).not.toHaveBeenCalled()
  })

  it('rejects a non-organizer for the merge mutation', async () => {
    const caller = makeCaller({ isOrganizer: false })
    await expect(caller.admin.merge(input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(mergeSpeakersMock).not.toHaveBeenCalled()
  })
})

describe('speaker.admin.mergePreview', () => {
  it('calls mergeSpeakers with dryRun=true and writes nothing', async () => {
    mergeSpeakersMock.mockResolvedValue({
      preview: PREVIEW,
      committed: false,
      err: null,
    })
    const caller = makeCaller({ isOrganizer: true })
    const result = await caller.admin.mergePreview(input)

    expect(result).toEqual(PREVIEW)
    expect(mergeSpeakersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        survivorId: 'survivor',
        loserId: 'loser',
        dryRun: true,
        actor: expect.objectContaining({ _id: 'admin-1' }),
      }),
    )
  })

  it('maps a validation error to BAD_REQUEST', async () => {
    mergeSpeakersMock.mockResolvedValue({
      preview: null,
      committed: false,
      err: new MergeValidationError('Cannot merge a speaker into itself'),
    })
    const caller = makeCaller({ isOrganizer: true })
    await expect(caller.admin.mergePreview(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})

describe('speaker.admin.merge', () => {
  it('calls mergeSpeakers with dryRun=false and returns success', async () => {
    mergeSpeakersMock.mockResolvedValue({
      preview: PREVIEW,
      committed: true,
      err: null,
    })
    const caller = makeCaller({ isOrganizer: true })
    const result = await caller.admin.merge(input)

    expect(result).toEqual({ success: true, preview: PREVIEW })
    expect(mergeSpeakersMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false }),
    )
  })

  it('maps an unexpected error to INTERNAL_SERVER_ERROR', async () => {
    mergeSpeakersMock.mockResolvedValue({
      preview: null,
      committed: false,
      err: new Error('sanity exploded'),
    })
    const caller = makeCaller({ isOrganizer: true })
    await expect(caller.admin.merge(input)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('rejects a self-merge at the input-schema layer', async () => {
    const caller = makeCaller({ isOrganizer: true })
    await expect(
      caller.admin.merge({ survivorId: 'x', loserId: 'x' }),
    ).rejects.toBeInstanceOf(TRPCError)
    expect(mergeSpeakersMock).not.toHaveBeenCalled()
  })
})
