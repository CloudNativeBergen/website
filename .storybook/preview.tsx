import type { Preview } from '@storybook/nextjs-vite'
import type { Decorator } from '@storybook/nextjs-vite'
import { initialize, mswLoader } from 'msw-storybook-addon'
import { TRPCDecorator } from './decorators/TRPCDecorator'
import '../src/styles/tailwind.css'

// Initialize MSW
initialize()

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
        query: {},
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#ffffff',
        },
        {
          name: 'dark',
          value: '#111827',
        },
      ],
    },
    options: {
      storySort: {
        order: [
          'Getting Started',
          ['Introduction', 'Developer Guide'],
          'Design System',
          [
            'Foundation',
            ['Colors', 'Typography', 'Spacing', 'Shadows', 'Icons'],
            'Brand',
            [
              'Brand Story',
              'Color Palette',
              'Typography',
              'Buttons',
              'Cloud Native Patterns',
            ],
            'Examples',
            ['Hero Sections'],
          ],
          'Components',
          ['Button', 'Container', 'BackLink', 'VideoEmbed'],
          'Systems',
          [
            'Speakers',
            ['Overview', 'SpeakerAvatars'],
            'Sponsors',
            ['Architecture', 'Workflow Diagram', 'SponsorLogo', 'Sponsors', 'SponsorThankYou'],
            'Email',
            ['Overview'],
          ],
          'Admin',
          [
            'Overview',
            'Proposals',
            ['ProposalCard', 'ProposalStatistics'],
            'Sponsors',
            [
              'Component Index',
              'Dashboard',
              ['Metrics', 'Activity Timeline'],
              'Pipeline',
              ['SponsorCard', 'BoardViewSwitcher', 'SponsorBoardColumn', 'SponsorBulkActions'],
              'Form',
            ],
          ],
        ],
      },
    },
  },
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    TRPCDecorator,
    ((Story, context) => {
      const theme = context.globals.theme || 'light'
      return (
        <div className={theme === 'dark' ? 'dark' : ''}>
          <div className="bg-white p-8 dark:bg-gray-900">
            <Story />
          </div>
        </div>
      )
    }) as Decorator,
  ],
  loaders: [mswLoader],
}

export default preview
