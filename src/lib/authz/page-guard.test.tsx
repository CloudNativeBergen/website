/**
 * @vitest-environment jsdom
 *
 * THE GUARD IN FRONT OF THE PAGES THAT READ THE SPONSOR INVITE LINK.
 *
 * /admin is behind `src/proxy.ts`, which only requires that a request carry
 * SOME session — so the admin layout's organizer check is the only thing
 * between a self-registered speaker and an organizer-only page, and a layout
 * check is presentation. Two pages opt into reading the sponsor invite link, a
 * bearer token that buys hidden tickets, and both ask again for themselves.
 *
 * Tested here rather than through either page: /admin/settings pulls in some
 * forty modules, so a page-level test of it would be mostly mocks, and the
 * behaviour that matters — deny unless organizer, fail closed on anything
 * unexpected — is the same both times.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  isOrganizerForCurrentOrg: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getAuthSession: mocks.getAuthSession }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: mocks.isOrganizerForCurrentOrg,
}))

import { denyNonOrganizer } from './page-guard'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('denyNonOrganizer', () => {
  it('lets an organizer through', async () => {
    mocks.getAuthSession.mockResolvedValue({ speaker: { _id: 'organizer-1' } })
    mocks.isOrganizerForCurrentOrg.mockResolvedValue(true)

    // Null, not a truthy empty element: the caller's `if (denied) return
    // denied` has to fall through to the read it guards.
    await expect(denyNonOrganizer()).resolves.toBeNull()
  })

  it('denies a signed-in speaker who is not an organizer', async () => {
    mocks.getAuthSession.mockResolvedValue({ speaker: { _id: 'speaker-9' } })
    mocks.isOrganizerForCurrentOrg.mockResolvedValue(false)

    const denied = await denyNonOrganizer()
    expect(denied).not.toBeNull()
    render(denied)
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
  })

  it('asks about the speaker on the session, not the session itself', async () => {
    const speaker = { _id: 'organizer-1' }
    mocks.getAuthSession.mockResolvedValue({ speaker })
    mocks.isOrganizerForCurrentOrg.mockResolvedValue(true)

    await denyNonOrganizer()

    // Passing the whole session would make the predicate read `undefined` for
    // `_id` and fail closed on every organizer — a guard that denies everyone
    // looks like a working guard right up until someone tries to use the page.
    expect(mocks.isOrganizerForCurrentOrg).toHaveBeenCalledWith(speaker)
  })

  it('denies when there is no session at all', async () => {
    mocks.getAuthSession.mockResolvedValue(null)
    mocks.isOrganizerForCurrentOrg.mockResolvedValue(false)

    expect(await denyNonOrganizer()).not.toBeNull()
    expect(mocks.isOrganizerForCurrentOrg).toHaveBeenCalledWith(undefined)
  })
})
