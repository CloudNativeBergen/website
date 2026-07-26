import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { FormatsEditor } from './FormatsEditor'
import { NotificationProvider } from './NotificationProvider'

const handlers = [
  http.post('/api/trpc/conference.updateFormats', () =>
    HttpResponse.json({ result: { data: { success: true, updated: {} } } }),
  ),
]

const selectedFormats = ['lightning_10', 'presentation_25', 'workshop_120']

const meta = {
  title: 'Systems/Settings/Admin/FormatsEditor',
  component: FormatsEditor,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'The conference Formats editor (kill-Studio gap). Toggle which of the canonical CFP formats this conference offers. Unlike TopicsEditor the set is fixed, so there is no "create new". Saving replaces `conference.formats[]` (min 1).',
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
} satisfies Meta<typeof FormatsEditor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { selectedFormats, defaultOpen: true },
}

export const Dark: Story = {
  args: { selectedFormats, defaultOpen: true },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}
