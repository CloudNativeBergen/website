import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { within, userEvent, waitFor, expect } from 'storybook/test'
import { NewEditionWizard } from './NewEditionWizard'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { EditionDefaults, CloneFamily } from '@/lib/conference/edition'

const defaults: EditionDefaults = {
  title: 'Cloud Native Days Bergen 2026',
  organizer: 'Cloud Native Bergen',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-03-01',
  cfpNotifyDate: '2026-03-15',
  programDate: '2026-04-01',
}

const cloneCounts: Partial<Record<CloneFamily, number>> = {
  topics: 8,
  formats: 4,
  organizers: 5,
  teams: 2,
  sponsorTiers: 3,
  contractTemplates: 2,
  sponsorshipCopy: 4,
  cfpGoals: 5,
  agentConfig: 1,
  emailsAndChannels: 6,
}

// No domain is ever "taken" in the happy path; createEdition echoes a summary.
const handlers = [
  http.get('/api/trpc/conference.validateNewDomains', () =>
    HttpResponse.json({ result: { data: { taken: [] } } }),
  ),
  http.post('/api/trpc/conference.createEdition', () =>
    HttpResponse.json({
      result: {
        data: {
          conferenceId: 'conference-abc123',
          summary: {
            conference: 1,
            topics: 8,
            formats: 4,
            organizers: 5,
            teams: 2,
            sponsorTiers: 3,
            contractTemplates: 2,
            sponsorshipCopy: 1,
            cfpGoals: 1,
            agentConfig: 1,
            emailsAndChannels: 1,
          },
        },
      },
    }),
  ),
]

const meta = {
  title: 'Systems/Admin/Settings/New Edition Wizard',
  component: NewEditionWizard,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="mx-auto max-w-3xl p-4">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
  args: { defaults, sourceTitle: 'Cloud Native Days Bergen 2025', cloneCounts },
} satisfies Meta<typeof NewEditionWizard>

export default meta
type Story = StoryObj<typeof meta>

/** Step 1 — Basics, prefilled one year ahead. */
export const Basics: Story = {
  args: { initialStep: 'basics' },
}

/** Step 2 — Domains list with the availability check. */
export const Domains: Story = {
  args: { initialStep: 'domains', initialDomains: ['2026.cnb.no'] },
}

/** Step 3 — Clone checklist, structure defaults ON with per-family counts. */
export const CloneChecklist: Story = {
  args: { initialStep: 'clone' },
}

/** Step 4 — Review with the type-to-confirm gate satisfied (red Create armed). */
export const ReviewConfirmed: Story = {
  args: { initialStep: 'review', initialDomains: ['2026.cnb.no'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const confirm = await canvas.findByLabelText('Confirm title')
    await userEvent.type(confirm, 'Cloud Native Days Bergen 2026')
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: /create edition/i }),
      ).toBeEnabled(),
    )
  },
}

/** The success panel: clone summary + the DNS/Vercel caveat. */
export const SuccessSummary: Story = {
  args: { initialStep: 'review', initialDomains: ['2026.cnb.no'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const confirm = await canvas.findByLabelText('Confirm title')
    await userEvent.type(confirm, 'Cloud Native Days Bergen 2026')
    const create = await canvas.findByRole('button', {
      name: /create edition/i,
    })
    await waitFor(() => expect(create).toBeEnabled())
    await userEvent.click(create)
    await canvas.findByText(/created/i)
  },
}
