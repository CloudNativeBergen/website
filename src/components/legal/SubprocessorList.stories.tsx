import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SubprocessorList } from './SubprocessorList'
import {
  buildSubprocessorDisclosure,
  type TenantProcessingFacts,
} from '@/lib/legal/subprocessors'

/**
 * Built through the REAL resolver rather than by hand-writing rows, so a story
 * cannot show a list the rules would never produce.
 */
function disclosure(overrides: Partial<TenantProcessingFacts> = {}) {
  return buildSubprocessorDisclosure({
    tenantKnown: true,
    organizationReadFailed: false,
    ticketing: {
      provider: 'checkin',
      bound: true,
      explicitlySelected: false,
      registrationLink: null,
    },
    analyticsCode: 'Jc72d7tD73Ai9raeYVPeXJ0OhEJrrvaK',
    slackToken: true,
    workshops: true,
    dedicatedEmailAccount: false,
    ...overrides,
  })
}

const meta = {
  title: 'Components/SubprocessorList',
  component: SubprocessorList,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The /privacy subprocessor list, resolved from what a tenant actually uses (#690). It used to be hardcoded JSX served identically on every domain, so a tenant on Tito told its attendees that Checkin.no processes their data. An unresolvable signal DISCLOSES the processor with a "may not apply" badge rather than dropping it — under-disclosure is the failure with legal consequence.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SubprocessorList>

export default meta
type Story = StoryObj<typeof meta>

/** The platform organization, which is also a tenant: Checkin, Slack, Pirsch, workshops. */
export const PlatformTenant: Story = {
  args: { disclosure: disclosure() },
}

/** A customer on Tito with no Slack, no workshops and no analytics code. */
export const TitoCustomer: Story = {
  args: {
    disclosure: disclosure({
      ticketing: {
        provider: 'tito',
        bound: true,
        explicitlySelected: true,
        registrationLink: null,
      },
      analyticsCode: null,
      slackToken: false,
      workshops: false,
    }),
  },
}

/** A tenant sending from its own Resend account rather than the shared one. */
export const OwnEmailAccount: Story = {
  args: { disclosure: disclosure({ dedicatedEmailAccount: true }) },
}

/** No ticketing binding at all — neither vendor is named. */
export const NoTicketingVendor: Story = {
  args: {
    disclosure: disclosure({
      ticketing: {
        provider: 'checkin',
        bound: false,
        explicitlySelected: false,
        registrationLink: null,
      },
      analyticsCode: null,
      slackToken: false,
      workshops: false,
    }),
  },
}

/**
 * The organization read FAILED. The org-gated processors stay on the list,
 * badged as uncertain, rather than silently disappearing for the length of an
 * outage — the state this whole change exists to make impossible.
 */
export const OrganizationReadFailed: Story = {
  args: {
    disclosure: disclosure({
      organizationReadFailed: true,
      slackToken: null,
      workshops: null,
      dedicatedEmailAccount: null,
    }),
  },
}

/** Nothing about the tenant could be read: the full possible set, all uncertain. */
export const NothingKnown: Story = {
  args: {
    disclosure: disclosure({
      tenantKnown: false,
      ticketing: null,
      analyticsCode: null,
      slackToken: null,
      workshops: null,
      dedicatedEmailAccount: null,
    }),
  },
}
