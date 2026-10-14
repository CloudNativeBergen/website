/**
 * @vitest-environment jsdom
 *
 * THE SEND MODAL ON THE "WORKSHOP EARLY ACCESS" KIND (#1347, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §8).
 *
 * The modal decides nothing about whether the link may be sent: it asks the
 * server (`sponsor.crm.earlyAccess.getSendReadiness`, the decision the Send
 * action itself refuses with) and shows the answer. So what is pinned here
 * is that it ASKS only on this kind, SHOWS the answer in the server's words,
 * and POSTS nothing while the answer is a refusal or is not known.
 *
 * EmailModal (editor, preview, draft storage) is stubbed to a surface that
 * exposes what this modal hands it, as in `SponsorSendModal.test.tsx`.
 */
import React from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { PortableTextBlock } from '@portabletext/editor'
import { mockContactPerson, mockSponsor } from '@/__mocks__/sponsor-data'

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  showNotification: vi.fn(),
  /** What `earlyAccess.getSendReadiness` answers, and how it was asked. */
  readiness: {} as {
    data?: unknown
    isLoading?: boolean
    isFetching?: boolean
    isError?: boolean
    error?: { message: string }
  },
  readinessAsked: [] as Array<{ input: unknown; options: unknown }>,
  /** The modal asked the server again (`refetch`). */
  refetch: vi.fn(),
  templates: [] as unknown[],
  /** Any other query or mutation of the other kinds that was reached. */
  otherKindsAsked: [] as string[],
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: {
        crm: {
          activities: {
            list: { invalidate: vi.fn() },
            listCommunications: { invalidate: vi.fn() },
          },
          discountCodeOptions: { invalidate: vi.fn() },
        },
      },
    }),
    sponsor: {
      crm: {
        sendCommunication: {
          useMutation: () => ({ mutateAsync: h.mutateAsync }),
        },
        discountCodeOptions: {
          useQuery: (_input: unknown, options: { enabled?: boolean }) => {
            if (options.enabled) h.otherKindsAsked.push('discountCodeOptions')
            return { data: undefined, isError: false, isFetching: false }
          },
        },
        earlyAccess: {
          getSendReadiness: {
            useQuery: (input: unknown, options: unknown) => {
              h.readinessAsked.push({ input, options })
              return { ...h.readiness, refetch: h.refetch }
            },
          },
        },
      },
      emailTemplates: {
        list: { useQuery: () => ({ data: h.templates, isLoading: false }) },
      },
      contractTemplates: {
        contractReadiness: {
          useQuery: (_input: unknown, options: { enabled?: boolean }) => {
            if (options.enabled) h.otherKindsAsked.push('contractReadiness')
            return { data: undefined, isError: false }
          },
        },
      },
    },
    conference: {
      updateSponsorRegistrationLink: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
    registration: {
      generateToken: {
        useMutation: () => ({
          mutateAsync: async () => {
            h.otherKindsAsked.push('generateToken')
            return { token: 't', url: 'https://example.test/x' }
          },
        }),
      },
    },
  },
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.showNotification }),
}))
vi.mock('@/components/admin/sponsor/SponsorTemplatePicker', () => ({
  SponsorTemplatePicker: ({
    selectedId,
    onApply,
  }: {
    selectedId: string
    onApply: (
      subject: string,
      body: PortableTextBlock[],
      template: { _id: string; subject: string },
    ) => void
  }) => (
    <div>
      <p data-testid="template">{selectedId || 'no template'}</p>
      <button
        type="button"
        onClick={() =>
          onApply('Sponsor news', [], {
            _id: 'tpl-default',
            subject: 'Sponsor news',
          })
        }
      >
        apply template
      </button>
    </div>
  ),
}))

