/**
 * @vitest-environment jsdom
 *
 * The activation hero on `/admin` (#839) — what a brand-new organizer actually
 * sees on the screen they land on. The checklists here are built by the REAL
 * `buildActivationChecklist` from the REAL provisioning output, so a change to
 * either shows up as a failure here rather than as a hero quietly naming the
 * wrong next step.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { ActivationHero } from './ActivationHero'
import {
  ACTIVATION_CHECKLIST_HREF,
  buildActivationChecklist,
  type ActivationOptions,
  type ConferenceForActivation,
} from '@/lib/settings/activation'
import { buildProvisionedConference } from '../../../__tests__/testdata/onboarding'
import type { SystemCheck } from '@/lib/system-status/types'

/** A shared-platform tenant: neither impossible row is theirs to complete. */
const SHARED_TENANT: ActivationOptions = {
  ticketingAvailable: false,
  emailDeliveryManagedByPlatform: true,
}

const CHECKS_OK: SystemCheck[] = [
  {
    id: 'email.resendKey',
    group: 'email',
    label: 'RESEND_API_KEY',
    status: 'ok',
  },
  {
    id: 'slack.botToken',
    group: 'slack',
    label: 'SLACK_BOT_TOKEN',
    status: 'ok',
  },
]

const ACTIVATED: ConferenceForActivation = {
  title: 'Cloud Native Day',
  organizer: 'Cloud Native Bergen',
  logoBright: 'https://cdn/logo.svg',
  venueName: 'Grieghallen',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-03-01',
  formats: ['lightning_10'],
  topics: [{ _id: 't1', title: 'Kubernetes' }],
  contactEmail: 'hi@example.com',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsors@example.com',
  registrationLink: 'https://tickets.example.com',
  checkinCustomerId: 1,
  checkinEventId: 2,
  visibility: 'live',
}

afterEach(cleanup)

describe('ActivationHero — a freshly provisioned tenant', () => {
  const checklist = buildActivationChecklist(
    buildProvisionedConference() as ConferenceForActivation,
    [],
    SHARED_TENANT,
  )

  it('leads with the CFP stage, not with branding', () => {
    render(<ActivationHero checklist={checklist} />)
    expect(
      screen.getByRole('heading', { name: /open your call for papers/i }),
    ).toBeTruthy()
    expect(screen.queryByText(/brand logo/i)).toBeNull()
  })

  it('names the two steps that genuinely stand in the way', () => {
    render(<ActivationHero checklist={checklist} />)
    expect(screen.getByText('Call-for-papers window')).toBeTruthy()
    expect(screen.getByText('At least one topic')).toBeTruthy()
  })

  it('shows no more than two steps', () => {
    render(<ActivationHero checklist={checklist} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('offers the way through to the full list', () => {
    render(<ActivationHero checklist={checklist} />)
    expect(
      screen.getByRole('link', { name: /see the full checklist/i }),
    ).toHaveAttribute('href', ACTIVATION_CHECKLIST_HREF)
  })

  it('reports progress the organizer can act on', () => {
    render(<ActivationHero checklist={checklist} />)
    const bar = screen.getByRole('progressbar', { name: /launch readiness/i })
    expect(bar.getAttribute('aria-valuenow')).toBe(String(checklist.done))
    expect(bar.getAttribute('aria-valuemax')).toBe(String(checklist.required))
  })

  it('never surfaces a step the tenant cannot complete', () => {
    // The #839 prerequisite: an unentitled org cannot connect ticketing and a
    // shared-tier tenant cannot set a platform environment variable.
    render(<ActivationHero checklist={checklist} />)
    expect(screen.queryByText(/ticketing connected/i)).toBeNull()
    expect(screen.queryByText(/Resend API key/i)).toBeNull()
  })

  it('gives no way to dismiss it while a required row is outstanding', () => {
    // It is the only signpost to the checklist in the whole shell; a dismiss
    // control would restore the very state #839 describes.
    render(<ActivationHero checklist={checklist} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('ActivationHero — later in setup', () => {
  it('moves on to the launch stage once the CFP one is satisfied', () => {
    const checklist = buildActivationChecklist(
      {
        cfpStartDate: '2026-01-01',
        cfpEndDate: '2026-03-01',
        topics: [{ _id: 't1' }],
        formats: ['lightning_10'],
      },
      [],
      SHARED_TENANT,
    )
    render(<ActivationHero checklist={checklist} />)
    expect(
      screen.getByRole('heading', { name: /get ready to launch/i }),
    ).toBeTruthy()
    expect(screen.getByText('Name & organizer')).toBeTruthy()
  })

  it('counts down to the switch in the singular when one step is left', () => {
    const checklist = buildActivationChecklist(
      { ...ACTIVATED, visibility: 'unlisted' },
      CHECKS_OK,
      SHARED_TENANT,
    )
    render(<ActivationHero checklist={checklist} />)
    expect(screen.getByText(/1 step left before you can go live/i)).toBeTruthy()
    expect(screen.getByText('Go live')).toBeTruthy()
  })
})

describe('ActivationHero — a fully activated conference', () => {
  it('renders nothing at all', () => {
    const checklist = buildActivationChecklist(
      ACTIVATED,
      CHECKS_OK,
      SHARED_TENANT,
    )
    expect(checklist.allDone).toBe(true)
    const { container } = render(<ActivationHero checklist={checklist} />)
    expect(container).toBeEmptyDOMElement()
  })
})
