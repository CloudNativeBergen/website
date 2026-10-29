/**
 * @vitest-environment jsdom
 *
 * THE SEND ACTION of the workshop early-access section on a sponsor's record
 * (#1347, spec §8): "an action to create one and an action to send the
 * email". The section only RAISES the intent; the host owns the Send modal,
 * which asks the server whether the link may be sent.
 *
 * In a file of its own: the section's other behaviour is pinned in
 * `SponsorEarlyAccessSection.test.tsx`.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

type Options = { onSuccess?: (data: never) => void }
const h = vi.hoisted(() => ({
  create: vi.fn(),
  revoke: vi.fn(),
  address: vi.fn(),
  /** A create is on its way: the mutation reports itself pending. */
  creating: false,
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: { crm: { earlyAccess: { getAddress: { fetch: h.address } } } },
    }),
    sponsor: {
      crm: {
        earlyAccess: {
          create: {
            useMutation: (options: Options) => ({
              mutate: (input: unknown) => h.create(input, options),
              isPending: h.creating,
            }),
          },
          revoke: {
            useMutation: (options: Options) => ({
              mutate: (input: unknown) => h.revoke(input, options),
              isPending: false,
            }),
          },
        },
      },
    },
  },
}))

import { SponsorEarlyAccessSection } from '@/components/admin/sponsor-crm/SponsorEarlyAccessSection'

const onSend = vi.fn()
const section = (props: {
  hasLink: boolean
  createRefusal?: string
  onSend?: () => void
}) => <SponsorEarlyAccessSection sponsorForConferenceId="sfc-1" {...props} />
const sendButton = () => screen.queryByRole('button', { name: 'Send by email' })

beforeEach(() => {
  vi.clearAllMocks()
  h.creating = false
})
afterEach(cleanup)

describe('the send action', () => {
  it.each([
    ['a sponsor without a link, beside Create link', false, 'Create link'],
    ['a sponsor with a link, beside Copy link', true, 'Copy link'],
  ])(
    'is offered for %s, and raises the intent once',
    (_case, hasLink, beside) => {
      render(section({ hasLink, onSend }))

      expect(screen.getByRole('button', { name: beside })).toBeVisible()
      fireEvent.click(sendButton()!)

      expect(onSend).toHaveBeenCalledTimes(1)
      // Raising the intent creates nothing and asks for no address.
      expect(h.create).not.toHaveBeenCalled()
      expect(h.address).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['without a link', false],
    ['with a link', true],
  ])('is not offered when the host cannot send: %s', (_case, hasLink) => {
    render(section({ hasLink }))

    expect(sendButton()).toBeNull()
    // The section itself is there.
    expect(
      screen.getByRole('heading', { name: 'Workshop early access' }),
    ).toBeVisible()
  })

  it('is not offered where no link can be created: the reason is shown instead', () => {
    const reason =
      'Move the sponsor to Closed Won before creating an early-access link.'
    render(section({ hasLink: false, createRefusal: reason, onSend }))

    expect(screen.getByText(reason)).toBeVisible()
    expect(sendButton()).toBeNull()
  })

  it('stays offered for a sponsor with a link whose deal is no longer won: the Send modal says why it is refused', () => {
    render(
      section({
        hasLink: true,
        createRefusal:
          'Move the sponsor to Closed Won before creating an early-access link.',
        onSend,
      }),
    )

    fireEvent.click(sendButton()!)
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('does nothing while a create is on its way', () => {
    h.creating = true
    render(section({ hasLink: false, onSend }))

    expect(sendButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(sendButton()!)

    expect(onSend).not.toHaveBeenCalled()
  })

  it('makes way for the revoke confirmation', () => {
    render(section({ hasLink: true, onSend }))

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    expect(screen.getByText('Revoke this link?')).toBeVisible()
    expect(sendButton()).toBeNull()
  })
})