/** The draft the stub's Send posts: the modal's starting text, unless a test replaces it. */
let draft: { subject: string; message: PortableTextBlock[] } | null = null
vi.mock('@/components/admin/EmailModal', () => ({
  EmailModal: ({
    isOpen,
    title,
    recipientInfo,
    warningContent,
    initialValues,
    onSend,
    submitButtonText,
    previewComponent,
    allowEmptyBody,
    templateSelector,
  }: {
    isOpen: boolean
    title: string
    recipientInfo: React.ReactNode
    warningContent?: React.ReactNode
    initialValues?: { subject?: string; message?: PortableTextBlock[] }
    onSend: (d: {
      subject: string
      message: PortableTextBlock[]
    }) => Promise<void>
    submitButtonText?: string
    previewComponent?: (d: {
      subject: string
      message: PortableTextBlock[]
      messageHTML: string
    }) => React.ReactNode
    allowEmptyBody?: boolean
    templateSelector?: (a: {
      setSubject: (s: string) => void
      setMessage: (b: PortableTextBlock[]) => void
    }) => React.ReactNode
  }) => {
    if (!isOpen) return null
    const current = draft ?? {
      subject: initialValues?.subject ?? '',
      message: initialValues?.message ?? [],
    }
    const text = current.message
      .map((b) =>
        ((b as { children?: Array<{ text?: string }> }).children ?? [])
          .map((c) => c.text ?? '')
          .join(''),
      )
      .join('\n')
    return (
      <div>
        <h2>{title}</h2>
        <p data-testid="subject">{current.subject}</p>
        <p data-testid="message">{text}</p>
        {allowEmptyBody && <span data-testid="allow-empty-body" />}
        <div data-testid="warnings">{warningContent}</div>
        <div data-testid="to">{recipientInfo}</div>
        {templateSelector?.({ setSubject: () => {}, setMessage: () => {} })}
        <div data-testid="preview">
          {previewComponent?.({
            ...current,
            messageHTML: `<p>${text}</p>`,
          })}
        </div>
        <button
          type="button"
          onClick={() =>
            onSend(current).catch((e: Error) => {
              h.showNotification({ type: 'error', title: e.message })
            })
          }
        >
          {submitButtonText ?? 'Send'}
        </button>
      </div>
    )
  },
}))
// The preview's frame is not this modal's: only what it is handed matters.
vi.mock('@/components/email/BroadcastTemplate', () => ({
  BroadcastTemplate: ({ content }: { content: React.ReactNode }) => (
    <div>{content}</div>
  ),
}))

import {
  SponsorSendModal,
  pickDefaultTemplate,
  type SendableKind,
} from '@/components/admin/sponsor/SponsorSendModal'
import type { SponsorEmailTemplate } from '@/lib/sponsor/types'

const LINK =
  'https://conf.example.org/workshop/early-access/4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'
/** 10:00 in Oslo on both days. */
const READY = {
  refusal: null,
  url: LINK,
  sponsorStart: '2026-09-24T08:00:00.000Z',
  officialOpening: '2026-10-01T08:00:00.000Z',
}
/** The server's words for each reason, as `getSendReadiness` hands them over. */
const REFUSALS = [
  [
    'localhost',
    'Workshop early access cannot be sent from localhost. Deploy to a production domain first.',
  ],
  [
    'no-window',
    'This conference has no early-access period. Under Workshops, set a "Sponsor Early Access Opens" time that is earlier than the time registration opens for everyone.',
  ],
  [
    'opening-passed',
    'The early-access period is over. Workshop registration has already opened for everyone or has closed, so a link gives no head start.',
  ],
  [
    'not-won',
    'Workshop early access can only be sent to a sponsor with a won deal. Move the sponsor to Closed Won first.',
  ],
  [
    'no-portal',
    'This conference has no working workshop portal: its main domain cannot sign attendees in yet. Verify the domain under Settings, then try again.',
  ],
] as const

/** What an organization may have flagged as its default templates. */
const DEFAULT_TEMPLATE = {
  _id: 'tpl-default',
  _createdAt: '',
  _updatedAt: '',
  title: 'Follow-up',
  slug: { current: 'follow-up' },
  category: 'follow-up',
  language: 'en',
  subject: 'Sponsor news',
  isDefault: true,
}
const DEFAULT_CONTRACT_TEMPLATE = {
  ...DEFAULT_TEMPLATE,
  _id: 'tpl-contract',
  title: 'Contract',
  slug: { current: 'contract-sent' },
  category: 'contract',
  subject: 'Your agreement',
}

const contacts = [
  mockContactPerson({
    _key: 'c-primary',
    name: 'Kari Nordmann',
    email: 'kari@acme.example',
    isPrimary: true,
  }),
  mockContactPerson({
    _key: 'c-second',
    name: 'Ola Nordmann',
    email: 'ola@acme.example',
  }),
]

