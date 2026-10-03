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
  invalidateCodes: vi.fn(),
  saveLink: vi.fn(),
  /** `registration.generateToken` — the registration kind's link on open (#1263). */
  generateToken: vi.fn(),
  /** `contractTemplates.contractReadiness` for the contract kind (#1264). */
  readiness: undefined as unknown,
  readinessError: false,
  showNotification: vi.fn(),
  templates: [] as unknown[],
  codeOptions: undefined as unknown,
  codesFetching: false,
  codesError: false,
  codesQueryOptions: undefined as unknown,
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
          discountCodeOptions: { invalidate: h.invalidateCodes },
        },
      },
    }),
    sponsor: {
      crm: {
        sendCommunication: {
          useMutation: () => ({ mutateAsync: h.mutateAsync }),
        },
        discountCodeOptions: {
          useQuery: (_input: unknown, opts: unknown) => {
            h.codesQueryOptions = opts
            return {
              data: h.codeOptions,
              isError: h.codesError,
              isFetching: h.codesFetching,
            }
          },
        },
      },
      emailTemplates: {
        list: { useQuery: () => ({ data: h.templates, isLoading: false }) },
      },
      contractTemplates: {
        contractReadiness: {
          useQuery: () => ({ data: h.readiness, isError: h.readinessError }),
        },
      },
    },
    conference: {
      updateSponsorRegistrationLink: {
        useMutation: () => ({ mutateAsync: h.saveLink, isPending: false }),
      },
    },
    registration: {
      generateToken: {
        useMutation: () => ({ mutateAsync: h.generateToken }),
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
    additionalFields,
    onAdditionalFieldsChange,
    storageKey,
    extraField,
  }: {
    extraField?: { label: string; content: React.ReactNode }
    additionalFields?: Record<string, string | number | boolean>
    onAdditionalFieldsChange?: (
      f: Record<string, string | number | boolean>,
    ) => void
    storageKey?: string
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
    // Mirror EmailModal: a stored draft (with the additionalFields saved in
    // the SAME write) wins over initialValues, and its fields are handed back.
    if (!draftSeeded) {
      draftSeeded = true
      const stored = storageKey ? localStorage.getItem(storageKey) : null
      if (stored) {
        const parsed = JSON.parse(stored) as {
          subject?: string
          message?: PortableTextBlock[]
          additionalFields?: Record<string, string | number | boolean>
        }
        draft = { subject: parsed.subject ?? '', message: parsed.message ?? [] }
        if (parsed.additionalFields)
          onAdditionalFieldsChange?.(parsed.additionalFields)
      } else if (initialValues) {
        draft = {
          subject: initialValues.subject ?? '',
          message: (initialValues.message as PortableTextBlock[]) ?? [],
        }
      }
    }
    lastAdditionalFields = additionalFields ?? {}
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
        {extraField && <div data-testid="extra">{extraField.content}</div>}
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
let lastAdditionalFields: Record<string, string | number | boolean> = {}

import {
  SponsorSendModal,
  pickDefaultTemplate,
} from '@/components/admin/sponsor/SponsorSendModal'
import { isTemplateEdited } from '@/lib/sponsor-crm/communication'
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
  kind:
    'information' | 'discount' | 'registration' | 'contract' = 'information',
  extra: { contractSend?: { contractTemplateId?: string } } = {},
) {
  return render(
    <SponsorSendModal
      isOpen
      kind={kind}
      contractSend={extra.contractSend}
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
  h.codeOptions = undefined
  h.codesFetching = false
  h.codesError = false
  h.readiness = { ready: true, canSend: true, missing: [] }
  h.readinessError = false
  draftSeeded = false
  lastAdditionalFields = {}
  draft = { subject: 'Hand-written subject', message: [] }
  h.mutateAsync.mockResolvedValue({ success: true, recipientCount: 1 })
  h.generateToken.mockResolvedValue({
    token: 'tok-existing',
    url: 'https://example.test/sponsor/portal/tok-existing',
  })
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
  it("posts the applied template id only — `edited` is the server's to compute", async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'apply template' }))
    draft = { ...draft, subject: 'Changed by hand' }
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0].template).toEqual({ id: 'tpl-1' })
  })

  it('hands the provenance to EmailModal as additionalFields, to be saved WITH the draft', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'apply template' }))
    expect(lastAdditionalFields).toEqual({
      templateId: 'tpl-1',
      templateRecipientKeys: 'c-primary',
    })
  })

  it('invalidates the timeline and the Communications tab after a send', async () => {
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
    })
  })

  it('keeps the applied template across a reopen with a stored draft', async () => {
    localStorage.setItem(
      'sponsor-send-information-sfc-123',
      JSON.stringify({
        subject: 'Restored',
        message: [],
        additionalFields: {
          templateId: 'tpl-earlier',
          templateRecipientKeys: 'c-primary',
        },
      }),
    )
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0].template).toEqual({
      id: 'tpl-earlier',
    })
    // Provenance is offered to EmailModal as additionalFields, so it is saved
    // in the SAME write as the text — and cleared with it after a send.
    expect(lastAdditionalFields).toEqual({})
  })
})

