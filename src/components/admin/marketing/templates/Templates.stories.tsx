import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { mockDateBeforeEach, withPortalTheme } from '@/lib/storybook'
import type { ReviewItem } from '@/lib/marketing/plan-templates'
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog'
import { TemplatesPage } from './TemplatesPage'
import type {
  TemplatePreview,
  TemplateSummary,
  TemplateVersionRow,
} from './template-model'

const json = (data: unknown) => HttpResponse.json({ result: { data } })

const TEMPLATES: TemplateSummary[] = [
  {
    templateId: 'template-1',
    name: 'Bergen playbook',
    latestVersion: 3,
    campaigns: 6,
    savedAt: '2026-06-17T10:00:00Z',
  },
  {
    templateId: 'template-2',
    name: 'Small one-day edition',
    latestVersion: 1,
    campaigns: 3,
    savedAt: '2025-11-02T09:30:00Z',
  },
]
const VERSIONS: TemplateVersionRow[] = [
  {
    version: 3,
    savedAt: '2026-06-17T10:00:00Z',
    savedByName: 'Ada Organizer',
    savedFromTitle: 'Cloud Native Days Norway 2026',
    restoredFrom: 1,
  },
  {
    version: 2,
    savedAt: '2026-02-01T08:00:00Z',
    savedByName: 'Bob Builder',
    savedFromTitle: 'Cloud Native Days Norway 2026',
    restoredFrom: null,
  },
  {
    version: 1,
    savedAt: '2025-06-17T10:00:00Z',
    savedByName: 'Ada Organizer',
    savedFromTitle: 'Cloud Native Days Norway 2025',
    restoredFrom: null,
  },
]
const preview = (version: number): TemplatePreview => ({
  name: 'Bergen playbook',
  version,
  campaigns: [
    {
      key: 'cfp',
      title: 'Call for papers',
      optional: false,
      start: { milestone: 'CFP_OPEN', offsetDays: 0 },
      end: { milestone: 'CFP_CLOSE', offsetDays: 1 },
      primaryOutcome: 'cfpSubmissions',
      tasks: 9,
      recipes: ['Speaker card'],
    },
    {
      key: 'earlyBird',
      title: 'Early bird',
      optional: false,
      start: { milestone: 'TICKETS_OPEN', offsetDays: 0 },
      end: { milestone: 'EARLY_BIRD_END', offsetDays: 0 },
      primaryOutcome: 'ticketsSoldInWindow',
      tasks: 7,
      recipes: ['Countdown', 'Sponsor thank-you card'],
    },
    ...(version < 3
      ? [
          {
            key: 'keynotes',
            title: 'Keynotes',
            optional: true,
            start: {
              milestone: 'SPEAKERS_ANNOUNCED' as const,
              offsetDays: -28,
            },
            end: { milestone: 'SPEAKERS_ANNOUNCED' as const, offsetDays: 0 },
            primaryOutcome: 'ticketsSoldInWindow' as const,
            tasks: 4,
            recipes: [],
          },
        ]
      : []),
  ],
})

const REVIEW: ReviewItem[] = [
  {
    taskId: 'marketingTask.a',
    title: 'Venue photo post',
    campaignTitle: 'Final push',
    type: 'anchor',
    anchor: { milestone: 'CONFERENCE_START', offsetDays: -7 },
    date: '2026-11-05',
  },
  {
    taskId: 'marketingTask.b',
    title: 'Early-bird reminder',
    campaignTitle: 'Early bird',
    type: 'anchor',
    anchor: { milestone: 'EARLY_BIRD_END', offsetDays: -3 },
    date: '2026-09-28',
  },
  {
    taskId: 'marketingTask.b',
    title: 'Early-bird reminder',
    campaignTitle: 'Early bird',
    type: 'copy',
    text: 'Three days left of early bird for Cloud Native Days Norway in Bergen — tickets close 28 September 2026.',
  },
]

const templateHandlers = (options?: {
  templates?: TemplateSummary[]
  review?: ReviewItem[]
  unsavedTargets?: { campaignTitle: string; target: number }[]
}) => {
  const templates = options?.templates ?? TEMPLATES
  return [
    http.get('/api/trpc/marketing.template.list', () => json(templates)),
    http.get('/api/trpc/marketing.template.versions', () => json(VERSIONS)),
    http.get('/api/trpc/marketing.template.preview', ({ request }) => {
      const raw = new URL(request.url).searchParams.get('input')
      const version = raw ? (JSON.parse(raw) as { version: number }).version : 3
      return json(preview(version))
    }),
    http.get('/api/trpc/marketing.template.savePreview', () =>
      json({
        review: options?.review ?? REVIEW,
        unsavedTargets: options?.unsavedTargets ?? [],
        fingerprint: 'story-fingerprint',
        templates: templates.map(({ templateId, name, latestVersion }) => ({
          templateId,
          name,
          latestVersion,
        })),
      }),
    ),
    http.post('/api/trpc/marketing.template.save', () =>
      json({ templateId: 'template-1', version: 4 }),
    ),
    http.post('/api/trpc/marketing.template.restore', () =>
      json({ version: 4 }),
    ),
    http.post('/api/trpc/marketing.template.rename', () =>
      json({ success: true }),
    ),
    http.post('/api/trpc/marketing.template.delete', () =>
      json({ deleted: true }),
    ),
  ]
}