function modal(
  kind: SendableKind = 'workshop-early-access',
  props: { isOpen?: boolean; onSent?: () => void } = {},
) {
  return (
    <SponsorSendModal
      isOpen={props.isOpen ?? true}
      kind={kind}
      onClose={vi.fn()}
      onSent={props.onSent}
      sponsorForConference={mockSponsor({
        _id: 'sfc-acme',
        contactPersons: contacts,
        status: 'closed-won',
      })}
      domain="conf.example.org"
      fromEmail="sponsors@conf.example.org"
      conference={{
        title: 'Cloud Native Days Bergen',
        city: 'Bergen',
        country: 'Norway',
        startDate: '2026-10-28',
        domains: ['conf.example.org'],
      }}
    />
  )
}
const renderModal = (...args: Parameters<typeof modal>) =>
  render(modal(...args))

const pressSend = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
const refusalShown = () => screen.getByTestId('warnings').textContent

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  draft = null
  h.readiness = { data: READY, isLoading: false, isFetching: false }
  h.readinessAsked = []
  h.otherKindsAsked = []
  h.templates = []
  h.mutateAsync.mockResolvedValue({ success: true, recipientCount: 1 })
})
afterEach(cleanup)

describe('asking the server', () => {
  it('asks whether the link may be sent to this sponsor when the modal is open on this kind', () => {
    renderModal()

    expect(h.readinessAsked.at(-1)).toMatchObject({
      input: { sponsorForConferenceId: 'sfc-acme' },
      options: { enabled: true },
    })
  })

  it('does not ask while the modal is closed', () => {
    renderModal('workshop-early-access', { isOpen: false })

    expect(h.readinessAsked.every((asked) => asked.options)).toBe(true)
    expect(
      h.readinessAsked.map(
        (asked) => (asked.options as { enabled: boolean }).enabled,
      ),
    ).toEqual(h.readinessAsked.map(() => false))
    expect(h.readinessAsked.length).toBeGreaterThan(0)
  })

  it.each(['information', 'discount', 'registration', 'contract'] as const)(
    'never asks on the %s kind: the host check is a live read',
    (kind) => {
      renderModal(kind)

      expect(h.readinessAsked).toEqual([])
    },
  )

  it('asks for nothing the other kinds ask for', async () => {
    renderModal()
    await screen.findByRole('button', { name: 'Send' })

    expect(h.otherKindsAsked).toEqual([])
  })
})

describe('a send that may go ahead', () => {
  it('is titled for the kind and starts from the built-in text, with no template, though the organization has defaults', () => {
    h.templates = [DEFAULT_TEMPLATE, DEFAULT_CONTRACT_TEMPLATE]
    // The same templates on an information send: one IS preselected.
    renderModal('information')
    expect(screen.getByTestId('template')).toHaveTextContent('tpl-default')
    expect(screen.getByTestId('subject')).toHaveTextContent('Sponsor news')
    cleanup()

    renderModal()

    expect(
      screen.getByRole('heading', { name: 'Send workshop early access' }),
    ).toBeVisible()
    expect(screen.getByTestId('subject')).toHaveTextContent(
      'Workshop early access: Cloud Native Days Bergen',
    )
    expect(screen.getByTestId('message').textContent).toBe(
      [
        'Thank you for sponsoring Cloud Native Days Bergen. As a sponsor, Acme Corporation gets early access to workshop sign-up: your colleagues who are attending can sign up before it opens for everyone.',
        'The link and the times are below. Seats in each workshop are limited, so it pays to sign up early.',
      ].join('\n'),
    )
    expect(screen.getByTestId('template')).toHaveTextContent('no template')
    expect(refusalShown()).toBe('')
  })

  it('posts the kind, the recipient keys and the text, and nothing of another kind', async () => {
    const onSent = vi.fn()
    renderModal('workshop-early-access', { onSent })

    pressSend()

    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    const posted = h.mutateAsync.mock.calls[0][0]
    expect(posted).toEqual({
      sponsorForConferenceId: 'sfc-acme',
      kind: 'workshop-early-access',
      recipientKeys: ['c-primary'],
      subject: 'Workshop early access: Cloud Native Days Bergen',
      message: expect.stringContaining('Thank you for sponsoring'),
    })
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Workshop early access sent',
        }),
      ),
    )
    expect(onSent).toHaveBeenCalledTimes(1)
  })

  it('previews the block the server appends, with the link the sponsor has and both times', () => {
    renderModal()

    const preview = screen.getByTestId('preview')
    expect(preview).toHaveTextContent(
      'With this link, workshop sign-up opens on Thursday, September 24, 2026 at 10:00 AM. For everyone else it opens on Thursday, October 1, 2026 at 10:00 AM.',
    )
    expect(
      screen.getByRole('link', { name: 'Open early access' }),
    ).toHaveAttribute('href', LINK)
    expect(screen.queryByText(/Sending creates/)).toBeNull()
  })

  it('says that sending creates the link when the sponsor has none, and previews no address', () => {
    h.readiness = { data: { ...READY, url: null }, isFetching: false }
    renderModal()

    expect(refusalShown()).toBe(
      'This sponsor has no early-access link yet. Sending creates it.',
    )
    expect(screen.queryByRole('link', { name: 'Open early access' })).toBeNull()
    expect(screen.getByTestId('preview')).toHaveTextContent(
      'The link is created when this email is sent, and appears here.',
    )
  })

  it('lets a message edited down to nothing be sent: the block is the email', async () => {
    renderModal()
    expect(screen.getByTestId('allow-empty-body')).toBeInTheDocument()
    cleanup()

    draft = { subject: 'Early access', message: [] }
    renderModal()
    pressSend()

    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      kind: 'workshop-early-access',
      message: '[]',
    })
  })

  it('warns when the link was created and an unpublished copy of the sponsor did not get it', async () => {
    h.mutateAsync.mockResolvedValue({
      success: true,
      recipientCount: 1,
      earlyAccessCopiesBehind: 2,
    })
    renderModal()

    pressSend()

    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith({
        type: 'warning',
        title: 'Unpublished copies without the link',
        message:
          'The email went out and the link works, but 2 unpublished copies of this sponsor in Sanity Studio did not get the link. Publishing one of them would remove the link. Discard them in Studio.',
      }),
    )
  })
})