describe('provenance edge cases (round 2)', () => {
  it('drops the provenance and sends again when the template was deleted since', async () => {
    localStorage.setItem(
      'sponsor-send-information-sfc-123',
      JSON.stringify({
        subject: 'Restored',
        message: [],
        additionalFields: { templateId: 'tpl-gone' },
      }),
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
      JSON.stringify({
        subject: 'Restored',
        message: [],
        additionalFields: { templateId: 'tpl-contract' },
      }),
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
      JSON.stringify({
        subject: 'Restored',
        message: [],
        additionalFields: { templateId: 'tpl-earlier' },
      }),
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

describe('zero recipients', () => {
  it('offers no Re-apply when every recipient is unticked after a template was applied', () => {
    h.templates = [
      tpl({
        _id: 'tpl-default',
        isDefault: true,
        language: 'no',
        subject: 'For {{{CONTACT_NAMES}}}',
      }),
    ]
    renderModal()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Kari Nordmann' }))
    expect(
      screen.getByText('Choose at least one recipient before sending.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Re-apply template' }),
    ).not.toBeInTheDocument()
  })
})

/**
 * Send → Discount codes (#1262): the picker is seeded from the server's
 * attribution and the chosen codes travel as `discountCodes` — the codes
 * block itself is the server's to build.
 */
/** The linked chip's accessible name says it is linked (#7, review). */
const ACME_LINKED = 'ACME-2026, already linked to this sponsor'

describe('discount kind', () => {
  const options = {
    ticketUrl: 'https://tickets.example.test/sponsor',
    hasSponsorInviteLink: true,
    codes: [
      { code: 'ACME-2026', selected: true, linked: true },
      { code: 'ACME-WORKSHOP', selected: false, linked: false },
      {
        code: 'GLOBEX-VIP',
        selected: false,
        linked: false,
        linkedTo: 'Globex',
      },
    ],
  }

  it("preselects the sponsor's codes and posts them with the send", async () => {
    h.codeOptions = options
    renderModal({}, 'discount')
    expect(screen.getByRole('checkbox', { name: ACME_LINKED })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'ACME-WORKSHOP' }),
    ).not.toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'ACME-WORKSHOP' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      kind: 'discount',
      recipientKeys: ['c-primary'],
      // Picker order, not click order.
      discountCodes: ['ACME-2026', 'ACME-WORKSHOP'],
      subject: 'Discount codes: Conf',
    })
    // The stored link changed: the picker must re-read it next open.
    await waitFor(() => expect(h.invalidateCodes).toHaveBeenCalled())
    expect(h.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })

  it('shows a code stored on another sponsor as unpickable, with whose it is', () => {
    h.codeOptions = options
    renderModal({}, 'discount')
    expect(
      screen.getByRole('checkbox', { name: 'GLOBEX-VIP (linked to Globex)' }),
    ).toBeDisabled()
  })

  it('refuses to post with no code ticked', async () => {
    h.codeOptions = options
    renderModal({}, 'discount')
    fireEvent.click(screen.getByRole('checkbox', { name: ACME_LINKED }))
    expect(
      screen.getByText('Choose at least one discount code before sending.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Choose at least one discount code' }),
      ),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })

  it('warns when the email went out but the codes could not be stored', async () => {
    h.codeOptions = options
    h.mutateAsync.mockResolvedValue({
      success: true,
      recipientCount: 1,
      linkedCodes: [],
      linkFailed: true,
    })
    renderModal({}, 'discount')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          title: 'Codes not linked to the sponsor',
        }),
      ),
    )
  })

  it('seeds the preselection from SETTLED data, not a cache answer that is being refetched', () => {
    h.codeOptions = options
    h.codesFetching = true
    const { rerender } = renderModal({}, 'discount')
    // Not interactive until seeded: a toggle now would be overwritten by the
    // seed when the refetch settles.
    expect(screen.queryByRole('checkbox', { name: ACME_LINKED })).toBeNull()
    expect(screen.getByText('Loading discount codes…')).toBeInTheDocument()
    // The refetch lands with a code assigned since.
    h.codeOptions = {
      ...options,
      codes: options.codes.map((c) =>
        c.code === 'ACME-WORKSHOP' ? { ...c, selected: true } : c,
      ),
    }
    h.codesFetching = false
    rerender(
      <SponsorSendModal
        isOpen
        kind="discount"
        onClose={vi.fn()}
        sponsorForConference={mockSponsor({ contactPersons: contacts })}
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
    expect(screen.getByRole('checkbox', { name: ACME_LINKED })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'ACME-WORKSHOP' }),
    ).toBeChecked()
  })

  it('warns when the conference has no sponsor invite link', () => {
    h.codeOptions = {
      ...options,
      ticketUrl: 'https://example.test/tickets',
      hasSponsorInviteLink: false,
    }
    renderModal({}, 'discount')
    expect(screen.getByRole('alert')).toHaveTextContent(
      /no sponsor ticket invite link.*https:\/\/example\.test\/tickets/,
    )
  })

  it('lets the organizer paste the invite link and save it to the conference', async () => {
    h.codeOptions = {
      ...options,
      ticketUrl: 'https://example.test/tickets',
      hasSponsorInviteLink: false,
    }
    h.saveLink.mockResolvedValue({ success: true })
    renderModal({}, 'discount')
    const save = screen.getByRole('button', { name: 'Save to conference' })
    expect(save).toBeDisabled()
    const input = screen.getByLabelText('Sponsor ticket invite link')
    fireEvent.change(input, { target: { value: 'not a url' } })
    expect(save).toBeDisabled()
    fireEvent.change(input, {
      target: { value: 'https://checkin.no/invite/abc' },
    })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    await waitFor(() =>
      expect(h.saveLink).toHaveBeenCalledWith({
        sponsorRegistrationLink: 'https://checkin.no/invite/abc',
      }),
    )
    // The picker re-reads the options, so the warning goes and the send
    // uses the saved link.
    await waitFor(() => expect(h.invalidateCodes).toHaveBeenCalled())
    expect(h.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sponsor invite link saved' }),
    )
  })

  it('does not warn when the invite link is set', () => {
    h.codeOptions = options
    renderModal({}, 'discount')
    expect(screen.queryByText(/no sponsor ticket invite link/)).toBeNull()
  })

  it('never serves the picker from a cached answer (staleTime 0)', () => {
    // A code assigned on the discount page a moment ago must be offered: the
    // app-wide 60 s staleTime would otherwise skip the refetch on reopen.
    h.codeOptions = options
    renderModal({}, 'discount')
    expect(h.codesQueryOptions).toMatchObject({ staleTime: 0 })
  })

  it('refuses to send while the code list is in error, even with a stale selection', async () => {
    // A refetch that fails keeps the old data; the picker shows the error,
    // so a selection the organizer can no longer see must not go out.
    h.codeOptions = options
    h.codesError = true
    renderModal({}, 'discount')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The discount codes could not be loaded from the ticket provider.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'The discount codes could not be loaded. Close and try again.',
        }),
      ),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })

  it('starts every open with no codes chosen until the seed lands', async () => {
    // Open, seed, close, reopen while the refetch runs: the previous open's
    // selection must not be sendable before the new seed.
    h.codeOptions = options
    const props = {
      kind: 'discount' as const,
      onClose: vi.fn(),
      sponsorForConference: mockSponsor({ contactPersons: contacts }),
      domain: 'example.test',
      fromEmail: 'sponsors@example.test',
      conference: {
        title: 'Conf',
        city: 'Bergen',
        country: 'Norway',
        startDate: '2026-10-28',
        domains: ['example.test'],
      },
    }
    const { rerender } = render(<SponsorSendModal isOpen {...props} />)
    expect(screen.getByRole('checkbox', { name: ACME_LINKED })).toBeChecked()
    rerender(<SponsorSendModal isOpen={false} {...props} />)
    draftSeeded = false
    h.codesFetching = true
    rerender(<SponsorSendModal isOpen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Choose at least one discount code' }),
      ),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })

  it('does not seed from the stale data a failed refetch leaves behind', () => {
    // Stale list (Acme's code only) while the refetch is in error, then the
    // retry succeeds with a code assigned since: the seed must be the fresh one.
    h.codeOptions = options
    h.codesError = true
    const props = {
      kind: 'discount' as const,
      onClose: vi.fn(),
      sponsorForConference: mockSponsor({ contactPersons: contacts }),
      domain: 'example.test',
      fromEmail: 'sponsors@example.test',
      conference: {
        title: 'Conf',
        city: 'Bergen',
        country: 'Norway',
        startDate: '2026-10-28',
        domains: ['example.test'],
      },
    }
    const { rerender } = render(<SponsorSendModal isOpen {...props} />)
    h.codesError = false
    h.codeOptions = {
      ...options,
      codes: options.codes.map((c) =>
        c.code === 'ACME-WORKSHOP' ? { ...c, selected: true } : c,
      ),
    }
    rerender(<SponsorSendModal isOpen {...props} />)
    expect(
      screen.getByRole('checkbox', { name: 'ACME-WORKSHOP' }),
    ).toBeChecked()
  })

  it('never preselects a code stored on another sponsor, whatever the server says', () => {
    h.codeOptions = {
      ...options,
      codes: [
        {
          code: 'GLOBEX-VIP',
          selected: true,
          linked: false,
          linkedTo: 'Globex',
        },
      ],
    }
    renderModal({}, 'discount')
    expect(
      screen.getByRole('checkbox', { name: 'GLOBEX-VIP (linked to Globex)' }),
    ).not.toBeChecked()
  })

  it('says in the accessible name when sending would move a code from another sponsor', () => {
    h.codeOptions = {
      ...options,
      codes: [
        {
          code: 'ACME-WORKSHOP',
          selected: false,
          linked: false,
          attributedTo: 'Workshop AS',
        },
      ],
    }
    renderModal({}, 'discount')
    expect(
      screen.getByRole('checkbox', {
        name: 'ACME-WORKSHOP, now counted for Workshop AS; sending moves it to this sponsor',
      }),
    ).toBeInTheDocument()
  })

  it('an information send carries no codes', async () => {
    h.codeOptions = options
    renderModal()
    expect(screen.queryByRole('group', { name: 'Discount codes' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0].discountCodes).toBeUndefined()
  })
})

