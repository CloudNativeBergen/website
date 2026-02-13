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
            ['Spacing', 'Shadows', 'Icons'],
            'Brand',
            [
              'Brand Story',
              'Color Palette',
              'Typography',
              'Buttons',
              'Cloud Native Patterns',
            ],
            'Examples',
            ['Hero Sections', 'Conference Landing Page', 'Admin Pages'],
          ],
          'Components',
          ['Data Display', 'Feedback', 'Forms', 'Icons', 'Layout'],
          'Systems',
          [
            'Program',
            [
              'Architecture',
              'TalkCard',
              'TalkPromotionCard',
              'ProgramFilters',
              'ViewModeSelector',
              'ProgramScheduleView',
              'ProgramGridView',
              'ProgramListView',
              'ProgramAgendaView',
            ],
            'Proposals',
            [
              'Architecture',
              'Admin',
              [
                'ProposalsList',
                'ProposalCard',
                'ProposalsFilter',
                'ProposalStatistics',
                'ProposalPreview',
                'ProposalReviewForm',
                'ProposalReviewList',
                'ProposalReviewSummary',
                'FeaturedTalksManager',
              ],
              'ProposalCoSpeaker',
              'ProposalGuidanceSidebar',
              'CompactProposalList',
              'AttachmentDisplay',
            ],
            'Speakers',
            [
              'Architecture',
              'Admin',
              [
                'SpeakerTable',
                'SpeakerActions',
                'SpeakerMultiSelect',
                'FeaturedSpeakersManager',
              ],
              'Overview',
              'SpeakerAvatars',
              'ClickableSpeakerNames',
              'SpeakerDetailsForm',
              'SpeakerProfilePreview',
            ],
            'Sponsors',
            [
              'Architecture',
              'Workflow Diagram',
              'Admin',
              [
                'Overview',
                'Pipeline',
                [
                  'SponsorCRMPipeline',
                  'SponsorCard',
                  'SponsorBoardColumn',
                  'BoardViewSwitcher',
                  'SponsorCRMForm',
                  'SponsorBulkActions',
                  'MobileFilterSheet',
                  'OnboardingLinkButton',
                  'SendContractButton',
                  'ContractReadinessIndicator',
                  'ImportHistoricSponsorsButton',
                ],
                'Dashboard',
                ['Metrics', 'Action Items', 'Activity Timeline'],
                'Tiers',
                [
                  'SponsorTiersPage',
                  'SponsorTierManagement',
                  'SponsorTierEditor',
                  'SponsorAddModal',
                ],
                'Contacts',
                [
                  'SponsorContactTable',
                  'SponsorContactEditor',
                  'SponsorContactActions',
                ],
                'Email',
                [
                  'EmailModal',
                  'SponsorIndividualEmailModal',
                  'SponsorDiscountEmailModal',
                ],
                'Form',
                [
                  'SponsorLogoEditor',
                  'SponsorCombobox',
                  'TierRadioGroup',
                  'StatusListbox',
                  'OrganizerCombobox',
                  'TagCombobox',
                  'ContractValueInput',
                  'AddonsCheckboxGroup',
                ],
                'SponsorCRMFilterBar',
                'SponsorContactRoleSelect',
              ],
              'Components',
              ['SponsorLogo', 'Sponsors', 'SponsorThankYou'],
              'Onboarding',
              ['SponsorOnboardingForm', 'SponsorOnboardingLogoUpload'],
              'Email',
              ['SponsorTemplatePicker', 'SponsorEmailTemplateEditor'],
              'Form',
              ['SponsorGlobalInfoFields'],
              'Stream',
              ['SponsorBanner'],
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
