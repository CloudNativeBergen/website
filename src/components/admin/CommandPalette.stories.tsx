import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { CommandPalette } from './CommandPalette'

const meta = {
  title: 'Systems/Admin/CommandPalette',
  decorators: [
    // CommandPalette reads `next-themes`; HeadlessUI portals the dialog to
    // document.body, so the toolbar's `.dark` wrapper never reaches it.
    // React context DOES cross portals, so forcing next-themes here (synced to
    // the Storybook theme global) is what actually renders the portalled
    // dialog dark.
    (Story, context) => (
      <ThemeProvider
        attribute="class"
        forcedTheme={context.globals.theme === 'dark' ? 'dark' : 'light'}
      >
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          '⌘K command palette for the admin dashboard. Destinations come from the static registry in `@/lib/admin/registry` (sidebar pages, sub-pages and Settings section anchors) and rank instantly with local prefix/subsequence scoring; live data results (proposals, speakers, sponsors) stream in below via `useUnifiedSearch`. An empty query lists every destination.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const emptyTrpcHandlers = [
  http.get('/api/trpc/proposal.admin.search', () =>
    HttpResponse.json({ result: { data: [] } }),
  ),
  http.get('/api/trpc/sponsor.list', () =>
    HttpResponse.json({ result: { data: [] } }),
  ),
  http.get('/api/trpc/speaker.admin.search', () =>
    HttpResponse.json({ result: { data: [] } }),
  ),
]

/**
 * Browse mode: the palette open with an empty query lists every registry
 * destination grouped by nav section + Settings. Shoot this story at 393px to
 * check width containment and overflow.
 */
export const Open: Story = {
  render: () => (
    <CommandPalette
      open={true}
      onClose={fn()}
      enabledFeatures={['workshops']}
    />
  ),
  parameters: { msw: { handlers: emptyTrpcHandlers } },
}

/**
 * FEATURE-GATED destinations (#689): for an org with no entitlements, every
 * destination tagged with a `feature` in the admin registry disappears from the
 * palette — matching the sidebar, which hides the same entries. Today that is
 * the workshop admin page.
 */
export const WithoutGatedFeatures: Story = {
  render: () => <CommandPalette open={true} onClose={fn()} />,
  parameters: { msw: { handlers: emptyTrpcHandlers } },
  play: async () => {
    const body = within(document.body)
    await body.findByText('Speakers')
    expect(body.queryByText('Workshops')).toBeNull()
  },
}

/**
 * Destination results for a settings synonym query — "tito" has no literal
 * match anywhere in the UI but resolves to the Tickets & Registration settings
 * section through registry keywords.
 */
export const WithDestinationResults: Story = {
  render: () => <CommandPalette open={true} onClose={fn()} />,
  parameters: { msw: { handlers: emptyTrpcHandlers } },
  play: async () => {
    const body = within(document.body)
    const input = await body.findByPlaceholderText(
      'Search pages, settings, proposals, speakers, sponsors...',
    )
    await userEvent.type(input, 'tito')
    await body.findByText('Tickets & Registration')
  },
}

/**
 * Registry destinations and live data results together: "kubernetes" matches
 * no static destination, so only the MSW-mocked proposal/speaker/sponsor
 * groups render below the input.
 */
export const WithDataResults: Story = {
  render: () => <CommandPalette open={true} onClose={fn()} />,
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/proposal.admin.search', () =>
          HttpResponse.json({
            result: {
              data: [
                {
                  _id: 'prop-1',
                  title: 'Building Resilient Microservices with Kubernetes',
                  status: 'accepted',
                  format: 'presentation_45',
                  speakers: [{ _id: 'spk-1', name: 'Jane Doe' }],
                },
                {
                  _id: 'prop-2',
                  title: 'Kubernetes Security Best Practices',
                  status: 'submitted',
                  format: 'presentation_25',
                  speakers: [{ _id: 'spk-2', name: 'John Smith' }],
                },
              ],
            },
          }),
        ),
        http.get('/api/trpc/sponsor.list', () =>
          HttpResponse.json({
            result: {
              data: [
                {
                  _id: 'sponsor-1',
                  name: 'Kubernetes Foundation',
                  website: 'https://kubernetes.io',
                },
              ],
            },
          }),
        ),
        http.get('/api/trpc/speaker.admin.search', () =>
          HttpResponse.json({
            result: {
              data: [
                {
                  _id: 'spk-1',
                  name: 'Jane Kubernetes Expert',
                  title: 'Cloud Architect',
                },
              ],
            },
          }),
        ),
      ],
    },
  },
  play: async () => {
    const body = within(document.body)
    const input = await body.findByPlaceholderText(
      'Search pages, settings, proposals, speakers, sponsors...',
    )
    await userEvent.type(input, 'kubernetes')
    await waitFor(
      async () => {
        await body.findByText('Kubernetes Foundation')
      },
      { timeout: 5000 },
    )
  },
}
