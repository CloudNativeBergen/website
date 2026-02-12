import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  StarIcon,
  RocketLaunchIcon,
  CpuChipIcon,
  CodeBracketIcon,
  CommandLineIcon,
  BoltIcon,
} from '@heroicons/react/24/solid'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { InlineSvg } from './InlineSvg'

// Mock data
const mockSponsor = {
  _id: 'sponsor-123',
  name: 'Acme Corporation',
  website: 'https://acme.example.com',
  logo: '<svg width="200" height="80"><text x="10" y="50" font-size="40" fill="white">ACME</text></svg>',
  logoBright: '<svg width="200" height="80"><text x="10" y="50" font-size="40" fill="white">ACME</text></svg>',
}

const mockTier = {
  title: 'Ingress',
  tagline: 'Premium sponsorship tier',
  tierType: 'standard' as const,
}

const FALLBACK_QR_CODE =
  "data:image/svg+xml,%3csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='120' height='120' fill='white'/%3e%3cpath d='M10,10 L20,10 L20,20 L10,20 Z M30,10 L40,10 L40,20 L30,20 Z M50,10 L60,10 L60,20 L50,20 Z M70,10 L80,10 L80,20 L70,20 Z M10,30 L20,30 L20,40 L10,40 Z M50,30 L60,30 L60,40 L50,40 Z M70,30 L80,30 L80,40 L70,40 Z M10,50 L20,50 L20,60 L10,60 Z M30,50 L40,50 L40,60 L30,60 Z M50,50 L60,50 L60,60 L50,60 Z M70,50 L80,50 L80,60 L70,60 Z M30,70 L40,70 L40,80 L30,80 Z M50,70 L60,70 L60,80 L50,80 Z' fill='black'/%3e%3c/svg%3e"

type SponsorVariant =
  | 'code-heroes'
  | 'cloud-wizards'
  | 'tech-ninjas'
  | 'deploy-legends'
  | 'kubernetes-masters'
  | 'devops-rockstars'

interface VariantConfig {
  gradient: string
  accentColor: string
  icon: React.ComponentType<{ className?: string }>
  headerText: string
  footerText: string
}

const variantConfig: Record<SponsorVariant, VariantConfig> = {
  'code-heroes': {
    gradient: 'from-brand-fresh-green to-brand-cloud-blue',
    accentColor: 'text-white',
    icon: CodeBracketIcon,
    headerText: 'Code Heroes',
    footerText: 'Your support powers our community of cloud native developers and innovators',
  },
  'cloud-wizards': {
    gradient: 'from-brand-cloud-blue to-brand-sunbeam-yellow',
    accentColor: 'text-white',
    icon: RocketLaunchIcon,
    headerText: 'Cloud Wizards',
    footerText: 'Casting spells in the cloud and making distributed systems magic happen',
  },
  'tech-ninjas': {
    gradient: 'from-purple-600 to-brand-fresh-green',
    accentColor: 'text-white',
    icon: CommandLineIcon,
    headerText: 'Tech Ninjas',
    footerText: 'Stealthily deploying awesome tech and enabling developer superpowers',
  },
  'deploy-legends': {
    gradient: 'from-brand-nordic-purple to-brand-cloud-blue',
    accentColor: 'text-white',
    icon: RocketLaunchIcon,
    headerText: 'Deploy Legends',
    footerText: 'Legends who keep the cloud running and deployments flowing',
  },
  'kubernetes-masters': {
    gradient: 'from-brand-cloud-blue to-brand-fresh-green',
    accentColor: 'text-white',
    icon: CpuChipIcon,
    headerText: 'Kubernetes Masters',
    footerText: 'Orchestrating containers and mastering the cloud native way',
  },
  'devops-rockstars': {
    gradient: 'from-brand-sunbeam-yellow to-brand-nordic-purple',
    accentColor: 'text-white',
    icon: BoltIcon,
    headerText: 'DevOps Rockstars',
    footerText: 'Rocking automation and continuous delivery like true stars',
  },
}

