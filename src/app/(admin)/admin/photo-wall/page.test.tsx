/**
 * @vitest-environment node
 *
 * `/admin/photo-wall` asks `denyNonOrganizer()` for itself (Photo Wall spec
 * §10): the admin layout's check is presentation. The guard is the real one;
 * only who the caller is, and whether they organize this org, are given.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  isOrganizerForCurrentOrg: vi.fn(),
  getConference: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.getAuthSession }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: h.isOrganizerForCurrentOrg,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/components/photo-wall/admin', () => ({
  PhotoWallAdminPage: () => null,
}))

import { ACCESS_DENIED } from '@/lib/authz/page-guard'
import { PhotoWallAdminPage } from '@/components/photo-wall/admin'
import AdminPhotoWallPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  h.getAuthSession.mockResolvedValue({ speaker: { _id: 'sp-1' } })
  h.getConference.mockResolvedValue({
    conference: { _id: 'conf-A', title: 'CND 2026' },
    error: null,
  })
})

describe('/admin/photo-wall', () => {
  it('refuses a non-organizer before reading the conference', async () => {
    h.isOrganizerForCurrentOrg.mockResolvedValue(false)
    await expect(AdminPhotoWallPage()).resolves.toBe(ACCESS_DENIED)
    expect(h.getConference).not.toHaveBeenCalled()
  })

  it('renders the admin page for an organizer', async () => {
    h.isOrganizerForCurrentOrg.mockResolvedValue(true)
    const page = (await AdminPhotoWallPage()) as {
      type: unknown
      props: unknown
    }
    expect(page.type).toBe(PhotoWallAdminPage)
    expect(page.props).toEqual({ conferenceTitle: 'CND 2026', rooms: [] })
  })
})