const meta = {
  title: 'Systems/Marketing/Templates',
  component: TemplatesPage,
  beforeEach: mockDateBeforeEach(new Date('2026-06-17T12:00:00Z')),
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: templateHandlers() },
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
} satisfies Meta<typeof TemplatesPage>
export default meta
type Story = StoryObj<typeof meta>

/** The list, the selected Template's history, and a preview of its latest version. */
export const Templates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Once in the list, once as the open Template's heading.
    await expect(await canvas.findAllByText('Bergen playbook')).toHaveLength(2)
    // The history and the preview are separate requests: await each.
    await expect(
      await canvas.findByText('Version 3 · latest'),
    ).toBeInTheDocument()
    await expect(
      await canvas.findByText(/restored from v1/),
    ).toBeInTheDocument()
    await expect(
      await canvas.findByText(
        'Plus what its Recipes create: Countdown, Sponsor thank-you card',
      ),
    ).toBeInTheDocument()
  },
}
export const TemplatesMobile: Story = {
  ...Templates,
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}
export const TemplatesDark: Story = {
  ...Templates,
  globals: { theme: 'dark' },
}

/** An older version selected: its own Campaigns, and Restore beside it. */
export const OlderVersion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByText('Version 1'))
    await expect(await canvas.findByText('Keynotes')).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Restore version 1' }),
    ).toBeInTheDocument()
  },
}

/** Deleting the whole Template: it is named, and its name must be typed. */
export const DeleteTemplate: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete' }))
    const modal = within(document.body)
    await expect(
      await modal.findByText('Delete the Template “Bergen playbook”?'),
    ).toBeInTheDocument()
    await expect(
      modal.getByRole('button', { name: 'Delete Template' }),
    ).toBeDisabled()
  },
}
export const DeleteTemplateDark: Story = {
  ...DeleteTemplate,
  globals: { theme: 'dark' },
}

/** Nothing saved yet: where a Template comes from. */
export const NoTemplatesYet: Story = {
  parameters: {
    ...meta.parameters,
    msw: { handlers: templateHandlers({ templates: [] }) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('No Templates yet.'),
    ).toBeInTheDocument()
    await expect(canvas.getByText('Go to plan settings')).toBeInTheDocument()
  },
}

/** Save as Template with a review list: two unanchored Tasks and one literal post. */
export const SaveAsTemplate: Story = {
  render: () => <SaveAsTemplateDialog onClose={fn()} />,
  play: async () => {
    const modal = within(document.body)
    await expect(await modal.findByText('Unanchored Tasks')).toBeInTheDocument()
    await expect(
      modal.getByText('Tasks carrying literal copy'),
    ).toBeInTheDocument()
    await expect(
      modal.getByLabelText('Copy for Early-bird reminder'),
    ).toHaveValue(
      'Three days left of early bird for Cloud Native Days Norway in Bergen — tickets close 28 September 2026.',
    )
    await expect(
      modal.getByRole('radio', { name: 'New version of…' }),
    ).toBeInTheDocument()
  },
}
export const SaveAsTemplateMobile: Story = {
  ...SaveAsTemplate,
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}
export const SaveAsTemplateDark: Story = {
  ...SaveAsTemplate,
  globals: { theme: 'dark' },
}

/** A `{token}` no static Task could fill in: refused while typing, Save blocked. */
export const SaveAsTemplateRefusal: Story = {
  render: () => <SaveAsTemplateDialog onClose={fn()} />,
  play: async () => {
    const modal = within(document.body)
    const copy = await modal.findByLabelText('Copy for Early-bird reminder')
    await userEvent.clear(copy)
    await userEvent.type(copy, 'Hi {{name}, early bird ends {{date}')
    await expect(
      await modal.findByText(
        '{name} cannot be filled in for a Task like this one.',
      ),
    ).toBeInTheDocument()
    await expect(
      modal.getByRole('button', { name: 'Save as Template' }),
    ).toBeDisabled()
  },
}

/** A plan whose Tasks are all anchored and all keep their skeleton. */
export const NothingToDecide: Story = {
  render: () => <SaveAsTemplateDialog onClose={fn()} />,
  parameters: {
    ...meta.parameters,
    msw: { handlers: templateHandlers({ review: [] }) },
  },
  play: async () => {
    const modal = within(document.body)
    await expect(
      await modal.findByText(/Nothing needs a decision\./),
    ).toBeInTheDocument()
  },
}
/** No ticket capacity on the edition: its Targets cannot become a share. */
export const UnsavedTargets: Story = {
  render: () => <SaveAsTemplateDialog onClose={fn()} />,
  parameters: {
    ...meta.parameters,
    msw: {
      handlers: templateHandlers({
        review: [],
        unsavedTargets: [
          { campaignTitle: 'Early bird', target: 120 },
          { campaignTitle: 'Call for papers', target: 80 },
        ],
      }),
    },
  },
  play: async () => {
    const modal = within(document.body)
    await expect(
      await modal.findByText('These Targets will not be saved'),
    ).toBeInTheDocument()
    await expect(
      modal.getByText(/Early bird \(120\), Call for papers \(80\)/),
    ).toBeInTheDocument()
  },
}
export const UnsavedTargetsMobileDark: Story = {
  ...UnsavedTargets,
  globals: { theme: 'dark' },
  parameters: {
    ...UnsavedTargets.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}
export const NothingToDecideMobile: Story = {
  ...NothingToDecide,
  parameters: {
    ...NothingToDecide.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}