// Synchronous version for Storybook
function SponsorThankYouStorybook({
  sponsor,
  tier,
  variant = 'code-heroes',
  className = '',
  eventName = 'Cloud Native Days',
  eventDate,
  showCloudNativePattern = false,
}: {
  sponsor: typeof mockSponsor
  tier: typeof mockTier
  variant?: SponsorVariant
  className?: string
  eventName?: string
  eventDate?: string
  showCloudNativePattern?: boolean
}) {
  const config = variantConfig[variant]
  const Icon = config.icon
  const backgroundStyle = showCloudNativePattern
    ? 'from-slate-900 via-blue-900 to-slate-900'
    : config.gradient

  return (
    <div
      className={`group @container relative overflow-hidden rounded-2xl bg-linear-to-br ${backgroundStyle} border border-gray-200 transition-all duration-300 hover:shadow-xl ${className}`}
      style={{ aspectRatio: '16/9' }}
    >
      {showCloudNativePattern && (
        <div className="absolute inset-0 bg-linear-to-br from-slate-900/10 via-blue-900/10 to-slate-900/10 opacity-25" />
      )}

      <div className="relative flex h-full text-white">
        <div className="flex flex-1 flex-col justify-between p-[3cqw] pr-[1cqw] @xs:p-[4cqw] @xs:pr-[1.5cqw] @md:p-[5cqw] @md:pr-[2cqw] @xl:p-[6cqw] @xl:pr-[2.5cqw]">
          <header className="shrink-0">
            <div className="mb-[1cqw] flex items-center gap-[2cqw] @xs:mb-[1.5cqw] @xs:gap-[2.5cqw] @md:mb-[2cqw] @md:gap-[3cqw]">
              <Icon className="h-[5cqw] w-[5cqw] @xs:h-[5.5cqw] @xs:w-[5.5cqw] @md:h-[6cqw] @md:w-[6cqw] @xl:h-[7cqw] @xl:w-[7cqw]" />
              <span className="font-inter text-[3.5cqw] font-bold leading-tight @xs:text-[4cqw] @md:text-[4.5cqw] @xl:text-[5cqw]">
                {config.headerText}
              </span>
            </div>
            <h1 className="font-space-grotesk text-[5cqw] font-bold leading-tight @xs:text-[5.5cqw] @md:text-[6.5cqw] @xl:text-[7.5cqw]">
              {eventName}
            </h1>
            {eventDate && (
              <p className="mt-[0.5cqw] font-inter text-[2.5cqw] opacity-90 @xs:text-[3cqw] @md:text-[3.5cqw]">
                {eventDate}
              </p>
            )}
          </header>

          <div className="flex flex-1 flex-col justify-center py-[2cqw]">
            <div className="mb-[1.5cqw] @xs:mb-[2cqw] @md:mb-[2.5cqw]">
              <p className="mb-[1cqw] font-space-grotesk text-[3cqw] font-semibold @xs:mb-[1.5cqw] @xs:text-[3.5cqw] @md:text-[4cqw] @xl:text-[4.5cqw]">
                Thank you
              </p>
              <div className="flex items-center gap-[2cqw] @xs:gap-[2.5cqw] @md:gap-[3cqw]">
                {sponsor.logo && (
                  <div className="w-[20cqw] @xs:w-[22cqw] @md:w-[25cqw] @xl:w-[28cqw]">
                    <InlineSvg
                      value={sponsor.logoBright || sponsor.logo}
                      className="h-auto w-full"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-white/10 p-[2cqw] backdrop-blur-sm @xs:p-[2.5cqw] @md:p-[3cqw]">
              <div className="mb-[1cqw] flex items-center gap-[1.5cqw] @xs:mb-[1.5cqw] @xs:gap-[2cqw]">
                <StarIcon className="h-[4cqw] w-[4cqw] @xs:h-[4.5cqw] @xs:w-[4.5cqw] @md:h-[5cqw] @md:w-[5cqw]" />
                <span className="font-space-grotesk text-[3cqw] font-bold @xs:text-[3.5cqw] @md:text-[4cqw]">
                  {tier.title} Sponsor
                </span>
              </div>
              <p className="font-inter text-[2cqw] leading-relaxed opacity-90 @xs:text-[2.5cqw] @md:text-[3cqw]">
                {config.footerText}
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-[25cqw] shrink-0 flex-col items-center justify-center border-l border-white/20 bg-white/10 p-[2cqw] backdrop-blur-sm @xs:w-[28cqw] @xs:p-[2.5cqw] @md:w-[30cqw] @md:p-[3cqw] @xl:w-[32cqw]">
          <div className="mb-[2cqw] flex flex-col items-center @xs:mb-[2.5cqw] @md:mb-[3cqw]">
            <div className="relative mb-[1.5cqw] overflow-hidden rounded-xl bg-white p-[1.5cqw] shadow-lg @xs:mb-[2cqw] @xs:p-[2cqw] @md:p-[2.5cqw]">
              <img
                src={FALLBACK_QR_CODE}
                alt="QR Code"
                className="h-[15cqw] w-[15cqw] @xs:h-[17cqw] @xs:w-[17cqw] @md:h-[18cqw] @md:w-[18cqw] @xl:h-[20cqw] @xl:w-[20cqw]"
              />
            </div>
            <div className="flex flex-col items-center text-center">
              <QrCodeIcon className="mb-[0.5cqw] h-[3cqw] w-[3cqw] opacity-80 @xs:h-[3.5cqw] @xs:w-[3.5cqw] @md:h-[4cqw] @md:w-[4cqw]" />
              <p className="font-inter text-[1.8cqw] font-medium @xs:text-[2cqw] @md:text-[2.5cqw]">
                Scan to learn more
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const meta: Meta<typeof SponsorThankYouStorybook> = {
  title: 'Systems/Sponsors/Components/SponsorThankYou',
  component: SponsorThankYouStorybook,
  parameters: {
    docs: {
      description: {
        component:
          'Animated thank-you card for sponsors featuring cloud native patterns with authentic CNCF project logos. Six visual variants (code-heroes, cloud-wizards, tech-ninjas, deploy-legends, kubernetes-masters, devops-rockstars) use the brand gradient system and focus/diffusion technology for atmospheric depth. Perfect for social media sharing and sponsor recognition.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'code-heroes',
        'cloud-wizards',
        'tech-ninjas',
        'deploy-legends',
        'kubernetes-masters',
        'devops-rockstars',
      ],
      description: 'Visual variant with different gradient and messaging',
    },
    showCloudNativePattern: {
      control: 'boolean',
      description: 'Show CNCF project icons pattern in background',
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-5xl p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SponsorThankYouStorybook>

export const CodeHeroes: Story = {
  args: {
    sponsor: mockSponsor,
    tier: mockTier,
    variant: 'code-heroes',
    eventName: 'Cloud Native Days Norway',
    eventDate: 'June 10-11, 2026 • Bergen',
  },
}

export const CloudWizards: Story = {
  args: {
    sponsor: mockSponsor,
    tier: mockTier,
    variant: 'cloud-wizards',
    eventName: 'Cloud Native Days Norway',
    eventDate: 'June 10-11, 2026 • Bergen',
  },
}

export const TechNinjas: Story = {
  args: {
    sponsor: mockSponsor,
    tier: mockTier,
    variant: 'tech-ninjas',
    eventName: 'Cloud Native Days Norway',
    eventDate: 'June 10-11, 2026 • Bergen',
  },
}

export const DeployLegends: Story = {
  args: {
    sponsor: mockSponsor,
    tier: mockTier,
    variant: 'deploy-legends',
    eventName: 'Cloud Native Days Norway',
    eventDate: 'June 10-11, 2026 • Bergen',
  },
}

export const KubernetesMasters: Story = {
  args: {
    sponsor: mockSponsor,
    tier: mockTier,
    variant: 'kubernetes-masters',
    eventName: 'Cloud Native Days Norway',
    eventDate: 'June 10-11, 2026 • Bergen',
  },
}

export const DevOpsRockstars: Story = {
  args: {
    sponsor: mockSponsor,
    tier: mockTier,
    variant: 'devops-rockstars',
    eventName: 'Cloud Native Days Norway',
    eventDate: 'June 10-11, 2026 • Bergen',
  },
}

export const WithCloudNativePattern: Story = {
  args: {
    sponsor: mockSponsor,
    tier: mockTier,
    variant: 'code-heroes',
    eventName: 'Cloud Native Days Norway',
    eventDate: 'June 10-11, 2026 • Bergen',
    showCloudNativePattern: true,
  },
}
