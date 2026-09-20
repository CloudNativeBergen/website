import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { mockDateBeforeEach, withPortalTheme } from '@/lib/storybook'
import {
  LIBRARY,
  allowedPlaceholders,
  editsOf,
  libraryEntry,
  type LibraryId,
} from '@/lib/marketing/library'
import { CampaignRecipesDialog } from './CampaignRecipesDialog'
import { RecipeForm } from './RecipeForm'
import type { LibraryEntryView } from './recipe-model'

/** The `campaign.recipes.library` response, built the way the router builds it. */
const rows: LibraryEntryView[] = LIBRARY.map((entry) => ({
  id: entry.id,
  title: entry.title,
  description: entry.description,
  recurring: entry.recipes.some((recipe) => recipe.cadence),
  hasImage: entry.recipes.some((recipe) => recipe.alt),
  channels: entry.recipes.flatMap((recipe) =>
    recipe.kind === 'publishing' && recipe.channel ? [recipe.channel] : [],
  ),
  placeholders: allowedPlaceholders(entry),
  defaults: editsOf(entry, entry.recipes),
}))
const row = (id: LibraryId) => rows.find((entry) => entry.id === id)!
const attachedRow = (id: LibraryId) => ({
  entry: id,
  edits: editsOf(libraryEntry(id), libraryEntry(id).recipes),
})
const campaign = {
  _id: 'campaign',
  _rev: 'rev-1',
  planId: 'plan',
  key: 'custom-final-push',
  title: 'Final push',
  primaryOutcome: 'ticketsSoldInWindow',
  target: 250,
  outcomeTargetPage: '/tickets',
  startMilestone: 'CONFERENCE_START',
  startOffsetDays: -28,
  endMilestone: 'CONFERENCE_START',
  endOffsetDays: -1,
  startDate: '2026-10-15',
  endDate: '2026-11-11',
  provisional: false,
  optional: false,
  attached: [attachedRow('speakerCard'), attachedRow('countdown')],
}

const meta = {
  title: 'Systems/Marketing/Settings/Recipes',
  component: CampaignRecipesDialog,
  args: { campaignId: 'campaign', onClose: fn() },
  beforeEach: mockDateBeforeEach(new Date('2026-06-17T12:00:00Z')),
  decorators: [
    withPortalTheme,
    (Story) => (
      <NotificationProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        http.get('/api/trpc/marketing.campaign.editing', () =>
          HttpResponse.json({ result: { data: campaign } }),
        ),
        http.get('/api/trpc/marketing.campaign.recipes.library', () =>
          HttpResponse.json({ result: { data: rows } }),
        ),
        http.post('/api/trpc/marketing.campaign.recipes.attach', () =>
          HttpResponse.json({
            result: { data: { created: 28, ceilingWarnings: [] } },
          }),
        ),
        http.post('/api/trpc/marketing.campaign.recipes.update', () =>
          HttpResponse.json({ result: { data: { ceilingWarnings: [] } } }),
        ),
        http.post('/api/trpc/marketing.campaign.recipes.remove', () =>
          HttpResponse.json({ result: { data: { success: true } } }),
        ),
      ],
    },
  },
} satisfies Meta<typeof CampaignRecipesDialog>
export default meta
type Story = StoryObj<typeof meta>

/** What the Campaign carries, and what the Library still offers. */
export const RecipeList: Story = {
  play: async () => {
    const modal = within(document.body)
    await expect(await modal.findByText('On this Campaign')).toBeInTheDocument()
    await expect(
      modal.getByText('Add from the Recipe Library'),
    ).toBeInTheDocument()
    await expect(
      modal.getByLabelText('Attach Sponsor thank-you card'),
    ).toBeInTheDocument()
  },
}
export const RecipeListMobile: Story = {
  ...RecipeList,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
export const RecipeListDark: Story = {
  ...RecipeList,
  globals: { theme: 'dark' },
}

/** Attaching the speaker card: a recurring Recipe with an image and a window. */
export const AttachSpeakerCard: Story = {
  render: () => (
    <RecipeForm
      entry={row('speakerCard')}
      initial={row('speakerCard').defaults}
      attached={false}
      onSubmit={fn()}
      onCancel={fn()}
    />
  ),
  play: async () => {
    const modal = within(document.body)
    await expect(
      await modal.findByRole('button', { name: 'Attach Recipe' }),
    ).toBeEnabled()
    await expect(modal.getByText('{name}')).toBeInTheDocument()
    await expect(modal.getByLabelText('Alt text')).toBeInTheDocument()
    await expect(modal.getAllByLabelText('Milestone')).toHaveLength(2)
  },
}
export const AttachSpeakerCardMobile: Story = {
  ...AttachSpeakerCard,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/** Editing the countdown: recurring, so a rate and a window — and already expanded. */
export const EditCountdown: Story = {
  render: () => (
    <RecipeForm
      entry={row('countdown')}
      initial={row('countdown').defaults}
      attached
      onSubmit={fn()}
      onCancel={fn()}
    />
  ),
  play: async () => {
    const modal = within(document.body)
    await expect(
      await modal.findByRole('button', { name: 'Save Recipe' }),
    ).toBeEnabled()
    await expect(
      modal.getByText(/Its countdown posts were created/),
    ).toBeInTheDocument()
    await expect(modal.getAllByLabelText('Milestone')).toHaveLength(2)
  },
}
export const EditCountdownMobile: Story = {
  ...EditCountdown,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
export const EditCountdownDark: Story = {
  ...EditCountdown,
  globals: { theme: 'dark' },
}
