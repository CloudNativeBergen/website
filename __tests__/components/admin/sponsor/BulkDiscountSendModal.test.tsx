/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import React from 'react'

const h = vi.hoisted(() => ({
  showNotification: vi.fn(),
  sendMutation: vi.fn(),
  crmList: vi.fn(),
  invalidateActivities: vi.fn(),
  invalidateComms: vi.fn(),
  invalidateDiscounts: vi.fn(),
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.showNotification }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: {
        crm: {
          activities: {
            list: { invalidate: h.invalidateActivities },
            listCommunications: { invalidate: h.invalidateComms },
          },
        },
      },
      tickets: {
        admin: {
          getDiscountCodesWithUsage: { invalidate: h.invalidateDiscounts },
        },
      },
    }),
    sponsor: {
      crm: {
        list: {
          useQuery: (...args: unknown[]) => h.crmList(...args),
        },
        sendCommunication: {
          useMutation: () => ({
            mutateAsync: h.sendMutation,
            isPending: false,
          }),
        },
      },
    },
  },
}))

import { BulkDiscountSendModal } from '@/components/admin/sponsor/BulkDiscountSendModal'

const CONFERENCE = {
  title: 'Cloud Native Days 2026',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-10-28',
  domains: ['cnd.example'],
  contactEmail: 'sponsors@cnd.example',
  domain: 'cnd.example',
  sponsorRegistrationLink: 'https://tickets.example/invite/123',
}

const SPONSOR_1 = {
  id: 'sp-acme',
  name: 'Acme Corp',
  sponsorForConferenceId: 'sfc-acme',
  tier: { title: 'Gold', tagline: '', tierType: 'standard' as const },
  ticketEntitlement: 3,
  linkedCodes: ['ACME-2026'],
}

const SPONSOR_2 = {
  id: 'sp-globex',
  name: 'Globex',
  sponsorForConferenceId: 'sfc-globex',
  tier: { title: 'Silver', tagline: '', tierType: 'standard' as const },
  ticketEntitlement: 2,
  linkedCodes: [], // No codes
}

const SPONSOR_3 = {
  id: 'sp-initech',
  name: 'Initech',
  sponsorForConferenceId: 'sfc-initech',
  tier: { title: 'Gold', tagline: '', tierType: 'standard' as const },
  ticketEntitlement: 3,
  linkedCodes: ['INITECH-VIP'],
}

const CRM_SPONSORS = [
  {
    _id: 'sfc-acme',
    sponsor: { _id: 'sp-acme', name: 'Acme Corp' },
    contactPersons: [
      {
        _key: 'c1',
        name: 'Alice',
        email: 'alice@acme.example',
        isPrimary: true,
      },
    ],
    linkedCodes: ['ACME-2026'],
  },
  {
    _id: 'sfc-globex',
    sponsor: { _id: 'sp-globex', name: 'Globex' },
    contactPersons: [
      { _key: 'c2', name: 'Bob', email: 'bob@globex.example', isPrimary: true },
    ],
    linkedCodes: [],
  },
  {
    _id: 'sfc-initech',
    sponsor: { _id: 'sp-initech', name: 'Initech' },
    contactPersons: [
      { _key: 'c3', name: 'Charlie', email: '', isPrimary: true }, // No email
    ],
    linkedCodes: ['INITECH-VIP'],
  },
]

describe('BulkDiscountSendModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.crmList.mockReturnValue({
      data: CRM_SPONSORS,
      isLoading: false,
      isFetching: false,
    })
    h.sendMutation.mockResolvedValue({ success: true, recipientCount: 1 })
  })

  afterEach(cleanup)

  it('correctly partitions eligible and skipped sponsors', () => {
    render(
      <BulkDiscountSendModal
        isOpen
        onClose={vi.fn()}
        conference={CONFERENCE}
        sponsors={[SPONSOR_1, SPONSOR_2, SPONSOR_3]}
        existingDiscounts={[]}
      />,
    )

    // Acme is eligible (1 code, valid email)
    expect(screen.getByText(/1 eligible sponsor/i)).toBeInTheDocument()

    // Globex (0 codes) and Initech (no email) are skipped
    expect(screen.getByText(/2 skipped/i)).toBeInTheDocument()

    // Expanding skipped shows reasons
    fireEvent.click(screen.getByText(/2 skipped/i))
    expect(screen.getByText('No discount codes created')).toBeInTheDocument()
    expect(screen.getByText('No contact email on file')).toBeInTheDocument()
  })

  it('shows an alert when the conference has no sponsorRegistrationLink', () => {
    render(
      <BulkDiscountSendModal
        isOpen
        onClose={vi.fn()}
        conference={{ ...CONFERENCE, sponsorRegistrationLink: null }}
        sponsors={[SPONSOR_1]}
        existingDiscounts={[]}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      /no sponsor ticket invite link set/i,
    )
  })

  it('sends personalized discount emails to eligible sponsors', async () => {
    const onSent = vi.fn()
    const onClose = vi.fn()

    render(
      <BulkDiscountSendModal
        isOpen
        onClose={onClose}
        conference={CONFERENCE}
        sponsors={[SPONSOR_1]}
        existingDiscounts={[]}
        onSent={onSent}
      />,
    )

    const sendBtn = screen.getByRole('button', { name: /Send to 1 sponsor/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(h.sendMutation).toHaveBeenCalledTimes(1)
    })

    expect(h.sendMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        sponsorForConferenceId: 'sfc-acme',
        kind: 'discount',
        recipientKeys: ['c1'],
        discountCodes: ['ACME-2026'],
        subject: expect.stringContaining(
          'Discount codes: Cloud Native Days 2026',
        ),
      }),
    )

    // Complete state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    })

    expect(h.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onSent).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('handles partial failures and informs organizer', async () => {
    const SPONSOR_4 = {
      id: 'sp-hooli',
      name: 'Hooli',
      sponsorForConferenceId: 'sfc-hooli',
      tier: { title: 'Gold', tagline: '', tierType: 'standard' as const },
      ticketEntitlement: 3,
      linkedCodes: ['HOOLI-100'],
    }

    h.crmList.mockReturnValue({
      data: [
        CRM_SPONSORS[0],
        {
          _id: 'sfc-hooli',
          sponsor: { _id: 'sp-hooli', name: 'Hooli' },
          contactPersons: [
            {
              _key: 'c4',
              name: 'Gavin',
              email: 'gavin@hooli.example',
              isPrimary: true,
            },
          ],
          linkedCodes: ['HOOLI-100'],
        },
      ],
      isLoading: false,
    })

    // First succeeds, second fails
    h.sendMutation
      .mockResolvedValueOnce({ success: true, recipientCount: 1 })
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))

    render(
      <BulkDiscountSendModal
        isOpen
        onClose={vi.fn()}
        conference={CONFERENCE}
        sponsors={[SPONSOR_1, SPONSOR_4]}
        existingDiscounts={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Send to 2 sponsors/i }))

    await waitFor(() => {
      expect(h.sendMutation).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    })

    expect(h.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Sending complete with errors',
      }),
    )
  })
})