describe('a send that is refused', () => {
  it.each(REFUSALS)(
    'shows the server’s refusal and posts nothing: %s',
    async (reason, message) => {
      h.readiness = {
        data: { refusal: { reason, message } },
        isFetching: false,
      }
      renderModal()

      expect(screen.getByRole('alert')).toHaveTextContent(message)
      expect(refusalShown()).toBe(`${message}Check again`)
      expect(screen.queryByTestId('allow-empty-body')).toBeNull()
      // No block is previewed for an email that cannot be sent.
      expect(screen.getByTestId('preview')).not.toHaveTextContent(
        'Early access to workshop sign-up',
      )

      pressSend()

      await waitFor(() =>
        expect(h.showNotification).toHaveBeenCalledWith({
          type: 'error',
          title: message,
        }),
      )
      expect(h.mutateAsync).not.toHaveBeenCalled()
    },
  )

  it('posts nothing while the answer is on its way', async () => {
    h.readiness = { data: undefined, isLoading: true, isFetching: true }
    renderModal()

    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking whether early access can be sent…',
    )
    pressSend()

    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith({
        type: 'error',
        title:
          'Still checking whether early access can be sent. Try again in a moment.',
      }),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })

  it('does not trust an answer that is being asked again: a reopened modal waits for the new one', async () => {
    h.readiness = { data: READY, isLoading: false, isFetching: true }
    renderModal()

    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking whether early access can be sent…',
    )
    pressSend()

    await waitFor(() => expect(h.showNotification).toHaveBeenCalled())
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })

  it('posts nothing when the server could not be asked, and says why', async () => {
    h.readiness = {
      data: undefined,
      isFetching: false,
      isError: true,
      error: {
        message: 'The "workshops" feature is not enabled for this organization',
      },
    }
    renderModal()

    const said =
      'Could not check whether early access can be sent: The "workshops" feature is not enabled for this organization'
    expect(screen.getByRole('alert')).toHaveTextContent(said)
    pressSend()

    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith({
        type: 'error',
        title: said,
      }),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })
})

