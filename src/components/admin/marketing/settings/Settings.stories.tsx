import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { mockDateBeforeEach } from '@/lib/storybook'
import { MILESTONES } from '@/lib/marketing/milestones'
import type { PlanView } from '@/lib/marketing/types'
import { exportFixture } from '@/lib/marketing/report/__tests__/export-fixture'
import { PlanSettingsPage } from './PlanSettingsPage'
import { CampaignEditorForm } from './CampaignEditor'
import { DeleteConfirmation } from './DeleteCampaignDialog'
import { emptyCampaign } from './editor-model'

const fixture = exportFixture()
const plan: PlanView = {
  viewerId: null,
  plan: { ...fixture.plan!, structurallyEdited: true },
  campaigns: fixture.campaigns,
  tasks: [],
  today: '2026-06-17',
  ceilingWarnings: [],
  organizers: [{ _id: 'owner', name: 'Ada Organizer' }],
  milestones: Object.fromEntries(
    MILESTONES.map((key) => [key, { date: '2026-06-17', provisional: false }]),
  ) as PlanView['milestones'],
}
const meta = {
  title: 'Systems/Marketing/Settings',
  component: PlanSettingsPage,
  beforeEach: mockDateBeforeEach(new Date('2026-06-17T12:00:00Z')),
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        http.get('/api/trpc/marketing.plan.deletionPreview', () =>
          HttpResponse.json({
            result: {
              data: {
                campaigns: 1,
                tasks: 12,
                publishedTasks: 3,
                snapshots: 40,
                requiresTypedConfirmation: true,
                conferenceTitle: 'Cloud Native Days Norway 2026',
              },
            },
          }),
        ),
        http.post('/api/trpc/marketing.plan.delete', () =>
          HttpResponse.json({ result: { data: { deleted: true } } }),
        ),
        http.get('/api/trpc/marketing.plan.get', () =>
          HttpResponse.json({ result: { data: plan } }),
        ),
      ],
    },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof PlanSettingsPage>
export default meta
type Story = StoryObj<typeof meta>
export const PlanSettings: Story = {}
export const MobileSettings: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
export const AddCampaign: Story = {
  render: () => <CampaignEditorForm onClose={fn()} onSave={fn()} />,
}
export const EditCampaign: Story = {
  render: () => (
    <CampaignEditorForm
      campaign={{
        ...emptyCampaign.window,
        title: 'Call for papers',
        primaryOutcome: 'cfpSubmissions',
        target: 200,
        outcomeTargetPage: '/cfp',
        _id: 'campaign',
        _rev: 'revision',
        key: 'cfp',
      }}
      onClose={fn()}
      onSave={fn()}
    />
  ),
}
export const DeletePublishedCampaign: Story = {
  render: () => (
    <DeleteConfirmation
      preview={{
        campaigns: 1,
        tasks: 6,
        publishedTasks: 2,
        snapshots: 45,
        requiresTypedConfirmation: true,
        conferenceTitle: 'Cloud Native Days Norway 2026',
      }}
      onClose={fn()}
      onConfirm={fn()}
    />
  ),
}
export const DeleteDraftCampaign: Story = {
  render: () => (
    <DeleteConfirmation
      preview={{
        campaigns: 1,
        tasks: 3,
        publishedTasks: 0,
        snapshots: 2,
        requiresTypedConfirmation: false,
        conferenceTitle: 'Cloud Native Days Norway 2026',
      }}
      onClose={fn()}
      onConfirm={fn()}
    />
  ),
}
export const PublishingRefusal: Story = {
  render: () => (
    <DeleteConfirmation
      error="The post is being published right now. Try again in a minute."
      // A refusal arrives as a failed PREVIEW, which is what disables Confirm
      // and suppresses the "checking…" line. Passing only `error` modelled a
      // failed DELETE instead, which is a different state.
      previewError="The post is being published right now. Try again in a minute."
      onClose={fn()}
      onConfirm={fn()}
    />
  ),
}

export const DeletePublishedPlan: Story = {
  render: () => (
    <DeleteConfirmation
      label="plan"
      preview={{
        campaigns: 10,
        tasks: 60,
        publishedTasks: 12,
        snapshots: 240,
        requiresTypedConfirmation: true,
        conferenceTitle: 'Cloud Native Days Norway 2026',
      }}
      onClose={fn()}
      onConfirm={fn()}
    />
  ),
}
export const DeleteUnpublishedPlan: Story = {
  render: () => (
    <DeleteConfirmation
      label="plan"
      preview={{
        campaigns: 10,
        tasks: 60,
        publishedTasks: 0,
        snapshots: 10,
        requiresTypedConfirmation: false,
        conferenceTitle: 'Cloud Native Days Norway 2026',
      }}
      onClose={fn()}
      onConfirm={fn()}
    />
  ),
}
export const CheckingPlanDeletion: Story = {
  render: () => (
    <DeleteConfirmation label="plan" onClose={fn()} onConfirm={fn()} />
  ),
}
export const DeletingPlan: Story = {
  render: () => (
    <DeleteConfirmation
      label="plan"
      pending
      preview={{
        campaigns: 10,
        tasks: 60,
        publishedTasks: 0,
        snapshots: 10,
        requiresTypedConfirmation: false,
        conferenceTitle: 'Cloud Native Days Norway 2026',
      }}
      onClose={fn()}
      onConfirm={fn()}
    />
  ),
}
export const PlanPublishingRefusal: Story = {
  render: () => (
    <DeleteConfirmation
      label="plan"
      error="The post is being published right now. Try again in a minute."
      // A refusal arrives as a failed PREVIEW, which is what disables Confirm
      // and suppresses the "checking…" line. Passing only `error` modelled a
      // failed DELETE instead, which is a different state.
      previewError="The post is being published right now. Try again in a minute."
      onClose={fn()}
      onConfirm={fn()}
    />
  ),
}
