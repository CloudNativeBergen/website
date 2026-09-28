/**
 * @vitest-environment jsdom
 *
 * The CRM form's save of the company details (#1154): the Bluesky handle and
 * LinkedIn page reach `sponsor.update`, a Bluesky warning is shown without
 * failing the save, and a refusal is shown with the server's message.
 */
import { renderHook, act } from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import type { SponsorCRMFormData } from '@/hooks/useSponsorCRMFormMutations'

type Options = {
  onSuccess?: (data: unknown) => void
  onError?: (e: { message: string }) => void
}
const m = vi.hoisted(() => ({
  notify: vi.fn(),
  global: vi.fn(),
  crmUpdate: vi.fn(),
  /** What `sponsor.update` answers: data, or an error message. */
  answer: { data: { warnings: [] as string[] } } as
    { data: { warnings: string[] } } | { error: string },
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: m.notify }),
}))

vi.mock('@/lib/trpc/client', () => {
  const mutation =
    (spy: (input: unknown) => void, isGlobal = false) =>
    (options: Options = {}) => ({
      mutateAsync: async (input: unknown) => {
        spy(input)
        if (isGlobal && 'error' in m.answer) {
          options.onError?.({ message: m.answer.error })
          throw new Error(m.answer.error)
        }
        const data = isGlobal && 'data' in m.answer ? m.answer.data : {}
        options.onSuccess?.(data)
        return data
      },
      reset: () => {},
      isPending: false,
    })
  const invalidate = { invalidate: vi.fn() }
  return {
    api: {
      useUtils: () => ({
        sponsor: {
          list: invalidate,
          crm: { list: invalidate, healthViolations: invalidate },
        },
      }),
      sponsor: {
        update: { useMutation: mutation(m.global, true) },
        crm: {
          update: { useMutation: mutation(m.crmUpdate) },
          create: { useMutation: mutation(vi.fn()) },
        },
      },
    },
  }
})

import { useSponsorCRMFormMutations } from '@/hooks/useSponsorCRMFormMutations'

const sponsor = mockSponsor({
  sponsor: { ...mockSponsor().sponsor, blueskyHandle: 'acme.bsky.social' },
})
function form(overrides: Partial<SponsorCRMFormData>): SponsorCRMFormData {
  return {
    sponsorId: sponsor.sponsor._id,
    name: sponsor.sponsor.name,
    website: sponsor.sponsor.website,
    logo: sponsor.sponsor.logo ?? null,
    logoBright: sponsor.sponsor.logoBright ?? null,
    orgNumber: sponsor.sponsor.orgNumber ?? '',
    address: sponsor.sponsor.address ?? '',
    blueskyHandle: 'acme.bsky.social',
    linkedinUrl: '',
    tierId: '',
    addonIds: [],
    contractStatus: 'none',
    status: 'negotiating',
    invoiceStatus: 'not-sent',
    contractValue: '',
    contractCurrency: 'NOK',
    tags: [],
    assignedTo: '',
    ...overrides,
  }
}
const hook = () =>
  renderHook(() =>
    useSponsorCRMFormMutations({
      conferenceId: 'conf-A',
      sponsor,
      isOpen: true,
      onSuccess: vi.fn(),
    }),
  ).result.current

beforeEach(() => {
  vi.clearAllMocks()
  m.answer = { data: { warnings: [] } }
})

describe('saving the company’s social accounts', () => {
  it('a changed handle and LinkedIn page are sent to sponsor.update', async () => {
    const { handleSubmit } = hook()
    await act(() =>
      handleSubmit(
        form({
          blueskyHandle: ' @Acme.com ',
          linkedinUrl: 'https://www.linkedin.com/company/acme',
        }),
      ),
    )
    expect(m.global).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sponsor.sponsor._id,
        data: expect.objectContaining({
          blueskyHandle: '@Acme.com',
          linkedinUrl: 'https://www.linkedin.com/company/acme',
        }),
      }),
    )
  })

  it('an emptied handle is sent as null, which clears it', async () => {
    const { handleSubmit } = hook()
    await act(() => handleSubmit(form({ blueskyHandle: '' })))
    expect(m.global.mock.calls[0][0].data.blueskyHandle).toBeNull()
  })

  it('an unchanged handle does not touch the company record', async () => {
    const { handleSubmit } = hook()
    await act(() => handleSubmit(form({})))
    expect(m.global).not.toHaveBeenCalled()
    expect(m.crmUpdate).toHaveBeenCalled()
  })

  it('a Bluesky warning is shown, and the save goes on', async () => {
    m.answer = { data: { warnings: ['Bluesky could not be reached.'] } }
    const { handleSubmit } = hook()
    await act(() => handleSubmit(form({ blueskyHandle: 'acme.com' })))
    expect(m.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        message: 'Bluesky could not be reached.',
      }),
    )
    expect(m.crmUpdate).toHaveBeenCalled()
  })

  it('a refused handle shows the server’s message, and nothing else is saved', async () => {
    m.answer = { error: '@nobody.example does not resolve on Bluesky.' }
    const { handleSubmit } = hook()
    await act(async () => {
      await expect(
        handleSubmit(form({ blueskyHandle: 'nobody.example' })),
      ).rejects.toThrow()
    })
    expect(m.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: '@nobody.example does not resolve on Bluesky.',
      }),
    )
    expect(m.crmUpdate).not.toHaveBeenCalled()
  })
})
