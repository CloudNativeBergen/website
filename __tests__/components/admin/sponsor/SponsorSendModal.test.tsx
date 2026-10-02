/**
 * @vitest-environment jsdom
 *
 * THE SEND MODAL'S OWN RULES (#1261): what it posts and what it preselects.
 * EmailModal (editor, preview, draft storage) is stubbed to a surface that
 * exposes `onSend` and renders the To: line and the template slot, so every
 * assertion here is about SponsorSendModal — recipient KEYS only, the primary
 * contact preselected, template provenance and the edited flag.
 */
import React from 'react'
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
  templates: [] as unknown[],
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
      emailTemplates: {
        list: { useQuery: () => ({ data: h.templates, isLoading: false }) },
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
        const template = {
          _id: 'tpl-1',
          subject: 'Template subject',
          body,
        }
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
    initialValues,
    isOpen,
    onClearDraft,
  }: {
    onClearDraft?: () => void
    isOpen: boolean
    initialValues?: { subject?: string; message?: unknown }
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
  }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- test stub
    const [tick, setTick] = React.useState(0)
    if (!isOpen) return null
    // Mirror EmailModal: the draft starts from initialValues.
    if (initialValues && !draftSeeded) {
      draftSeeded = true
      draft = {
        subject: initialValues.subject ?? '',
        message: (initialValues.message as PortableTextBlock[]) ?? [],
      }
    }
    return (
      <div>
        <p data-testid="subject">{draft.subject}</p>
        <span hidden>{tick}</span>
        <button
          type="button"
          onClick={() => {
            draft = {
              subject: initialValues?.subject ?? '',
              message: (initialValues?.message as PortableTextBlock[]) ?? [],
            }
            onClearDraft?.()
          }}
        >
          clear draft
        </button>
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
    )
  },
}))
let draftSeeded = false

import {
  SponsorSendModal,
  isTemplateEdited,
  pickDefaultTemplate,
} from '@/components/admin/sponsor/SponsorSendModal'
import type { SponsorEmailTemplate } from '@/lib/sponsor/types'

const tpl = (o: Partial<SponsorEmailTemplate>): SponsorEmailTemplate =>
  ({
    _id: 'tpl',
    _createdAt: '',
    _updatedAt: '',
    title: 'T',
    slug: { current: 't' },
    category: 'follow-up',
    language: 'en',
    subject: 'S',
    ...o,
  }) as SponsorEmailTemplate

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
  localStorage.clear()
  h.applied = null
  h.templates = []
  draftSeeded = false
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
      // No templates ⇒ the kind's generic subject seeds the draft.
      subject: 'Information: Conf',
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

describe('default template (AC4)', () => {
  it('opens with the default template of the kind applied and records its provenance', async () => {
    h.templates = [
      tpl({ _id: 'tpl-contract', category: 'contract', isDefault: true }),
      tpl({
        _id: 'tpl-info-default',
        category: 'follow-up',
        language: 'no',
        isDefault: true,
        subject: 'Info for {{{SPONSOR_NAME}}}',
      }),
    ]
    renderModal()
    expect(screen.getByTestId('subject')).toHaveTextContent(
      'Info for Acme Corporation',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0].template).toEqual({
      id: 'tpl-info-default',
      edited: false,
    })
  })

  it('keeps the applied template across a reopen with a stored draft', async () => {
    localStorage.setItem(
      'sponsor-send-information-sfc-123',
      JSON.stringify({ subject: 'Restored', message: [] }),
    )
    localStorage.setItem(
      'sponsor-send-information-sfc-123:template',
      JSON.stringify({ id: 'tpl-earlier', subject: 'Restored', body: [] }),
    )
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0].template).toMatchObject({
      id: 'tpl-earlier',
    })
    // A successful send clears the stored provenance with the draft.
    expect(
      localStorage.getItem('sponsor-send-information-sfc-123:template'),
    ).toBeNull()
  })
})

