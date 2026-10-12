/**
 * @vitest-environment jsdom
 *
 * The workshop early-access section of a sponsor's record (#1346, spec §8):
 * no link, link, and the revoke confirmation. The address is asked for on
 * create and on copy; VIEWING the record asks for nothing, because finding the
 * portal's working host is a live read.
 */
import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

const URL_OF_LINK =
  'https://conf.example.org/workshop/early-access/4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'

type Options = {
  onSuccess?: (data: never) => void
  onError?: (error: { message: string }) => void
}
const h = vi.hoisted(() => ({
  create: vi.fn(),
  revoke: vi.fn(),
  address: vi.fn(),
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: { crm: { earlyAccess: { address: { fetch: h.address } } } },
    }),
    sponsor: {
      crm: {
        earlyAccess: {
          create: {
            useMutation: (options: Options) => ({
              mutate: (input: unknown) => h.create(input, options),
              isPending: false,
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

const writeText = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  writeText.mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  h.address.mockResolvedValue({ url: URL_OF_LINK })
  h.create.mockImplementation((_input, options: Options) =>
    options.onSuccess?.({ url: URL_OF_LINK } as never),
  )
  h.revoke.mockImplementation((_input, options: Options) =>
    options.onSuccess?.({ success: true } as never),
  )
})
afterEach(cleanup)

const NOT_WON =
  'Move the sponsor to Closed Won before creating an early-access link.'
const section = (props: { hasLink: boolean; createRefusal?: string }) => (
  <SponsorEarlyAccessSection
    sponsorForConferenceId="sfc-1"
    createRefusal={props.createRefusal}
    hasLink={props.hasLink}
    onChanged={onChanged}
  />
)
const onChanged = vi.fn()

describe('viewing the record', () => {
  it.each([
    ['a sponsor with a link', true],
    ['a sponsor without one', false],
  ])('asks for no address and creates nothing: %s', (_case, hasLink) => {
    render(section({ hasLink }))

    expect(h.address).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('a sponsor without a link', () => {
  it('creates one on request and shows its address', () => {
    render(section({ hasLink: false }))

    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))

    expect(h.create).toHaveBeenCalledTimes(1)
    expect(h.create.mock.calls[0][0]).toEqual({
      sponsorForConferenceId: 'sfc-1',
    })
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeVisible()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('says why no link can be created when the server refuses', () => {
    h.create.mockImplementation((_input, options: Options) =>
      options.onError?.({
        message: 'This conference has no working workshop portal.',
      }),
    )
    render(section({ hasLink: false }))

    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This conference has no working workshop portal.',
    )
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('offers no create for a deal that is not won, and says what to do', () => {
    render(section({ hasLink: false, createRefusal: NOT_WON }))

    expect(screen.queryByRole('button', { name: 'Create link' })).toBeNull()
    expect(screen.getByText(NOT_WON)).toBeVisible()
  })
})

describe('a sponsor with a link', () => {
  it('fetches the address when Copy link is pressed, shows it and copies it', async () => {
    render(section({ hasLink: true }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })

    expect(h.address).toHaveBeenCalledTimes(1)
    expect(h.address.mock.calls[0][0]).toEqual({
      sponsorForConferenceId: 'sfc-1',
    })
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
    expect(writeText).toHaveBeenCalledWith(URL_OF_LINK)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible(),
    )
  })

  it('still shows the address when the browser refuses the clipboard', async () => {
    writeText.mockRejectedValue(new Error('NotAllowedError'))
    render(section({ hasLink: true }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })

    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
  })

  it('keeps working for a deal that is no longer won', () => {
    render(section({ hasLink: true, createRefusal: NOT_WON }))

    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeVisible()
  })
})

describe('revoking', () => {
  it('asks first and says what it does', () => {
    render(section({ hasLink: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    expect(h.revoke).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'New early sign-ups through this link stop at once. Sign-ups already made stay.',
      ),
    ).toBeVisible()
  })

  it('does nothing when the organizer keeps the link', () => {
    render(section({ hasLink: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    fireEvent.click(screen.getByRole('button', { name: 'Keep link' }))

    expect(h.revoke).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible()
  })

  it('revokes on confirmation and goes back to "no link"', () => {
    render(section({ hasLink: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))

    expect(h.revoke).toHaveBeenCalledTimes(1)
    expect(h.revoke.mock.calls[0][0]).toEqual({
      sponsorForConferenceId: 'sfc-1',
    })
    expect(screen.getByRole('button', { name: 'Create link' })).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
