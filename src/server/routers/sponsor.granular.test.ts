/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { resolveConferenceId } from '@/server/trpc'
import * as sanityCrm from '@/lib/sponsor-crm/sanity'

vi.mock('@/server/trpc', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    resolveConferenceId: vi.fn(),
  }
})

vi.mock('@/lib/sponsor-crm/sanity', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/sponsor-crm/sanity')>()
  return {
    ...actual,
    getSponsorOverview: vi.fn(),
    getSponsorContacts: vi.fn(),
    getSponsorContractDetails: vi.fn(),
  }
})

describe('Sponsor CRM Granular Endpoints', () => {
  function ctx() {
    const speaker = {
      _id: 'sp-admin',
      name: 'Admin',
      isOrganizer: true,
      organizerOrgIds: ['org_1'],
    }
    const user = { email: 'a@example.com', name: 'Admin', picture: '' }
    return {
      req: {
        headers: new Headers(),
        url: 'http://localhost:3000',
      },
      session: {
        expires: new Date(Date.now() + 86_400_000).toISOString(),
        user,
        speaker,
      },
      speaker,
      user,
      workosUser: null,
      ipAddress: '127.0.0.1',
    } as any
  }
  const caller = appRouter.createCaller(ctx())

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resolveConferenceId).mockResolvedValue('conf_abc')
  })

  describe('Multi-tenant Isolation Guards', () => {
    it('refuses to return overview for a foreign sponsor', async () => {
      vi.mocked(sanityCrm.getSponsorOverview).mockResolvedValue({
        data: { _id: 'sponsor_foreign', conference: { _ref: 'conf_foreign' } },
      })

      await expect(
        caller.sponsor.crm.getOverview({ id: 'sponsor_foreign' }),
      ).rejects.toThrow('Sponsor not found for this conference')
    })

    it('returns overview for a native sponsor', async () => {
      vi.mocked(sanityCrm.getSponsorOverview).mockResolvedValue({
        data: { _id: 'sponsor_native', conference: { _ref: 'conf_abc' } },
      })

      const res = await caller.sponsor.crm.getOverview({ id: 'sponsor_native' })
      expect(res._id).toBe('sponsor_native')
    })

    it('refuses to return contacts for a foreign sponsor', async () => {
      vi.mocked(sanityCrm.getSponsorContacts).mockResolvedValue({
        data: { _id: 'sponsor_foreign', conference: { _ref: 'conf_foreign' } },
      })

      await expect(
        caller.sponsor.crm.getContacts({ id: 'sponsor_foreign' }),
      ).rejects.toThrow('Sponsor not found for this conference')
    })

    it('refuses to return contract details for a foreign sponsor', async () => {
      vi.mocked(sanityCrm.getSponsorContractDetails).mockResolvedValue({
        data: { _id: 'sponsor_foreign', conference: { _ref: 'conf_foreign' } },
      })

      await expect(
        caller.sponsor.crm.getContractDetails({ id: 'sponsor_foreign' }),
      ).rejects.toThrow('Sponsor not found for this conference')
    })
  })
})
