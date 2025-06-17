import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { iconForLink } from '@/components/SocialIcons'
import {
  InformationCircleIcon,
  UserGroupIcon,
  MicrophoneIcon,
  CalendarDaysIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { PortableText } from '@portabletext/react'

function ActionButtons({ conference }: { conference: Conference }) {
  const buttons: Array<{
    label: string
    href: string
    variant:
      | 'primary'
      | 'secondary'
      | 'success'
      | 'warning'
      | 'info'
      | 'outline'
    icon: React.ComponentType<{ className?: string }>
  }> = [
    {
      label: 'Practical Info',
      href: '/info',
      variant: 'outline',
      icon: InformationCircleIcon,
    },
  ]

  const seekingSponsors =
    conference.start_date &&
    new Date(conference.start_date).getTime() - new Date().getTime() >
      4 * 7 * 24 * 60 * 60 * 1000

  if (seekingSponsors) {
    buttons.push({
      label: 'Become a Sponsor',
      href: '/sponsor',
      variant: 'success',
      icon: UserGroupIcon,
    })
  }

  const cfpIsOpen =
    conference.cfp_start_date &&
    conference.cfp_end_date &&
    new Date() >= new Date(conference.cfp_start_date) &&
    new Date() <= new Date(conference.cfp_end_date)

  if (cfpIsOpen) {
    buttons.push({
      label: 'Submit to Speak',
      href: '/cfp',
      variant: 'warning',
      icon: MicrophoneIcon,
    })
  }

  if (
    conference.program_date &&
    new Date() >= new Date(conference.program_date)
  ) {
    buttons.push({
      label: 'Program',
      href: '/program',
      variant: 'secondary',
      icon: CalendarDaysIcon,
    })
  }

  if (conference.registration_enabled && conference.registration_link) {
    buttons.push({
      label: 'Tickets',
      href: '/tickets',
      variant: 'primary',
      icon: TicketIcon,
    })
  }

  // Reverse the order of buttons to show the most important ones first
  // and slice to show only the first two buttons
  const displayButtons = buttons.reverse().slice(0, 2)

  return (
    <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
      {displayButtons.map((button) => {
        const Icon = button.icon
        return (
          <Button
            key={button.label}
            href={button.href}
            variant={button.variant}
            className="inline-flex items-center space-x-2 px-8 py-4 font-semibold"
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{button.label}</span>
          </Button>
        )
      })}
    </div>
  )
}

export function Hero({ conference }: { conference: Conference }) {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          {conference.announcement && (
            <div className="mb-8 rounded-lg border border-brand-cloud-blue/20 bg-brand-sky-mist p-6 text-center text-brand-slate-gray shadow-md">
              <PortableText value={conference.announcement} />
            </div>
          )}
          <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl">
            <span className="sr-only">{conference.title} - </span>
            {conference.tagline}
          </h1>
          <div className="font-inter mt-6 space-y-6 text-2xl tracking-tight text-brand-slate-gray">
            <p>
              Cloud Native Day Bergen is the nerdiest tech conference in Bergen.
              Join us to learn about the latest trends, best practices, and
              experience reports from local and international cloud-native
              experts.
            </p>
            <p>
              Our speakers will share their insights and experiences, covering
              topics such as containerization, orchestration, microservices, and
              more. Whether you&apos;re a beginner or an 10x&apos;er,
              there&apos;s something for everyone at Cloud Native Day Bergen.
            </p>
          </div>

          <ActionButtons conference={conference} />

          {conference.vanity_metrics &&
            conference.vanity_metrics.length > 0 && (
              <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:mt-16 sm:grid-cols-3 lg:grid-cols-6 lg:justify-start lg:text-left">
                {conference.vanity_metrics.slice(0, 6).map((metric) => (
                  <div
                    key={metric.label}
                    className="text-center sm:text-center lg:text-left"
                  >
                    <dt className="font-jetbrains text-sm text-brand-cloud-blue">
                      {metric.label}
                    </dt>
                    <dd className="font-space-grotesk mt-0.5 text-2xl font-semibold tracking-tight text-brand-slate-gray">
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          {conference.social_links && conference.social_links.length > 0 && (
            <div className="mt-10 flex justify-center space-x-4 sm:hidden">
              {conference.social_links.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-cloud-blue hover:text-brand-slate-gray"
                >
                  {iconForLink(link, 'h-12 w-12')}
                </a>
              ))}
            </div>
          )}
        </div>
      </Container>
    </div>
  )
}
