import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import type { Context } from '@/server/trpc'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// Sanity: reads answered per query shape, writes captured. Never the network.
const fetchMock = vi.fn()
const txDelete = vi.fn()
const txCommit = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (q: string, p?: unknown) => fetchMock(q, p) },
  clientWrite: {
    transaction: () => {
      const tx = {
        delete: (id: string) => (txDelete(id), tx),
        commit: () => txCommit(),
      }
      return tx
    },
  },
}))

vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-1',
      organization: { _type: 'reference', _ref: 'org-A' },
    },
    domain: 'localhost',
    error: null,
  }),
}))

// The two erasure cores the CLI scripts run.
const eraseSpeakerInPlace = vi.fn()
vi.mock('@/lib/speaker/erasure', () => ({
  eraseSpeakerInPlace: (o: unknown) => eraseSpeakerInPlace(o),
}))
const eraseSponsor = vi.fn()
vi.mock('@/lib/sponsor-crm/contact-erasure', () => ({
  eraseSponsorContactSendRecords: (o: unknown) => eraseSponsor(o),
}))

// WorkOS: never the real API.
const listUsers = vi.fn()
const deleteUser = vi.fn()
vi.mock('@/lib/workshop/central-sign-in/workos', () => ({
  workshopWorkOS: () => ({ userManagement: { listUsers, deleteUser } }),
}))

const requireSpeakerInCurrentOrg = vi.fn()
vi.mock('@/server/tenancy', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireCurrentOrgId: async () => 'org-A',
  requireSpeakerInCurrentOrg: (...a: unknown[]) =>
    requireSpeakerInCurrentOrg(...a),
}))

import { privacyRouter } from './privacy'

const EMAIL = 'ada@example.com'

