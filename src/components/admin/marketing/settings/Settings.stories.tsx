import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { mockDateBeforeEach, withPortalTheme } from '@/lib/storybook'
import { MILESTONES } from '@/lib/marketing/milestones'
import { BUILTIN_TEMPLATE } from '@/lib/marketing/template'
import type { PlanView } from '@/lib/marketing/types'
import { exportFixture } from '@/lib/marketing/report/__tests__/export-fixture'
import { PlanSettingsContent, PlanSettingsPage } from './PlanSettingsPage'
import { AddCampaignDialog } from './AddCampaignDialog'
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
        http.post('/api/trpc/marketing.campaign.addBuiltin', () =>
          HttpResponse.json({
            result: { data: { campaignId: 'added-campaign', tasks: 9 } },
          }),
        ),
        http.post('/api/trpc/marketing.campaign.create', () =>
          HttpResponse.json({
            result: { data: { campaignId: 'created-campaign' } },
          }),
        ),
      ],
    },
  },
  decorators: [
    withPortalTheme,
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
/** A blank plan: origin "Started blank", no template sentence, the empty Campaign list. */
export const BlankPlanSettings: Story = {
  render: () => (
    <PlanSettingsContent
      view={{
        ...plan,
        plan: {
          ...plan.plan,
          templateVersion: 'blank',
          structurallyEdited: false,
        },
        campaigns: [],
      }}
      onAdd={fn()}
      onEdit={fn()}
      onRecipes={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Started blank')).toBeInTheDocument()
    await expect(
      canvas.getByText('No Campaigns yet. Add one to begin.'),
    ).toBeInTheDocument()
    await expect(canvas.queryByText(/template/i)).toBeNull()
  },
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
        optional: true,
        _id: 'campaign',
        _rev: 'revision',
        key: 'cfp',
      }}
      onClose={fn()}
      onSave={fn()}
    />
  ),
  play: async () => {
    const modal = within(document.body)
    await expect(await modal.findByLabelText('Optional')).toBeChecked()
    await expect(
      modal.getByText(
        'A Template saved from this plan asks before creating this Campaign.',
      ),
    ).toBeInTheDocument()
  },
}
export const EditCampaignDark: Story = {
  ...EditCampaign,
  globals: { theme: 'dark' },
}
/**
 * "Add Campaign" on a plan that is missing built-in Campaigns (§4.2): each is
 * offered with its window in words and how many Recipes it carries.
 */
export const AddBuiltinCampaign: Story = {
  render: () => (
    <AddCampaignDialog
      campaignKeys={['cfp', 'earlyBird', 'speakers', 'finalPush']}
      onClose={fn()}
    />
  ),
  play: async () => {
    const modal = within(document.body)
    await expect(await modal.findByText('Keynotes')).toBeInTheDocument()
    await expect(
      modal.getByText('Speakers announced −28 d → Speakers announced'),
    ).toBeInTheDocument()
    // Already on the plan, so never offered a second time.
    await expect(modal.queryByLabelText('Add CFP')).toBeNull()
  },
}
export const AddBuiltinCampaignMobile: Story = {
  ...AddBuiltinCampaign,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
export const AddBuiltinCampaignDark: Story = {
  ...AddBuiltinCampaign,
  globals: { theme: 'dark' },
}
/** Every built-in is already on the plan: no switch, straight to the form. */
export const AddOwnCampaignOnly: Story = {
  render: () => (
    <AddCampaignDialog
      campaignKeys={BUILTIN_TEMPLATE.campaigns.map((campaign) => campaign.key)}
      onClose={fn()}
    />
  ),
  play: async () => {
    const modal = within(document.body)
    await expect(await modal.findByLabelText('Title')).toHaveValue('')
    await expect(
      modal.queryByRole('group', { name: 'How to add a Campaign' }),
    ).toBeNull()
  },
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