describe('registration kind (#1263)', () => {
  it('prepares the link on open from the EXISTING token and posts the registration kind', async () => {
    renderModal({}, 'registration')
    expect(screen.getByText('Preparing the registration link…')).toBeVisible()
    await waitFor(() =>
      expect(
        screen.queryByText('Preparing the registration link…'),
      ).not.toBeInTheDocument(),
    )
    expect(h.generateToken).toHaveBeenCalledTimes(1)
    expect(h.generateToken).toHaveBeenCalledWith({
      sponsorForConferenceId: expect.any(String),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    const posted = h.mutateAsync.mock.calls[0][0]
    expect(posted).toMatchObject({
      kind: 'registration',
      recipientKeys: ['c-primary'],
      subject: 'Registration: Conf',
    })
    expect(posted).not.toHaveProperty('discountCodes')
    // The built-in welcome is the starting body.
    expect(JSON.parse(posted.message)[0].children[0].text).toMatch(
      /^Welcome aboard, /,
    )
  })

  it('refuses an information send that still carries the portal merge field', async () => {
    renderModal({}, 'information')
    // Typed after open (the stub seeds the draft from initialValues on mount).
    draft = {
      subject: 'Register at {{{SPONSOR_PORTAL_URL}}}',
      message: [],
    }
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/only a registration send can fill in/),
        }),
      ),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })

  it('never asks the information kind for a link', () => {
    renderModal({}, 'information')
    expect(h.generateToken).not.toHaveBeenCalled()
    expect(
      screen.queryByText('Preparing the registration link…'),
    ).not.toBeInTheDocument()
  })

  it('shows the completed-registration notice, and still sends', async () => {
    renderModal({ registrationComplete: true }, 'registration')
    expect(
      screen.getByText(/has already completed registration/),
    ).toHaveAttribute('role', 'status')
    await waitFor(() => expect(h.generateToken).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        screen.queryByText('Preparing the registration link…'),
      ).not.toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      kind: 'registration',
    })
  })

  it('shows no notice while registration is open', async () => {
    renderModal({ registrationComplete: false }, 'registration')
    expect(
      screen.queryByText(/has already completed registration/),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(h.generateToken).toHaveBeenCalled())
  })

  it('refuses to send until the link is ready — the preview showed none', async () => {
    h.generateToken.mockReturnValue(new Promise(() => {}))
    renderModal({}, 'registration')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/still being prepared/),
        }),
      ),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })

  it('says why when the link could not be prepared, and refuses to send', async () => {
    h.generateToken.mockRejectedValue(
      new Error('Conference has no domain configured.'),
    )
    renderModal({}, 'registration')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The registration link could not be prepared: Conference has no domain configured.',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/no domain configured/),
        }),
      ),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })

  it('asks for the link ONCE per open — a re-render does not mint again', async () => {
    renderModal({}, 'registration')
    await waitFor(() => expect(h.generateToken).toHaveBeenCalledTimes(1))
    // A recipient toggle re-renders the modal.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ola Nordmann' }))
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Ola Nordmann' }),
      ).toBeChecked(),
    )
    expect(h.generateToken).toHaveBeenCalledTimes(1)
  })
})

