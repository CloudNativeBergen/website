import {
  LockClosedIcon,
  BellAlertIcon,
  CalendarDaysIcon,
} from '@heroicons/react/20/solid'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { formatDate } from '@/lib/time'

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export default async function CFP() {
  const { conference } = await getConferenceForCurrentDomain();

  const datesToRemember = [
    {
      name: 'CFP Close',
      date: formatDate(conference.cfp_end_date),
      icon: LockClosedIcon,
      bgColor: 'bg-pink-600',
    },
    {
      name: 'Speaker Notify',
      date: formatDate(conference.cfp_notify_date),
      icon: BellAlertIcon,
      bgColor: 'bg-purple-600',
    },
    {
      name: 'Program Final',
      date: formatDate(conference.program_date),
      icon: CalendarDaysIcon,
      bgColor: 'bg-yellow-500',
    },
  ]

  return (
    <>
      <div className="relative py-20 sm:pb-24 sm:pt-36">
        <BackgroundImage className="-bottom-14 -top-36" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl">
              Call for Presentations
            </h1>
            <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900">
              <p>
                Become our next speaker and share your knowledge with the
                community! We are especially interested in local speakers who
                can provide unique insights and perspectives.
              </p>
              <p>
                Cloud Native Day Bergen is the premier local conference for all
                things cloud and Kubernetes. Join us to learn about the latest
                trends, best practices, and cutting-edge technologies in the
                cloud-native ecosystem.
              </p>
            </div>

            <Button
              href="/cfp/submit"
              className="mt-10 w-full bg-teal-600 hover:bg-teal-500"
            >
              Submit your proposal
            </Button>

            <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-6 sm:mt-16 sm:gap-x-16 sm:gap-y-10 sm:text-center lg:auto-cols-auto lg:grid-flow-col lg:grid-cols-none lg:justify-start lg:text-left">
              {[
                ['Presentation languages', 'Norwegian / English'],
                ['Presentation format', '10 minutes / 20 minutes / 40 minutes'],
              ].map(([name, value]) => (
                <div key={name}>
                  <dt className="font-mono text-sm text-blue-600">{name}</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tracking-tight text-blue-900">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <h2 className="mt-10 font-display text-4xl font-medium tracking-tighter text-blue-600 sm:text-5xl">
              Process and Details
            </h2>
            <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900">
              <p>
                We are looking for talks that are relevant to the community and
                that provide valuable insights. We welcome speakers of all
                levels of experience, from first-time presenters to seasoned
                experts.
              </p>
              <p>
                Cloud Native Day Bergen is a diverse and inclusive event, and we
                encourage submissions from speakers of all backgrounds and
                identities. We are committed to creating a safe and welcoming
                environment for everyone.
              </p>
              <p>
                We are especially interested in talks that cover the following
                topics:
              </p>
              <ul className="mt-4 list-disc pl-8">
                <li>Cloud-native technologies</li>
                <li>Observability</li>
                <li>Security</li>
                <li>Modern application development</li>
                <li>Best practices and case studies</li>
              </ul>
              <p>
                The deadline for submissions is {formatDate(conference.cfp_end_date)}, but{' '}
                <strong>we are reviewing proposals on a rolling basis</strong>,
                so we encourage you to submit early to increase your chances of
                being selected. We will review all remaining proposals and
                notify selected speakers by {formatDate(conference.cfp_notify_date)}.
              </p>
            </div>

            <h3 className="mb-5 mt-5 font-display text-3xl font-medium tracking-tighter text-blue-600 sm:text-3xl">
              Dates to Remember
            </h3>

            <ul
              role="list"
              className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
            >
              {datesToRemember.map((date) => (
                <li
                  key={date.name}
                  className="col-span-1 flex rounded-md shadow-sm"
                >
                  <div
                    className={classNames(
                      date.bgColor,
                      'flex w-16 flex-shrink-0 items-center justify-center rounded-l-md text-sm font-medium text-white',
                    )}
                  >
                    <date.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="flex flex-1 items-center justify-between truncate rounded-r-md border-b border-r border-t border-gray-200 bg-white">
                    <div className="text-m flex-1 truncate px-4 py-2">
                      <p className="font-medium text-gray-900">{date.name}</p>
                      <p className="text-gray-500">{date.date}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <h2 className="mt-10 font-display text-4xl font-medium tracking-tighter text-blue-600 sm:text-5xl">
              Diversity and Inclusion
            </h2>

            <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900">
              <p>
                Cloud Native Day Bergen is committed to creating a diverse and
                inclusive event that welcomes speakers and attendees of all
                backgrounds and identities. We believe that diversity is a
                strength and that everyone has something valuable to contribute.
              </p>
              <p>
                We are enforcing a strict code of conduct to ensure that
                Cloud Native Day Bergen is a safe and welcoming environment for
                everyone. We do not tolerate harassment or discrimination of any
                kind, and we will take appropriate action against anyone who
                violates our{' '}
                <a
                  href={conference.coc_link}
                  className="text-indigo-500 underline hover:text-indigo-700"
                  target="_blank"
                >
                  code of conduct
                </a>
                .
              </p>
            </div>
          </div>
        </Container>
      </div>
    </>
  )
}