describe('provenance edge cases (round 2)', () => {
  it('drops the provenance and sends again when the template was deleted since', async () => {
    localStorage.setItem(
      'sponsor-send-information-sfc-123',
      JSON.stringify({ subject: 'Restored', message: [] }),
    )
    localStorage.setItem(
      'sponsor-send-information-sfc-123:template',
      JSON.stringify({ id: 'tpl-gone', subject: 'Restored', body: [] }),
    )
    h.mutateAsync
      .mockRejectedValueOnce(new Error('Template not found'))
      .mockResolvedValueOnce({ success: true, recipientCount: 1 })
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(2))
    expect(h.mutateAsync.mock.calls[0][0].template).toMatchObject({
      id: 'tpl-gone',
    })
    expect(h.mutateAsync.mock.calls[1][0].template).toBeUndefined()
    expect(h.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })

  it('treats "Template is for another kind of email" the same way', async () => {
    localStorage.setItem(
      'sponsor-send-information-sfc-123',
      JSON.stringify({ subject: 'Restored', message: [] }),
    )
    localStorage.setItem(
      'sponsor-send-information-sfc-123:template',
      JSON.stringify({ id: 'tpl-contract', subject: 'Restored', body: [] }),
    )
    h.mutateAsync
      .mockRejectedValueOnce(new Error('Template is for another kind of email'))
      .mockResolvedValueOnce({ success: true, recipientCount: 1 })
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(2))
    expect(h.mutateAsync.mock.calls[1][0].template).toBeUndefined()
  })

  it('a stored draft WITHOUT provenance never inherits the default template', async () => {
    h.templates = [tpl({ _id: 'tpl-default', isDefault: true, language: 'no' })]
    localStorage.setItem(
      'sponsor-send-information-sfc-123',
      JSON.stringify({ subject: 'Old scratch draft', message: [] }),
    )
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0].template).toBeUndefined()
  })

  it('does not swallow other errors', async () => {
    h.mutateAsync.mockRejectedValueOnce(
      new Error('Resend: domain not verified'),
    )
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Resend: domain not verified' }),
      ),
    )
    expect(h.mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('"Clear draft" resets provenance to the default template, or to none', async () => {
    localStorage.setItem(
      'sponsor-send-information-sfc-123',
      JSON.stringify({ subject: 'Restored', message: [] }),
    )
    localStorage.setItem(
      'sponsor-send-information-sfc-123:template',
      JSON.stringify({ id: 'tpl-earlier', subject: 'Restored', body: [] }),
    )
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'clear draft' }))
    draft = { ...draft, subject: 'Fresh scratch email' }
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    // No templates ⇒ a cleared draft is a scratch email with no provenance.
    expect(h.mutateAsync.mock.calls[0][0].template).toBeUndefined()
  })
})

describe('recipients changed after a template was applied', () => {
  it('warns, and Re-apply re-merges the greeting for the new recipients', async () => {
    h.templates = [
      tpl({
        _id: 'tpl-default',
        isDefault: true,
        language: 'no',
        subject: 'For {{{CONTACT_NAMES}}}',
      }),
    ]
    renderModal()
    expect(screen.getByTestId('subject')).toHaveTextContent('For Kari Nordmann')
    expect(
      screen.queryByText(/recipients changed after the template was applied/i),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ola Nordmann' }))
    expect(
      screen.getByText(/recipients changed after the template was applied/i),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Re-apply template' }))
    expect(
      screen.queryByText(/recipients changed after the template was applied/i),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send to 2 contacts' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    // Contact order (Ola is listed first on this sponsor), matching the server.
    expect(h.mutateAsync.mock.calls[0][0].subject).toBe(
      'For Ola Nordmann and Kari Nordmann',
    )
  })
})

describe('pickDefaultTemplate', () => {
  const crm = { currency: 'NOK' }
  it('never picks a contract template for the information kind', () => {
    expect(
      pickDefaultTemplate(
        [tpl({ _id: 'c', category: 'contract', isDefault: true })],
        'information',
        crm,
      ),
    ).toBeUndefined()
  })
  it('prefers a default in the suggested language over a default in another', () => {
    const picked = pickDefaultTemplate(
      [
        tpl({ _id: 'en', language: 'en', isDefault: true }),
        tpl({ _id: 'no', language: 'no', isDefault: true }),
      ],
      'information',
      crm,
    )
    expect(picked?._id).toBe('no')
  })
  it('preselects nothing when no template is flagged default (spec AC4)', () => {
    expect(
      pickDefaultTemplate([tpl({ _id: 'only' })], 'information', crm),
    ).toBeUndefined()
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