describe('contract kind (#1264)', () => {
  const SIGNING_URL = 'https://example.test/sponsor/contract/sign/agr-1'

  it('first send: the button says "Send contract", the primary recipient signs by default, and the previewed template rides along', async () => {
    renderModal({}, 'contract', {
      contractSend: { contractTemplateId: 'tpl-A' },
    })
    expect(
      screen.getByRole('radio', { name: 'Kari Nordmann signs' }),
    ).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Send contract' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      kind: 'contract',
      recipientKeys: ['c-primary'],
      signerKey: 'c-primary',
      contractTemplateId: 'tpl-A',
      subject: 'Sponsorship Agreement — Conf',
    })
  })

  it('first send: the signer must be a chosen recipient, and a second recipient can be made the signer', async () => {
    renderModal({}, 'contract')
    // Only selected recipients are offered as signer.
    expect(
      screen.queryByRole('radio', { name: 'Ola Nordmann signs' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ola Nordmann' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Ola Nordmann signs' }))
    expect(
      screen.getByRole('radio', { name: 'Ola Nordmann signs' }),
    ).toBeChecked()
    fireEvent.click(
      screen.getByRole('button', { name: 'Send contract to 2 contacts' }),
    )
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      signerKey: 'c-billing',
    })
  })

  it('first send: changing the signer after a template was applied warns, and Re-apply records the new signer in the provenance', async () => {
    // The hint needs the applied template to exist in the list (it offers Re-apply).
    h.templates = [tpl({ _id: 'tpl-1', category: 'contract' })]
    renderModal({}, 'contract')
    fireEvent.click(screen.getByRole('button', { name: 'apply template' }))
    expect(
      screen.queryByText(/changed after the template was applied/),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ola Nordmann' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Ola Nordmann signs' }))
    expect(
      screen.getByText(/or the signer changed after the template was applied/),
    ).toBeInTheDocument()
    expect(lastAdditionalFields).toMatchObject({
      templateSignerKey: 'c-primary',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Re-apply template' }))
    await waitFor(() =>
      expect(
        screen.queryByText(/changed after the template was applied/),
      ).not.toBeInTheDocument(),
    )
    // The provenance now names the signer the greeting was merged for (the
    // merged text itself is pinned in the Contract story).
    expect(lastAdditionalFields).toMatchObject({
      templateSignerKey: 'c-billing',
    })
  })

  it('first send: the stored signer is preselected when they are among the recipients', () => {
    renderModal({ signerEmail: 'ola@acme.example' }, 'contract')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ola Nordmann' }))
    expect(
      screen.getByRole('radio', { name: 'Ola Nordmann signs' }),
    ).toBeChecked()
  })

  it('first send: refuses, naming the missing fields, when readiness fails', async () => {
    h.readiness = {
      ready: false,
      canSend: false,
      missing: [
        {
          field: 'tier',
          label: 'Sponsor tier',
          source: 'pipeline',
          severity: 'required',
        },
        {
          field: 'conference.venueName',
          label: 'Venue',
          source: 'organizer',
          severity: 'recommended',
        },
      ],
    }
    renderModal({}, 'contract')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Sponsor tier')
    expect(alert).not.toHaveTextContent('Venue')
    fireEvent.click(screen.getByRole('button', { name: 'Send contract' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/Sponsor tier/),
        }),
      ),
    )
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })

  it('reminder: the button says "Send reminder", no signer is asked, nothing contract-specific is posted', async () => {
    renderModal(
      {
        contractStatus: 'contract-sent',
        signatureStatus: 'pending',
        signatureId: 'agr-1',
        signingUrl: SIGNING_URL,
        signerEmail: 'kari@acme.example',
      },
      'contract',
    )
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }))
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    const posted = h.mutateAsync.mock.calls[0][0]
    expect(posted).toMatchObject({ kind: 'contract' })
    expect(posted).not.toHaveProperty('signerKey')
    expect(posted).not.toHaveProperty('contractTemplateId')
  })

  it('signed: the button says "Send signed copy"', async () => {
    renderModal(
      {
        contractStatus: 'contract-signed',
        signatureStatus: 'signed',
        contractDocument: {
          asset: { _ref: 'f1', url: 'https://cdn/signed.pdf' },
        },
      },
      'contract',
    )
    expect(
      screen.getByRole('button', { name: 'Send signed copy' }),
    ).toBeInTheDocument()
  })

  it('signed with no stored document: says so', () => {
    renderModal(
      { contractStatus: 'contract-signed', signatureStatus: 'signed' },
      'contract',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/No signed agreement/)
  })

  it('warns when the email went out but the deal could not be updated', async () => {
    h.mutateAsync.mockResolvedValue({
      success: true,
      recipientCount: 1,
      contractAction: 'send',
      contractStateFailed: true,
    })
    renderModal({}, 'contract')
    fireEvent.click(screen.getByRole('button', { name: 'Send contract' }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'warning', title: 'Deal not updated' }),
      ),
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
  it('contract: a contract template with the action slug wins over the default contract template', () => {
    const def = tpl({
      _id: 'def',
      isDefault: true,
      category: 'contract',
      slug: { current: 'contract-sent' },
    })
    const reminder = tpl({
      _id: 'rem',
      isDefault: false,
      category: 'contract',
      slug: { current: 'contract-reminder' },
    })
    const other = tpl({
      _id: 'oth',
      isDefault: true,
      category: 'follow-up',
      slug: { current: 'contract-reminder' },
    })
    expect(
      pickDefaultTemplate(
        [def, reminder, other],
        'contract',
        {},
        'contract-reminder',
      )?._id,
    ).toBe('rem')
    expect(
      pickDefaultTemplate([def, other], 'contract', {}, 'contract-reminder')
        ?._id,
    ).toBe('def')
  })

  it('never preselects a template for a registration send — the built-in welcome is the start', () => {
    const t = tpl({ _id: 'a', isDefault: true, category: 'follow-up' })
    expect(pickDefaultTemplate([t], 'registration', {})).toBeUndefined()
  })

  it('never preselects a template for a discount send — none is for codes', () => {
    const info = tpl({ _id: 'info', category: 'follow-up', isDefault: true })
    expect(pickDefaultTemplate([info], 'discount', {})).toBeUndefined()
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
