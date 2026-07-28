/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EditConferenceCard } from '@/components/admin/EditConferenceCard'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

// Capture the payload each fieldset mutation is called with.
const mutateMocks = vi.hoisted(() => ({
  updateBasicInfo: vi.fn(),
  updateVenue: vi.fn(),
  updateDates: vi.fn(),
  updateRegistration: vi.fn(),
  updateCommunication: vi.fn(),
  updateTicketingIds: vi.fn(),
  updateCfpGoals: vi.fn(),
  updateDomains: vi.fn(),
}))

// What the Domains availability probe (#680) reports back as claimed by ANOTHER
// conference. The real query self-excludes this conference server-side.
const probeState = vi.hoisted(() => ({ taken: [] as string[] }))

vi.mock('@/lib/trpc/client', () => {
  const make = (mutate: (input: unknown) => void) => ({
    useMutation: () => ({ mutate, isPending: false }),
  })
  return {
    api: {
      conference: {
        updateBasicInfo: make(mutateMocks.updateBasicInfo),
        updateVenue: make(mutateMocks.updateVenue),
        updateDates: make(mutateMocks.updateDates),
        updateRegistration: make(mutateMocks.updateRegistration),
        updateCommunication: make(mutateMocks.updateCommunication),
        updateTicketingIds: make(mutateMocks.updateTicketingIds),
        updateCfpGoals: make(mutateMocks.updateCfpGoals),
        updateDomains: make(mutateMocks.updateDomains),
        validateUpdatedDomains: {
          useQuery: () => ({
            data: { taken: probeState.taken },
            isFetching: false,
          }),
        },
      },
      useUtils: () => ({ invalidate: vi.fn() }),
    },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

function renderCard(props: Parameters<typeof EditConferenceCard>[0]) {
  return render(
    <NotificationProvider>
      <EditConferenceCard {...props} />
    </NotificationProvider>,
  )
}

beforeEach(() => {
  Object.values(mutateMocks).forEach((m) => m.mockReset())
  probeState.taken = []
})
afterEach(() => cleanup())

describe('EditConferenceCard', () => {
  it('opens the modal from the pencil trigger', () => {
    renderCard({
      fieldset: 'basicInfo',
      initialValues: { title: 'DevOpsDays', organizer: 'CNB' },
    })
    // Modal not shown until the trigger is clicked.
    expect(screen.queryByText('Edit Basic Information')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Basic Information' }),
    )
    expect(screen.getByText('Edit Basic Information')).toBeInTheDocument()
  })

  it('blocks submit and shows an inline error when a required field is cleared', () => {
    renderCard({
      fieldset: 'basicInfo',
      initialValues: { title: 'DevOpsDays', organizer: 'CNB' },
      defaultOpen: true,
    })
    const title = screen.getByLabelText(/Title/) as HTMLInputElement
    fireEvent.change(title, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Title is required')).toBeInTheDocument()
    expect(mutateMocks.updateBasicInfo).not.toHaveBeenCalled()
  })

  it('shows an inline error for an invalid email (communication fieldset)', () => {
    renderCard({
      fieldset: 'communication',
      initialValues: {
        contactEmail: 'hi@example.com',
        cfpEmail: 'cfp@example.com',
        sponsorEmail: 'sponsor@example.com',
      },
      defaultOpen: true,
    })
    const contact = screen.getByLabelText(/Contact Email/) as HTMLInputElement
    fireEvent.change(contact, { target: { value: 'broken' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(mutateMocks.updateCommunication).not.toHaveBeenCalled()
  })

  it('submits a field-scoped payload (keys ⊆ fieldset, trimmed, null-unset)', () => {
    renderCard({
      fieldset: 'basicInfo',
      initialValues: {
        title: 'DevOpsDays',
        organizer: 'CNB',
        city: 'Bergen',
        country: 'Norway',
        tagline: 'Old tagline',
        description: 'Desc',
      },
      defaultOpen: true,
    })
    // Edit the title (with padding to prove trimming) and clear the tagline.
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: '  DevOpsDays 2026  ' },
    })
    fireEvent.change(screen.getByLabelText(/Tagline/), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mutateMocks.updateBasicInfo).toHaveBeenCalledTimes(1)
    const payload = mutateMocks.updateBasicInfo.mock.calls[0][0] as Record<
      string,
      unknown
    >
    const allowed = [
      'title',
      'organizer',
      'city',
      'country',
      'tagline',
      'description',
    ]
    for (const key of Object.keys(payload)) {
      expect(allowed).toContain(key)
    }
    expect(payload.title).toBe('DevOpsDays 2026')
    // A cleared nullable field is sent as null (unset), not empty string.
    expect(payload.tagline).toBeNull()
  })

  it('wires the dirty-close guard: editing then closing prompts a discard confirm', () => {
    renderCard({
      fieldset: 'venue',
      initialValues: { venueName: 'Grieghallen', venueAddress: 'Bergen' },
      defaultOpen: true,
    })
    // Pristine: the Save button is disabled until something changes.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Venue Name/), {
      target: { value: 'New Hall' },
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    // Closing a dirty modal reveals the in-dialog discard confirm.
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
  })
})

/**
 * The editor-side mirror of `updateDomains`' global-uniqueness guard (#680).
 * The server is the authority; this only has to surface the conflict inline and
 * refuse to submit a payload the mutation would reject anyway.
 */
describe('EditConferenceCard — Domains availability probe (#680)', () => {
  const CURRENT = 'cloudnativebergen.no'

  function openDomainsEditor() {
    renderCard({
      fieldset: 'domains',
      initialValues: { domains: [CURRENT] },
      currentDomain: CURRENT,
      defaultOpen: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add domain' }))
    fireEvent.change(screen.getByLabelText('domain 2'), {
      target: { value: '2026.cnb.no' },
    })
    // Satisfy the dangerous-fieldset type-to-confirm gate so the probe is the
    // only thing that can still block Save.
    fireEvent.change(screen.getByLabelText(`Type ${CURRENT} to confirm`), {
      target: { value: CURRENT },
    })
  }

  it('flags a row the probe reports as claimed elsewhere and blocks Save', () => {
    probeState.taken = ['2026.cnb.no']
    openDomainsEditor()
    expect(
      screen.getByText('Already used by another conference'),
    ).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save domains' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(mutateMocks.updateDomains).not.toHaveBeenCalled()
  })

  it('leaves an available domain submittable', () => {
    probeState.taken = []
    openDomainsEditor()
    expect(
      screen.queryByText('Already used by another conference'),
    ).not.toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save domains' })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(mutateMocks.updateDomains).toHaveBeenCalledWith({
      domains: [CURRENT, '2026.cnb.no'],
    })
  })
})