function caller(isOrganizer = true) {
  const speaker = {
    _id: 'org-1',
    name: 'Org',
    isOrganizer,
    organizerOrgIds: isOrganizer ? ['org-A'] : [],
  }
  return privacyRouter.createCaller({
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context)
}

function plan(over: Record<string, unknown> = {}) {
  return {
    speakerId: 'sp-1',
    documentPatches: [],
    documentDeletes: [
      { id: 'inv-1', type: 'coSpeakerInvitation', reason: 'invitation' },
    ],
    refusals: [],
    sharedByLinkOnly: [],
    ...over,
  }
}

interface World {
  speakers?: { _id: string; name: string }[]
  invitations?: { id: string; label: string }[]
  signups?: { id: string; label: string; workosId?: string }[]
  foreignSignups?: number
  owners?: { owner?: string; members?: string[] }[]
}

function world(w: World) {
  let invitations = w.invitations ?? []
  let signups = w.signups ?? []
  txCommit.mockImplementation(async () => {
    invitations = []
    signups = []
  })
  fetchMock.mockImplementation(async (q: string) => {
    if (q.includes('[0...$limit]')) return w.speakers ?? []
    if (q.includes('"invitations"')) return { invitations, signups }
    if (q.includes('"owner"')) return w.owners ?? []
    if (q.includes('_type == "workshopSignup"')) return w.foreignSignups ?? 0
    if (q.includes('_type == "speaker"')) return (w.speakers ?? []).length
    if (q.startsWith('count(')) return 0
    return []
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listUsers.mockResolvedValue({ data: [] })
  deleteUser.mockResolvedValue(undefined)
  requireSpeakerInCurrentOrg.mockResolvedValue('org-A')
  eraseSponsor.mockResolvedValue({
    patches: [],
    refusals: [],
    foreign: 0,
    residual: 0,
    err: null,
  })
  eraseSpeakerInPlace.mockImplementation(async (o: { dryRun: boolean }) => ({
    plan: plan(),
    err: null,
    verification: o.dryRun ? null : { clean: true, residual: {} },
  }))
})

describe('privacy router', () => {
  it('refuses a non-organizer', async () => {
    await expect(caller(false).preview({ email: EMAIL })).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    )
  })

  it('erases an exclusive speaker in full, through the CLI core', async () => {
    world({ speakers: [{ _id: 'sp-1', name: 'Ada' }] })
    const preview = await caller().preview({ email: EMAIL })
    expect(preview.groups.find((g) => g.kind === 'speaker')?.action).toBe(
      'erase',
    )
    expect(preview.refusals).toEqual([])

    const result = await caller().erase({ email: EMAIL, confirmEmail: EMAIL })
    expect(eraseSpeakerInPlace).toHaveBeenCalledWith(
      expect.objectContaining({ speakerId: 'sp-1', dryRun: false }),
    )
    expect(result.clean).toBe(true)
    expect(result.verification[0]).toBe('Speaker sp-1: CLEAN')
  })

  it('keeps a speaker shared with another organization', async () => {
    world({
      speakers: [{ _id: 'sp-1', name: 'Ada' }],
      invitations: [{ id: 'inv-A', label: 'Talk (pending)' }],
    })
    requireSpeakerInCurrentOrg.mockRejectedValue(
      new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This speaker also belongs to another organization.',
      }),
    )
    const preview = await caller().preview({ email: EMAIL })
    const speaker = preview.groups.find((g) => g.kind === 'speaker')
    expect(speaker?.action).toBe('keep')
    expect(speaker?.items[0].label).toContain('another organization')
    expect(preview.remains.join(' ')).toContain('pnpm erase-speaker')

    await caller().erase({ email: EMAIL, confirmEmail: EMAIL })
    // The shared speaker is never written; this org's invitation is.
    expect(eraseSpeakerInPlace).not.toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false }),
    )
    expect(txDelete).toHaveBeenCalledWith('inv-A')
  })

  it('keeps a speaker whose erasure would write into another org', async () => {
    world({
      speakers: [{ _id: 'sp-1', name: 'Ada' }],
      owners: [{ owner: 'org-B' }],
    })
    const preview = await caller().preview({ email: EMAIL })
    expect(preview.groups.find((g) => g.kind === 'speaker')?.action).toBe(
      'keep',
    )
  })

  it('erases invitations for an address with no speaker document', async () => {
    world({ invitations: [{ id: 'inv-A', label: 'Talk (declined)' }] })
    const preview = await caller().preview({ email: EMAIL })
    expect(preview.groups.map((g) => g.kind)).toEqual(['invitations'])

    const result = await caller().erase({ email: EMAIL, confirmEmail: EMAIL })
    expect(txDelete).toHaveBeenCalledWith('inv-A')
    expect(result.clean).toBe(true)
  })

  it('deletes the WorkOS login, treating "not found" as done', async () => {
    world({ signups: [{ id: 'ws-1', label: 'K8s', workosId: 'user_1' }] })
    // Found by the erase's own plan; gone at verification.
    listUsers
      .mockResolvedValueOnce({ data: [{ id: 'user_1' }] })
      .mockResolvedValue({ data: [] })
    deleteUser.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 }),
    )
    const result = await caller().erase({ email: EMAIL, confirmEmail: EMAIL })
    expect(deleteUser).toHaveBeenCalledWith('user_1')
    expect(txDelete).toHaveBeenCalledWith('ws-1')
    expect(result.verification).toContain('Workshop login: CLEAN')
  })

  it('keeps the WorkOS login when another org has signups', async () => {
    world({
      signups: [{ id: 'ws-1', label: 'K8s', workosId: 'user_1' }],
      foreignSignups: 1,
    })
    listUsers.mockResolvedValue({ data: [{ id: 'user_1' }] })
    const preview = await caller().preview({ email: EMAIL })
    expect(preview.groups.find((g) => g.kind === 'login')?.action).toBe('keep')
    await caller().erase({ email: EMAIL, confirmEmail: EMAIL })
    expect(deleteUser).not.toHaveBeenCalled()
    expect(txDelete).toHaveBeenCalledWith('ws-1')
  })

  it('maps a revision conflict to CONFLICT', async () => {
    world({ speakers: [{ _id: 'sp-1', name: 'Ada' }] })
    eraseSpeakerInPlace.mockImplementation(async (o: { dryRun: boolean }) =>
      o.dryRun
        ? { plan: plan(), err: null, verification: null }
        : {
            plan: plan(),
            err: Object.assign(new Error('Document has unexpected revision'), {
              statusCode: 409,
            }),
            verification: null,
          },
    )
    await expect(
      caller().erase({ email: EMAIL, confirmEmail: EMAIL }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('refuses without the typed confirmation', async () => {
    world({ speakers: [{ _id: 'sp-1', name: 'Ada' }] })
    await expect(
      caller().erase({ email: EMAIL, confirmEmail: 'other@example.com' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(eraseSpeakerInPlace).not.toHaveBeenCalled()
  })

  it('refuses to erase when the re-run plan has refusals', async () => {
    world({ speakers: [{ _id: 'sp-1', name: 'Ada' }] })
    eraseSpeakerInPlace.mockResolvedValue({
      plan: plan({ refusals: ['sole organizer of conf-1'] }),
      err: null,
      verification: null,
    })
    await expect(
      caller().erase({ email: EMAIL, confirmEmail: EMAIL }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(eraseSpeakerInPlace).not.toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false }),
    )
  })
})
