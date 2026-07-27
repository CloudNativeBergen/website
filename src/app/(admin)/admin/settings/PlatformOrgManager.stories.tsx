import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { PlatformOrgManager } from './PlatformOrgManager'

/**
 * The PLATFORM-ONLY organization management card: every org with its plan, and
 * the per-org editor modal for the plan + feature-override rows. Rendered only
 * for the platform org (`PLATFORM_ORG_SLUG`); the save mutation is msw-mocked
 * so a story Save never hits the network unhandled.
 */
const handlers = [
  http.post('/api/trpc/platform.updateEntitlements', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const ORGANIZATIONS = [
  {
    _id: 'org-platform',
    name: 'Cloud Native Days',
    slug: 'cloud-native-days',
    plan: 'enterprise' as const,
    featureOverrides: [
      {
        _key: 'ov-1',
        feature: 'graphql-api',
        enabled: true,
        note: 'Dogfooding the public API',
      },
      {
        _key: 'ov-2',
        feature: 'slack-mirror',
        enabled: true,
        expiresAt: '2027-01-01T00:00:00Z',
      },
    ],
  },
  {
    _id: 'org-bergen',
    name: 'Cloud Native Bergen',
    slug: 'cloud-native-bergen',
    plan: 'community' as const,
    featureOverrides: [],
  },
  {
    _id: 'org-oslo',
    name: 'Cloud Native Oslo',
    slug: 'cloud-native-oslo',
    plan: 'pro' as const,
  },
]

const meta = {
  title: 'Systems/Settings/Admin/PlatformOrgManager',
  component: PlatformOrgManager,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        // ModalShell reads next-themes and portals to <body>, so the theme is
        // forced here — a plain `.dark` wrapper would not reach the portal.
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-gray-50 p-4 sm:p-6 dark:bg-gray-950">
                <div className="mx-auto max-w-xl">
                  <Story />
                </div>
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof PlatformOrgManager>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    organizations: ORGANIZATIONS,
  },
}

export const EditorOpen: Story = {
  args: {
    organizations: ORGANIZATIONS,
    defaultOpenOrgId: 'org-platform',
  },
}

export const EditorOpenNoOverrides: Story = {
  args: {
    organizations: ORGANIZATIONS,
    defaultOpenOrgId: 'org-bergen',
  },
}
