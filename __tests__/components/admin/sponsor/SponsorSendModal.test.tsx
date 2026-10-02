/**
 * @vitest-environment jsdom
 *
 * THE SEND MODAL'S OWN RULES (#1261): what it posts and what it preselects.
 * EmailModal (editor, preview, draft storage) is stubbed to a surface that
 * exposes `onSend` and renders the To: line and the template slot, so every
 * assertion here is about SponsorSendModal — recipient KEYS only, the primary
 * contact preselected, template provenance and the edited flag.
 */
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import type { PortableTextBlock } from '@portabletext/editor'
import { mockContactPerson, mockSponsor } from '@/__mocks__/sponsor-data'

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  invalidateList: vi.fn(),
  invalidateComms: vi.fn(),
  showNotification: vi.fn(),
  applied: null as null | {
    subject: string
    body: PortableTextBlock[]
    template: { _id: string }
  },
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: {
        crm: {
          activities: {
            list: { invalidate: h.invalidateList },
            listCommunications: { invalidate: h.invalidateComms },
          },
        },
      },
    }),
    sponsor: {
      crm: {
        sendCommunication: {
          useMutation: () => ({ mutateAsync: h.mutateAsync }),
        },
      },
    },
  },
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.showNotification }),
}))
vi.mock('@/components/admin/sponsor/SponsorTemplatePicker', () => ({
  SponsorTemplatePicker: ({
    onApply,
  }: {
    onApply: (
      subject: string,
      body: PortableTextBlock[],
      template: { _id: string },
    ) => void
  }) => (
    <button
      type="button"
      onClick={() => {
        const body = [
          {
            _type: 'block',
            _key: 'tpl-b1',
            style: 'normal',
            children: [
              { _type: 'span', _key: 'tpl-s1', text: 'From template' },
            ],
          },
        ] as unknown as PortableTextBlock[]
        const template = { _id: 'tpl-1' }
        h.applied = { subject: 'Template subject', body, template }
        onApply('Template subject', body, template)
      }}
    >
      apply template
    </button>
  ),
}))

/** EmailModal stub: To: line, template slot, and a Send that posts the given draft. */
let draft: { subject: string; message: PortableTextBlock[] } = {
  subject: '',
  message: [],
}
vi.mock('@/components/admin/EmailModal', () => ({
  EmailModal: ({
    recipientInfo,
    templateSelector,
    onSend,
    submitButtonText,
    warningContent,
  }: {
    warningContent?: React.ReactNode
    recipientInfo: React.ReactNode
    templateSelector?: (a: {
      setSubject: (s: string) => void
      setMessage: (b: PortableTextBlock[]) => void
    }) => React.ReactNode
    onSend: (d: {
      subject: string
      message: PortableTextBlock[]
    }) => Promise<void>
    submitButtonText?: string
  }) => (
    <div>
      {warningContent}
      <div data-testid="to">{recipientInfo}</div>
      {templateSelector?.({
        setSubject: (s) => {
          draft = { ...draft, subject: s }
        },
        setMessage: (b) => {
          draft = { ...draft, message: b }
        },
      })}
      <button
        type="button"
        onClick={() =>
          onSend(draft).catch((e: Error) => {
            h.showNotification({ type: 'error', title: e.message })
          })
        }
      >
        {submitButtonText ?? 'Send'}
      </button>
    </div>
  ),
}))

import {
  SponsorSendModal,
  isTemplateEdited,
} from '@/components/admin/sponsor/SponsorSendModal'

const contacts = [
  mockContactPerson({
    _key: 'c-billing',
    name: 'Ola Nordmann',
    email: 'ola@acme.example',
    role: 'Billing Reference',
  }),
  mockContactPerson({
    _key: 'c-primary',
    name: 'Kari Nordmann',
    email: 'kari@acme.example',
    isPrimary: true,
  }),
  mockContactPerson({ _key: 'c-noemail', name: 'Per Hansen', email: '' }),
]

function renderModal(
  overrides: Partial<Parameters<typeof mockSponsor>[0]> = {},
) {
  return render(
    <SponsorSendModal
      isOpen
      onClose={vi.fn()}
      sponsorForConference={mockSponsor({
        contactPersons: contacts,
        ...overrides,
      })}
      domain="example.test"
      fromEmail="sponsors@example.test"
      conference={{
        title: 'Conf',
        city: 'Bergen',
        country: 'Norway',
        startDate: '2026-10-28',
        domains: ['example.test'],
      }}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  h.applied = null
  draft = { subject: 'Hand-written subject', message: [] }
  h.mutateAsync.mockResolvedValue({ success: true, recipientCount: 1 })
})
afterEach(cleanup)

describe('recipients', () => {
  it('preselects the primary contact even when it is not listed first', () => {
    renderModal()
    expect(
      screen.getByRole('checkbox', { name: 'Kari Nordmann' }),
    ).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Ola Nordmann' }),
    ).not.toBeChecked()
  })

  it('shows a contact without an email as disabled', () => {
    renderModal()
    expect(
      screen.getByRole('checkbox', { name: 'Per Hansen (no email)' }),
    ).toBeDisabled()
  })

  it('posts contact KEYS only — never an address — for every ticked contact', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ola Nordmann' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send to 2 contacts' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    const posted = h.mutateAsync.mock.calls[0][0]
    expect(posted).toMatchObject({
      sponsorForConferenceId: 'sfc-123',
      kind: 'information',
      subject: 'Hand-written subject',
    })
    expect([...posted.recipientKeys].sort()).toEqual(['c-billing', 'c-primary'])
    expect(JSON.stringify(posted)).not.toContain('@acme.example')
    expect(posted.template).toBeUndefined()
  })

  it('refuses to post with no recipient ticked', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Kari Nordmann' }))
    expect(
      screen.getByText('Choose at least one recipient before sending.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Choose at least one recipient' }),
      ),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })
})

describe('template provenance', () => {
  it('records the template id and edited=false when sent as applied', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'apply template' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0].template).toEqual({
      id: 'tpl-1',
      edited: false,
    })
  })

  it('records edited=true when the subject was changed after applying', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'apply template' }))
    draft = { ...draft, subject: 'Changed by hand' }
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0].template).toEqual({
      id: 'tpl-1',
      edited: true,
    })
  })

  it('invalidates the timeline and the Sent emails tab after a send', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.invalidateList).toHaveBeenCalled())
    expect(h.invalidateComms).toHaveBeenCalled()
  })
})

describe('isTemplateEdited', () => {
  const body = [
    {
      _type: 'block',
      _key: 'a',
      children: [{ _type: 'span', _key: 'b', text: 'x' }],
    },
  ] as unknown as PortableTextBlock[]
  const applied = { id: 't', subject: 'S', body }

  it('ignores re-keyed but otherwise identical blocks', () => {
    const rekeyed = [
      {
        _type: 'block',
        _key: 'zzz',
        children: [{ _type: 'span', _key: 'yyy', text: 'x' }],
      },
    ] as unknown as PortableTextBlock[]
    expect(isTemplateEdited(applied, { subject: 'S', message: rekeyed })).toBe(
      false,
    )
  })

  it('flags a changed span', () => {
    const changed = [
      {
        _type: 'block',
        _key: 'a',
        children: [{ _type: 'span', _key: 'b', text: 'y' }],
      },
    ] as unknown as PortableTextBlock[]
    expect(isTemplateEdited(applied, { subject: 'S', message: changed })).toBe(
      true,
    )
  })
})