describe('"Check again"', () => {
  const UNKNOWN =
    'Could not check whether early access can be sent: Failed to fetch'

  it.each([
    [
      'the server could not be asked',
      {
        data: undefined,
        isFetching: false,
        isError: true,
        error: { message: 'Failed to fetch' },
      },
      UNKNOWN,
    ],
    [
      'the server refuses the send',
      {
        data: { refusal: { reason: 'no-window', message: REFUSALS[1][1] } },
        isFetching: false,
      },
      REFUSALS[1][1],
    ],
  ])(
    'asks the server again when %s, and posts nothing by itself',
    (_case, readiness, said) => {
      h.readiness = readiness
      renderModal()
      expect(screen.getByRole('alert')).toHaveTextContent(said)
      expect(h.refetch).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Check again' }))

      expect(h.refetch).toHaveBeenCalledTimes(1)
      expect(h.mutateAsync).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['may go ahead', { data: READY, isFetching: false }],
    ['is being checked', { data: undefined, isFetching: true }],
  ])('is not offered while the send %s', (_case, readiness) => {
    h.readiness = readiness
    renderModal()

    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull()
  })

  // What a re-ask that FAILED leaves behind: the old answer, and an error.
  // The old answer is not the answer.
  it('is offered, and Send is held, when asking again failed though an older answer said ready', async () => {
    h.readiness = {
      data: READY,
      isFetching: false,
      isError: true,
      error: { message: 'Failed to fetch' },
    }
    renderModal()

    expect(screen.getByRole('alert')).toHaveTextContent(UNKNOWN)
    expect(screen.getByRole('button', { name: 'Check again' })).toBeVisible()
    expect(screen.queryByTestId('allow-empty-body')).toBeNull()
    expect(screen.getByTestId('preview')).not.toHaveTextContent(
      'Early access to workshop sign-up',
    )
    pressSend()

    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith({
        type: 'error',
        title: UNKNOWN,
      }),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })
})

describe('a modal left open while the answer changed', () => {
  const OPENING_PASSED = REFUSALS[2][1]

  it('asks the server again when the send is refused, and then holds Send with the refusal', async () => {
    // The official opening passed after the modal opened: it still says
    // "ready", and only the server knows better.
    h.mutateAsync.mockRejectedValue(new Error(OPENING_PASSED))
    const { rerender } = renderModal()
    expect(refusalShown()).toBe('')

    pressSend()

    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith({
        type: 'error',
        title: OPENING_PASSED,
      }),
    )
    expect(h.mutateAsync).toHaveBeenCalledTimes(1)
    expect(h.refetch).toHaveBeenCalledTimes(1)

    // The new answer arrives: the modal now says what the server said.
    h.readiness = {
      data: { refusal: { reason: 'opening-passed', message: OPENING_PASSED } },
      isFetching: false,
    }
    rerender(modal())
    expect(screen.getByRole('alert')).toHaveTextContent(OPENING_PASSED)
    expect(screen.queryByTestId('allow-empty-body')).toBeNull()

    h.showNotification.mockClear()
    pressSend()
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith({
        type: 'error',
        title: OPENING_PASSED,
      }),
    )
    // Held: nothing was posted a second time.
    expect(h.mutateAsync).toHaveBeenCalledTimes(1)
  })

  // A draft that started from a template since deleted is sent again without
  // it. When THAT send is refused, the modal is as far behind as after any
  // other refusal.
  it('asks the server again when the send without a deleted template is refused too', async () => {
    h.mutateAsync
      .mockRejectedValueOnce(new Error('Template not found'))
      .mockRejectedValueOnce(new Error(OPENING_PASSED))
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'apply template' }))

    pressSend()

    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith({
        type: 'error',
        title: OPENING_PASSED,
      }),
    )
    expect(h.mutateAsync).toHaveBeenCalledTimes(2)
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      template: { id: 'tpl-default' },
    })
    expect(h.mutateAsync.mock.calls[1][0]).not.toHaveProperty('template')
    expect(h.refetch).toHaveBeenCalledTimes(1)
  })

  it('does not ask again when the send without a deleted template goes out', async () => {
    h.mutateAsync
      .mockRejectedValueOnce(new Error('Template not found'))
      .mockResolvedValueOnce({ success: true, recipientCount: 1 })
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'apply template' }))

    pressSend()

    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      ),
    )
    expect(h.mutateAsync).toHaveBeenCalledTimes(2)
    expect(h.refetch).not.toHaveBeenCalled()
  })

  it('does not ask again after a send that went out', async () => {
    renderModal()

    pressSend()

    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      ),
    )
    expect(h.refetch).not.toHaveBeenCalled()
  })
})

describe('pickDefaultTemplate', () => {
  it('never preselects a template for a workshop early-access send', () => {
    const template = {
      _id: 'tpl',
      _createdAt: '',
      _updatedAt: '',
      title: 'T',
      slug: { current: 't' },
      category: 'follow-up',
      language: 'en',
      subject: 'S',
      isDefault: true,
    } as SponsorEmailTemplate

    expect(pickDefaultTemplate([template], 'information', {})).toBe(template)
    expect(
      pickDefaultTemplate([template], 'workshop-early-access', {}),
    ).toBeUndefined()
  })
})
