import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SPONSOR_CARD_VARIANTS, SponsorCard } from '@/components/studio-cards'

/**
 * The sponsor thank-you card as the studio renders it: `SponsorThankYou` (a
 * server component) generates the QR code and renders this client card, so the
 * story shows the real layout. Per-Format stories live under
 * Systems/Marketing/Studio Formats.
 */

const mockSponsor = {
  _id: 'sponsor-123',
  name: 'Acme Corporation',
  website: 'https://acme.example.com',
  logoBright:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><text x="100" y="54" font-family="sans-serif" font-size="40" font-weight="700" fill="white" text-anchor="middle">ACME</text></svg>',
}

const mockTier = {
  title: 'Ingress',
  tagline: 'Premium sponsorship tier',
  tierType: 'standard' as const,
}

const QR =
  "data:image/svg+xml,%3csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='120' height='120' fill='white'/%3e%3cpath d='M10,10 L20,10 L20,20 L10,20 Z M30,10 L40,10 L40,20 L30,20 Z M50,10 L60,10 L60,20 L50,20 Z M70,10 L80,10 L80,20 L70,20 Z M10,30 L20,30 L20,40 L10,40 Z M50,30 L60,30 L60,40 L50,40 Z M70,30 L80,30 L80,40 L70,40 Z M10,50 L20,50 L20,60 L10,60 Z M30,50 L40,50 L40,60 L30,60 Z M50,50 L60,50 L60,60 L50,60 Z M70,50 L80,50 L80,60 L70,60 Z M30,70 L40,70 L40,80 L30,80 Z M50,70 L60,70 L60,80 L50,80 Z' fill='black'/%3e%3c/svg%3e"

const meta = {
  title: 'Systems/Sponsors/Public/SponsorThankYou',
  component: SponsorCard,
  parameters: {
    docs: {
      description: {
        component:
          'Thank-you card for sponsors. Six visual variants (code-heroes, cloud-wizards, tech-ninjas, deploy-legends, kubernetes-masters, devops-rockstars) use the brand gradient system, or the cloud native pattern over a dark gradient. Square by default; landscape and portrait in the studio.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [...SPONSOR_CARD_VARIANTS],
      description: 'Visual variant with different gradient and messaging',
    },
    format: {
      control: 'select',
      options: ['square', 'landscape', 'portrait'],
    },
    showCloudNativePattern: {
      control: 'boolean',
      description: 'Show CNCF project icons pattern in background',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[480px] max-w-full p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    sponsor: mockSponsor,
    tier: mockTier,
    qrCodeUrl: QR,
    eventName: 'Cloud Native Days Norway',
    eventDate: 'June 10-11, 2026 • Bergen',
    format: 'square',
  },
} satisfies Meta<typeof SponsorCard>

export default meta
type Story = StoryObj<typeof meta>

export const CodeHeroes: Story = { args: { variant: 'code-heroes' } }
export const CloudWizards: Story = { args: { variant: 'cloud-wizards' } }
export const TechNinjas: Story = { args: { variant: 'tech-ninjas' } }
export const DeployLegends: Story = { args: { variant: 'deploy-legends' } }
export const KubernetesMasters: Story = {
  args: { variant: 'kubernetes-masters' },
}
export const DevOpsRockstars: Story = { args: { variant: 'devops-rockstars' } }
export const WithCloudNativePattern: Story = {
  args: { variant: 'code-heroes', showCloudNativePattern: true },
}
export const WithoutLogo: Story = {
  args: {
    variant: 'tech-ninjas',
    sponsor: { _id: 'nordic-labs', name: 'Nordic Cloud Foundry Labs' },
    format: 'landscape',
  },
}
