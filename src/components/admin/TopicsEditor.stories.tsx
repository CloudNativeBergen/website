import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { TopicsEditor } from './TopicsEditor'
import { NotificationProvider } from './NotificationProvider'

const allTopics = [
  {
    _id: 't-1',
    _type: 'topic',
    title: 'Kubernetes',
    color: '#2563EB',
    slug: { current: 'kubernetes' },
  },
  {
    _id: 't-2',
    _type: 'topic',
    title: 'Observability',
    color: '#16A34A',
    slug: { current: 'observability' },
  },
  {
    _id: 't-3',
    _type: 'topic',
    title: 'Platform Engineering',
    color: '#7C3AED',
    slug: { current: 'platform-engineering' },
  },
  {
    _id: 't-4',
    _type: 'topic',
    title: 'Security',
    color: '#DC2626',
    slug: { current: 'security' },
  },
  {
    _id: 't-5',
    _type: 'topic',
    title: 'FinOps',
    color: '#D97706',
    slug: { current: 'finops' },
  },
]

const handlers = [
  http.get('/api/trpc/topic.list', () =>
    HttpResponse.json({ result: { data: allTopics } }),
  ),
  http.post('/api/trpc/topic.create', () =>
    HttpResponse.json({
      result: {
        data: {
          _id: 't-new',
          _type: 'topic',
          title: 'New Topic',
          color: '#0891B2',
          slug: { current: 'new-topic' },
        },
      },
    }),
  ),
  http.post('/api/trpc/conference.updateTopics', () =>
    HttpResponse.json({ result: { data: { success: true, updated: {} } } }),
  ),
]

const selectedTopics = [
  { _id: 't-1', title: 'Kubernetes', color: '#2563EB' },
  { _id: 't-2', title: 'Observability', color: '#16A34A' },
]

const meta = {
  title: 'Systems/Settings/Admin/TopicsEditor',
  component: TopicsEditor,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'SE-2 — the conference Topics editor. Multi-select from existing topics (each with its color chip) and create a NEW topic inline without leaving the modal. Saving replaces `conference.topics[]` (min 1).',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-white p-6 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof TopicsEditor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { selectedTopics, defaultOpen: true },
}

export const Dark: Story = {
  args: { selectedTopics, defaultOpen: true },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}
