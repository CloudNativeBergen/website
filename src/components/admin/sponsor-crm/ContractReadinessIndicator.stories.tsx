import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ContractReadinessIndicator } from './ContractReadinessIndicator'
import {
  mockReadinessReady,
  mockReadinessMissing,
} from '@/__mocks__/sponsor-data'

const meta = {
  title: 'Systems/Sponsors/Admin/Sponsor Detail/ContractReadinessIndicator',
  component: ContractReadinessIndicator,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Visual validation indicator showing contract generation readiness. Uses tRPC to check for required fields (sponsor name, org number, address, tier selection, primary contact). Displays missing fields by data source (Sponsor Profile, Tier Selection, Contact Information) with clear success/warning states using brand colors.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ContractReadinessIndicator>

export default meta
type Story = StoryObj<typeof meta>

export const Interactive: Story = {
  args: {
    sponsorForConferenceId: 'sfc-ready',
    conferenceId: 'conf-1',
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          '/api/trpc/sponsor.contractTemplates.contractReadiness',
          () => {
            return HttpResponse.json({
              result: {
                data: mockReadinessReady(),
              },
            })
          },
        ),
      ],
    },
  },
}

export const ReadyForContract: Story = {
  args: {
    sponsorForConferenceId: 'sfc-ready',
    conferenceId: 'conf-1',
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          '/api/trpc/sponsor.contractTemplates.contractReadiness',
          () => {
            return HttpResponse.json({
              result: {
                data: mockReadinessReady(),
              },
            })
          },
        ),
      ],
    },
  },
}

export const MissingFields: Story = {
  args: {
    sponsorForConferenceId: 'sfc-missing',
    conferenceId: 'conf-1',
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          '/api/trpc/sponsor.contractTemplates.contractReadiness',
          () => {
            return HttpResponse.json({
              result: {
                data: mockReadinessMissing(),
              },
            })
          },
        ),
      ],
    },
  },
}

export const MissingSponsorDataOnly: Story = {
  args: {
    sponsorForConferenceId: 'sfc-sponsor-missing',
    conferenceId: 'conf-1',
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          '/api/trpc/sponsor.contractTemplates.contractReadiness',
          () => {
            return HttpResponse.json({
              result: {
                data: mockReadinessMissing([
                  {
                    field: 'sponsor.orgNumber',
                    label: 'Organization number',
                    source: 'sponsor',
                    severity: 'recommended',
                  },
                  {
                    field: 'sponsor.address',
                    label: 'Address',
                    source: 'sponsor',
                    severity: 'recommended',
                  },
                  {
                    field: 'contactPersons.primary',
                    label: 'Primary contact person',
                    source: 'sponsor',
                    severity: 'required',
                  },
                ]),
              },
            })
          },
        ),
      ],
    },
  },
}

export const MissingOrganizerDataOnly: Story = {
  args: {
    sponsorForConferenceId: 'sfc-organizer-missing',
    conferenceId: 'conf-1',
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          '/api/trpc/sponsor.contractTemplates.contractReadiness',
          () => {
            return HttpResponse.json({
              result: {
                data: mockReadinessMissing([
                  {
                    field: 'conference.name',
                    label: 'Conference name',
                    source: 'organizer',
                    severity: 'recommended',
                  },
                  {
                    field: 'conference.organizerOrgNumber',
                    label: 'Organizer org number',
                    source: 'organizer',
                    severity: 'recommended',
                  },
                  {
                    field: 'conference.organizerAddress',
                    label: 'Organizer address',
                    source: 'organizer',
                    severity: 'recommended',
                  },
                  {
                    field: 'conference.sponsorEmail',
                    label: 'Sponsor contact email',
                    source: 'organizer',
                    severity: 'recommended',
                  },
                ]),
              },
            })
          },
        ),
      ],
    },
  },
}
