import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import {
  GitHubIcon,
  InstagramIcon,
  LinkedInIcon,
  TwitterIcon,
} from '@/components/SocialIcons'
import { Conference } from '@/lib/conference/types'

function ActionButtons({ conference }: { conference: Conference }) {
  const buttons = [
    { label: 'Practical Info', href: '/info', color: 'bg-teal-600', hoverColor: 'hover:bg-teal-500' },
  ]

  const seekingSponsors =
    conference.start_date &&
    (new Date(conference.start_date).getTime() - new Date().getTime()) > (4 * 7 * 24 * 60 * 60 * 1000);

  if (seekingSponsors) {
    buttons.push({ label: 'Become a Sponsor', href: '/sponsor', color: 'bg-teal-600', hoverColor: 'hover:bg-teal-500' })
  }

  const cfpIsOpen =
    conference.cfp_start_date &&
    conference.cfp_end_date &&
    new Date() >= new Date(conference.cfp_start_date) &&
    new Date() <= new Date(conference.cfp_end_date)

  if (cfpIsOpen) {
    buttons.push({ label: 'Submit to Speak', href: '/cfp', color: 'bg-teal-600', hoverColor: 'hover:bg-teal-500' })
  }

  if (conference.program_date && new Date() >= new Date(conference.program_date)) {
    buttons.push({ label: 'Program', href: '/program', color: 'bg-purple-600', hoverColor: 'hover:bg-purple-500' })
  }

  if (conference.registration_enabled && conference.registration_link) {
    buttons.push({ label: 'Tickets', href: conference.registration_link, color: '', hoverColor: '' })
  }

  // Reverse the order of buttons to show the most important ones first
  // and slice to show only the first two buttons
  const displayButtons = buttons.reverse().slice(0, 2);

  return (
    <div className="flex flex-col justify-between md:flex-row mt-10">
      {displayButtons.map((button) => (
        <Button
          key={button.label}
          href={button.href}
          className={`mt-2 w-full md:w-1/2 ${button.color} ${button.hoverColor} md:ml-2 md:mr-2`}
        >
          {button.label}
        </Button>
      ))}
    </div>
  )
}

export function Hero({ conference }: { conference: Conference }) {
  return (
    <div className="relative py-20 sm:pb-24 sm:pt-36">
      <BackgroundImage className="-bottom-14 -top-36" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl">
            <span className="sr-only">Cloud Native Day Bergen - </span>A day with
            Cloud & Kubernetes in Bergen.
          </h1>
          <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900">
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

          <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-6 sm:mt-16 sm:gap-x-16 sm:gap-y-10 sm:text-center lg:auto-cols-auto lg:grid-flow-col lg:grid-cols-none lg:justify-start lg:text-left">
            {conference.vanity_metrics?.map((metric) => (
              <div key={metric.label}>
                <dt className="font-mono text-sm text-blue-600">
                  {metric.label}
                </dt>
                <dd className="mt-0.5 text-2xl font-semibold tracking-tight text-blue-900">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-10 flex justify-center space-x-4 sm:hidden">
            <a href="#" className="text-blue-600 hover:text-blue-800">
              <InstagramIcon className="h-12 w-12" />
            </a>
            <a href="#" className="text-blue-600 hover:text-blue-800">
              <TwitterIcon className="h-12 w-12" />
            </a>
            <a
              href="https://github.com/CloudNativeBergen"
              className="text-blue-600 hover:text-blue-800"
            >
              <GitHubIcon className="h-12 w-12" />
            </a>
            <a
              href="https://www.linkedin.com/company/cloud-native-bergen"
              className="text-blue-600 hover:text-blue-800"
            >
              <LinkedInIcon className="h-12 w-12" />
            </a>
          </div>
        </div>
      </Container >
    </div >
  )
}
