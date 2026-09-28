import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { mockDateBeforeEach, withPortalTheme } from '@/lib/storybook'
import {
  LIBRARY,
  editsOf,
  libraryEntry,
  libraryEntryView,
  type LibraryId,
} from '@/lib/marketing/library'
import { CampaignRecipesDialog } from './CampaignRecipesDialog'
import { RecipeForm } from './RecipeForm'

/** The `campaign.recipes.library` response, built the way the router builds it. */
const rows = LIBRARY.map((entry) => libraryEntryView(entry))
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

/**
 * Attaching the talk teaser: a talk names ALL of its speakers, so the talk
 * placeholders include `{speakers}` — each with their title (#1153).
 */
export const AttachTalkTeaser: Story = {
  render: () => (
    <RecipeForm
      entry={row('talkTeaser')}
      initial={row('talkTeaser').defaults}
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
    await expect(modal.getAllByText('{speakers}').length).toBeGreaterThan(0)
    await expect(
      modal.getByDisplayValue(/Answered at \{event\} by \{speakers\}\./),
    ).toBeInTheDocument()
  },
}
export const AttachTalkTeaserMobile: Story = {
  ...AttachTalkTeaser,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
export const AttachTalkTeaserDark: Story = {
  ...AttachTalkTeaser,
  globals: { theme: 'dark' },
}

/**
 * "Tag the subject" (#1156, tagging spec §2): off for a new Recipe, even
 * though the built-in speaker card tags. Switched on here, as an organizer
 * would, so the capture shows it on.
 */
export const TagTheSubject: Story = {
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
    const toggle = await modal.findByRole('switch', { name: 'Tag the subject' })
    await expect(toggle).not.toBeChecked()
    await expect(toggle).toHaveAccessibleDescription(/Bluesky handle/)
    await userEvent.click(toggle)
    await expect(toggle).toBeChecked()
    toggle.scrollIntoView({ block: 'center' })
  },
}
export const TagTheSubjectMobile: Story = {
  ...TagTheSubject,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
export const TagTheSubjectDark: Story = {
  ...TagTheSubject,
  globals: { theme: 'dark' },
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
      modal.getByText(/posts already exist, so an edit here changes none/),
    ).toBeInTheDocument()
    // Days before the conference, and no Milestone to choose (the countdown
    // counts down to it).
    await expect(modal.getByLabelText('First post, days before')).toHaveValue(
      30,
    )
    await expect(modal.queryByLabelText('Milestone')).toBeNull()
    // Nobody to tag: a countdown has no subject.
    await expect(modal.queryByRole('switch')).toBeNull()
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
