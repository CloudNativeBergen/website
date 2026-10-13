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
  within,
} from '@testing-library/react'

const NEW_URL =
  'https://conf.example.org/workshop/early-access/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
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
      sponsor: { crm: { earlyAccess: { getAddress: { fetch: h.address } } } },
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
    options.onSuccess?.({ url: URL_OF_LINK, notWritten: [] } as never),
  )
  h.revoke.mockImplementation((_input, options: Options) =>
    options.onSuccess?.({ success: true, notCleared: [] } as never),
  )
})
afterEach(cleanup)

const NOT_WON =
  'Move the sponsor to Closed Won before creating an early-access link.'
const section = (props: {
  hasLink: boolean
  createRefusal?: string
  copyRefusal?: string
  recordUpdatedAt?: string
  sponsorStartSet?: boolean
}) => (
  <SponsorEarlyAccessSection
    sponsorForConferenceId="sfc-1"
    createRefusal={props.createRefusal}
    copyRefusal={props.copyRefusal}
    sponsorStartSet={props.sponsorStartSet}
    hasLink={props.hasLink}
    recordUpdatedAt={props.recordUpdatedAt}
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

describe('what the section says the link does', () => {
  it('names the time by the label the workshop settings give it', () => {
    render(section({ hasLink: false, sponsorStartSet: true }))

    expect(
      screen.getByText(
        'A link the sponsor can pass on to its people. Whoever opens it can sign up for workshops from the time set as “Sponsor Early Access Opens”, before registration opens for everyone. They still need a ticket that includes workshops.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/gives no head start/)).toBeNull()
  })

  it('says so when the conference has no such time set, and where to set it', () => {
    render(section({ hasLink: true, sponsorStartSet: false }))

    expect(
      screen.getByText(
        'No “Sponsor Early Access Opens” time is set for this conference, so a link gives no head start yet. Set one under Workshops.',
      ),
    ).toBeVisible()
    // Known from the conference the page already has: nothing is asked for.
    expect(h.address).not.toHaveBeenCalled()
  })
})

describe('keyboard focus and what is announced', () => {
  const focused = () => document.activeElement
  const button = (name: string) => screen.getByRole('button', { name })
  const press = (name: string) => {
    button(name).focus()
    fireEvent.click(button(name))
  }

  it('after Create link, focus is on Copy link, and "Link created" is announced', () => {
    render(section({ hasLink: false }))

    press('Create link')

    expect(focused()).toBe(button('Copy link'))
    expect(screen.getByRole('status')).toHaveTextContent('Link created')
  })

  it('after Revoke, focus is on Keep link; after Keep link, back on Revoke', () => {
    render(section({ hasLink: true }))

    press('Revoke')
    expect(focused()).toBe(button('Keep link'))

    press('Keep link')
    expect(focused()).toBe(button('Revoke'))
  })

  it('after Revoke link, focus is on Create link, and "Link revoked" is announced', () => {
    render(section({ hasLink: true }))
    press('Revoke')

    press('Revoke link')

    expect(focused()).toBe(button('Create link'))
    expect(screen.getByRole('status')).toHaveTextContent('Link revoked')
  })

  it('after Revoke link with no Create to go to, focus is on the section’s heading', () => {
    render(section({ hasLink: true, createRefusal: NOT_WON }))
    press('Revoke')

    press('Revoke link')

    expect(focused()).toBe(
      screen.getByRole('heading', { name: 'Workshop early access' }),
    )
  })

  it('Copy link keeps focus while the address is asked for and after it has come', async () => {
    let arrive: (answer: { url: string }) => void = () => {}
    h.address.mockReturnValue(
      new Promise((resolve) => {
        arrive = resolve
      }),
    )
    render(section({ hasLink: true }))

    press('Copy link')
    // Busy, and still focusable: it is not `disabled`.
    expect(button('Copy link')).toHaveAttribute('aria-disabled', 'true')
    expect(button('Copy link')).not.toBeDisabled()
    expect(focused()).toBe(button('Copy link'))

    await act(async () => arrive({ url: URL_OF_LINK }))
    expect(focused()).toBe(screen.getByRole('button', { name: /Cop/ }))
  })

  it('a button that is busy does nothing when pressed again', async () => {
    h.address.mockReturnValue(new Promise(() => {}))
    render(section({ hasLink: true }))
    press('Copy link')

    press('Copy link')
    press('Revoke')

    expect(h.address).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Revoke link' })).toBeNull()
  })

  it('announces nothing before anything was done', () => {
    render(section({ hasLink: true }))

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
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

  it('shows the link and says which copies did not get it, and what to do', () => {
    h.create.mockImplementation((_input, options: Options) =>
      options.onSuccess?.({
        url: URL_OF_LINK,
        notWritten: ['drafts.sfc-1', 'versions.rSpring.sfc-1'],
      } as never),
    )
    render(section({ hasLink: false }))

    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))

    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The link works, but 2 unpublished copies of this sponsor in Sanity Studio did not get it. Publishing one of them would remove the link. Try again, or discard them in Studio.',
    )
  })

  it('trying again writes the same link to the copies, and the warning goes when none is left behind', () => {
    h.create.mockImplementationOnce((_input, options: Options) =>
      options.onSuccess?.({
        url: URL_OF_LINK,
        notWritten: ['drafts.sfc-1'],
      } as never),
    )
    render(section({ hasLink: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))
    expect(screen.getByRole('alert')).toHaveTextContent('1 unpublished copy')

    // The next create answers the same address, with every copy written.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(h.create).toHaveBeenCalledTimes(2)
    expect(h.create.mock.calls[1][0]).toEqual({
      sponsorForConferenceId: 'sfc-1',
    })
    expect(h.revoke).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('trying again keeps the warning, with the new count, while a copy is still behind', () => {
    h.create.mockImplementation((_input, options: Options) =>
      options.onSuccess?.({
        url: URL_OF_LINK,
        notWritten:
          h.create.mock.calls.length === 1
            ? ['drafts.sfc-1', 'versions.rSpring.sfc-1']
            : ['versions.rSpring.sfc-1'],
      } as never),
    )
    render(section({ hasLink: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))
    expect(screen.getByRole('alert')).toHaveTextContent('2 unpublished copies')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByRole('alert')).toHaveTextContent('1 unpublished copy')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
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

  it('asks the server again on every copy: a link a colleague revoked and created again is not handed out', async () => {
    render(section({ hasLink: true }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()

    h.address.mockResolvedValue({ url: NEW_URL })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cop/ }))
    })

    expect(h.address).toHaveBeenCalledTimes(2)
    expect(screen.getByDisplayValue(NEW_URL)).toBeVisible()
    expect(screen.queryByDisplayValue(URL_OF_LINK)).toBeNull()
    expect(writeText).toHaveBeenLastCalledWith(NEW_URL)
  })

  it('says so when the copy fails, and leaves the address to be selected', async () => {
    writeText.mockRejectedValue(new Error('NotAllowedError'))
    render(section({ hasLink: true }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not copy the link. Select it above and copy it by hand.',
    )
    const field = screen.getByDisplayValue(URL_OF_LINK)
    expect(field).toBeVisible()
    expect(field).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
  })

  it('says so when the browser has no clipboard at all', async () => {
    Object.assign(navigator, { clipboard: undefined })
    render(section({ hasLink: true }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not copy the link. Select it above and copy it by hand.',
    )
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
  })

  it('the next copy that works takes the failure away', async () => {
    writeText.mockRejectedValueOnce(new Error('NotAllowedError'))
    render(section({ hasLink: true }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
    expect(screen.getByRole('alert')).toBeVisible()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible()
  })

  it('keeps working for a deal that is no longer won', () => {
    render(section({ hasLink: true, createRefusal: NOT_WON }))

    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeVisible()
  })
})

describe('copying where the browser allows a clipboard write only inside the click', () => {
  // Safari refuses a write that comes after an awaited request. A
  // `ClipboardItem` built from the pending address is written in the click.
  class FakeClipboardItem {
    constructor(public items: Record<string, Promise<Blob>>) {}
  }
  const write = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    write.mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { write, writeText } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('writes to the clipboard before the address has arrived, and fills it in when it does', async () => {
    let arrive: (answer: { url: string }) => void = () => {}
    h.address.mockReturnValue(
      new Promise((resolve) => {
        arrive = resolve
      }),
    )
    render(section({ hasLink: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    // Still waiting for the server, and the write has been made.
    expect(write).toHaveBeenCalledTimes(1)
    const [item] = write.mock.calls[0][0] as FakeClipboardItem[]
    await act(async () => arrive({ url: URL_OF_LINK }))
    expect(await (await item.items['text/plain']).text()).toBe(URL_OF_LINK)
    expect(writeText).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible(),
    )
  })

  it('falls back to a plain write when that one is refused', async () => {
    write.mockRejectedValue(new Error('NotAllowedError'))
    render(section({ hasLink: true }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })

    expect(writeText).toHaveBeenCalledWith(URL_OF_LINK)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible()
  })

  it('says so when both are refused', async () => {
    write.mockRejectedValue(new Error('NotAllowedError'))
    writeText.mockRejectedValue(new Error('NotAllowedError'))
    render(section({ hasLink: true }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not copy the link. Select it above and copy it by hand.',
    )
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
  })
})

describe('the record is refreshed', () => {
  it('after a create here, a revoke by a colleague shows', () => {
    const { rerender } = render(section({ hasLink: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()

    // The refresh confirms the create, then a later one shows the revoke.
    rerender(section({ hasLink: true }))
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
    rerender(section({ hasLink: false }))

    expect(screen.getByRole('button', { name: 'Create link' })).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('after a revoke here, a create by a colleague shows, without the old address', async () => {
    const { rerender } = render(section({ hasLink: true }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    expect(screen.getByRole('button', { name: 'Create link' })).toBeVisible()

    rerender(section({ hasLink: false }))
    rerender(section({ hasLink: true }))

    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('a link a colleague revoked and created again is not shown with the address copied before', async () => {
    const { rerender } = render(section({ hasLink: true }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()

    rerender(section({ hasLink: false }))
    rerender(section({ hasLink: true }))

    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('a link that opens nothing: workshops were turned off', () => {
  const OFF =
    'Workshops are not enabled for this conference, so this link opens nothing.'

  it('offers no copy, says why in one line, and keeps revoke', () => {
    render(section({ hasLink: true, createRefusal: OFF, copyRefusal: OFF }))

    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
    expect(screen.getByText(OFF)).toBeVisible()
    expect(h.address).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    expect(h.revoke).toHaveBeenCalledTimes(1)
  })

  it('the same sponsor with workshops on can copy', () => {
    render(section({ hasLink: true }))

    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible()
    expect(screen.queryByText(OFF)).toBeNull()
  })
})

describe('the record read again after this section acted', () => {
  // The refetch that follows a create or a revoke brings a record with a new
  // `_updatedAt`. From then on the record is the truth, also when it says
  // what it said before: a colleague undid it in between.
  const BEFORE = '2026-10-13T10:00:00Z'
  const AFTER = '2026-10-13T10:00:05Z'

  it('created here, revoked by a colleague before the refetch landed: no link is shown', () => {
    const { rerender } = render(
      section({ hasLink: false, recordUpdatedAt: BEFORE }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()

    // The refetch: still no link, and the record has changed.
    rerender(section({ hasLink: false, recordUpdatedAt: AFTER }))

    expect(screen.getByRole('button', { name: 'Create link' })).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull()
  })

  it('revoked here, created by a colleague before the refetch landed: the link is shown, without an address', () => {
    const { rerender } = render(
      section({ hasLink: true, recordUpdatedAt: BEFORE }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    expect(screen.getByRole('button', { name: 'Create link' })).toBeVisible()

    rerender(section({ hasLink: true, recordUpdatedAt: AFTER }))

    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('created here and confirmed by the refetch: the address stays', () => {
    const { rerender } = render(
      section({ hasLink: false, recordUpdatedAt: BEFORE }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))

    rerender(section({ hasLink: true, recordUpdatedAt: AFTER }))

    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
  })

  it('a render that brings the same record changes nothing', () => {
    const { rerender } = render(
      section({ hasLink: false, recordUpdatedAt: BEFORE }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))

    rerender(section({ hasLink: false, recordUpdatedAt: BEFORE }))

    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
  })
})

describe('a warning about copies belongs to what this section did', () => {
  it('a create that left a copy behind, then a colleague revokes: nothing is said about copies', () => {
    h.create.mockImplementation((_input, options: Options) =>
      options.onSuccess?.({
        url: URL_OF_LINK,
        notWritten: ['drafts.sfc-1'],
      } as never),
    )
    const { rerender } = render(section({ hasLink: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))
    // The record confirms the create: the warning stays.
    rerender(section({ hasLink: true }))
    expect(screen.getByRole('alert')).toHaveTextContent('did not get it')

    // A colleague revokes, cleanly.
    rerender(section({ hasLink: false }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Create link' })).toBeVisible()
  })

  it('a revoke that left a copy holding the link, then a colleague creates: nothing is said about copies', () => {
    h.revoke.mockImplementation((_input, options: Options) =>
      options.onSuccess?.({
        success: true,
        notCleared: ['versions.rSpring.sfc-1'],
      } as never),
    )
    const { rerender } = render(section({ hasLink: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    // The record confirms the revoke: the warning stays.
    rerender(section({ hasLink: false }))
    expect(screen.getByRole('alert')).toHaveTextContent('still holds it')

    // A colleague creates a link.
    rerender(section({ hasLink: true }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible()
  })
})

describe('a copy of a link a colleague has revoked', () => {
  it('shows the server’s answer and asks for the record to be read again', async () => {
    h.address.mockRejectedValue(
      new Error('This sponsor has no early-access link.'),
    )
    render(section({ hasLink: true }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This sponsor has no early-access link.',
    )
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})

describe('a copy while an earlier one has failed', () => {
  it('says nothing about a failed copy while the address is being asked for again', async () => {
    h.address.mockRejectedValueOnce(new Error('No such link'))
    render(section({ hasLink: true }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
    // The address did not arrive: that error, and no word about copying.
    expect(screen.getByRole('alert')).toHaveTextContent('No such link')

    let arrive: (answer: { url: string }) => void = () => {}
    h.address.mockReturnValue(
      new Promise((resolve) => {
        arrive = resolve
      }),
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })

    // Still waiting for the server.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/Could not copy/)).toBeNull()

    await act(async () => arrive({ url: URL_OF_LINK }))
    expect(screen.getByDisplayValue(URL_OF_LINK)).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('revoking', () => {
  it('says which copies could not be cleared, and what to do about them', () => {
    h.revoke.mockImplementation((_input, options: Options) =>
      options.onSuccess?.({
        success: true,
        notCleared: ['versions.rSpring.sfc-1'],
      } as never),
    )
    render(section({ hasLink: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The link is revoked, but 1 unpublished copy of this sponsor in Sanity Studio still holds it. Publishing it would make the link work again. Try again, or discard it in Studio.',
    )
    expect(screen.getByRole('button', { name: 'Create link' })).toBeVisible()
  })

  it('trying again revokes once more, and the warning goes when nothing is left', () => {
    h.revoke.mockImplementationOnce((_input, options: Options) =>
      options.onSuccess?.({
        success: true,
        notCleared: ['versions.rSpring.sfc-1'],
      } as never),
    )
    render(section({ hasLink: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    expect(screen.getByRole('alert')).toHaveTextContent('still holds it')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(h.revoke).toHaveBeenCalledTimes(2)
    expect(h.create).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('the Try again button is beside the warning, not inside what is announced', () => {
    h.revoke.mockImplementation((_input, options: Options) =>
      options.onSuccess?.({
        success: true,
        notCleared: ['versions.rSpring.sfc-1'],
      } as never),
    )
    render(section({ hasLink: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))

    expect(within(screen.getByRole('alert')).queryByRole('button')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

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
