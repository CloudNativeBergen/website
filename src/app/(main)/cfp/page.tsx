import {
  LockClosedIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/20/solid'
import { Button } from '@/components/Button'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { formatDate } from '@/lib/time'
import { Topic } from '@/lib/topic/types'
import { formats } from '@/lib/proposal/types'
import clsx from 'clsx'
import Link from 'next/link'
export default async function CFP() {
  const { conference } = await getConferenceForCurrentDomain({ topics: true })
  const talkFormats = conference.formats
    .filter((formatId) => !formatId.startsWith('workshop_'))
    .map((formatId) => formats.get(formatId))
  const workshopFormats = conference.formats
    .filter((formatId) => formatId.startsWith('workshop_'))
    .map((formatId) => formats.get(formatId))
  const hasWorkshops =
    Array.isArray(workshopFormats) && workshopFormats.length > 0

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
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:px-8">
      <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl">
        Call for Presentations
      </h1>
      <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray">
        <p>
          Become our next speaker and share your knowledge with the community!
          We are especially interested in local speakers who can provide unique
          insights and perspectives.
        </p>
        <p>
          Cloud Native Day Bergen is the premier local conference for all things
          cloud and Kubernetes. Join us to learn about the latest trends, best
          practices, and cutting-edge technologies in the cloud-native
          ecosystem.
        </p>
      </div>

      <Button href="/cfp/submit" variant="warning" className="mt-10 w-full">
        Submit your proposal
      </Button>

      <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-6 sm:mt-16 sm:gap-x-16 sm:gap-y-10 sm:text-center lg:auto-cols-auto lg:grid-flow-col lg:grid-cols-none lg:justify-start lg:text-left">
        {[
          ['Languages', ['Norwegian', 'English']],
          ['Presentation formats', talkFormats],
          ['Workshop formats', workshopFormats],
        ].map(([name, value]) => (
          <div key={String(name)}>
            <dt className="font-jetbrains text-sm text-brand-cloud-blue">
              {name}
            </dt>
            <dd className="font-space-grotesk mt-0.5 text-2xl font-semibold tracking-tight text-brand-slate-gray">
              {Array.isArray(value) ? (
                <ul className="space-y-1">
                  {value.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {hasWorkshops && (
        <div className="mt-10 rounded-xl bg-gradient-to-br from-brand-sky-mist/80 to-brand-cloud-blue/10 p-1 shadow-lg">
          <div className="rounded-lg bg-white px-6 py-6 sm:p-8">
            <h2 className="font-space-grotesk mb-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-brand-cloud-blue sm:text-3xl">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-sky-mist text-brand-cloud-blue">
                <ClipboardDocumentCheckIcon
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              </span>
              Hands-on Workshops
            </h2>
            <p className="font-inter mt-2 text-lg text-brand-slate-gray">
              This conference also includes hands-on workshops led by
              experienced instructors. These sessions are designed to provide
              practical, in-depth learning opportunities. If you have a workshop
              idea, we encourage you to submit a proposal.
            </p>
            <ul className="font-inter mt-4 list-disc pl-6 text-base text-brand-slate-gray">
              {workshopFormats.map((format, idx) => (
                <li key={idx}>{format}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <h2 className="font-jetbrains mt-10 text-3xl font-medium tracking-tighter text-brand-cloud-blue sm:text-4xl">
        Process and Details
      </h2>
      <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray">
        <p>
          We are looking for content that is relevant to the community and that
          provide valuable insights. We welcome speakers of all levels of
          experience, from first-time presenters to seasoned experts.
        </p>
        <p>
          Cloud Native Day Bergen is a diverse and inclusive event, and we
          encourage submissions from speakers of all backgrounds and identities.
          We are committed to creating a safe and welcoming environment for
          everyone.
        </p>
        <p>
          We are especially interested in content that covers the following
          topics:
        </p>
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {(() => {
            const defaultTopics: Topic[] = [
              {
                _id: 'default-topic-1',
                title: 'Cloud-native technologies',
                description:
                  'General topics related to cloud-native architecture, Kubernetes, and associated technologies.',
                _type: 'topic',
                color: '',
                slug: {
                  current: '',
                },
              },
              {
                _id: 'default-topic-2',
                title: 'DevOps and Automation',
                description:
                  'Practices, tools, and culture for automating software development and IT operations.',
                _type: 'topic',
                color: '',
                slug: {
                  current: '',
                },
              },
              {
                _id: 'default-topic-3',
                title: 'Security in the Cloud',
                description:
                  'Best practices and tools for securing cloud-native applications and infrastructure.',
                _type: 'topic',
                color: '',
                slug: {
                  current: '',
                },
              },
            ]
            const topicsToDisplay =
              conference.topics && conference.topics.length > 0
                ? conference.topics
                : defaultTopics

            const topicCardStyles = [
              {
                gradient: 'from-sky-300 to-cyan-400',
                shadow: 'hover:shadow-cyan-300/50',
                descriptionColor: 'text-sky-100/90',
              },
              {
                gradient: 'from-teal-300 to-emerald-400',
                shadow: 'hover:shadow-emerald-300/50',
                descriptionColor: 'text-teal-100/90',
              },
              {
                gradient: 'from-indigo-300 to-blue-400',
                shadow: 'hover:shadow-blue-300/50',
                descriptionColor: 'text-indigo-100/90',
              },
              {
                gradient: 'from-purple-300 to-violet-400',
                shadow: 'hover:shadow-violet-300/50',
                descriptionColor: 'text-purple-100/90',
              },
            ]
            return topicsToDisplay.map((topic: Topic, index: number) => {
              const style = topicCardStyles[index % topicCardStyles.length]
              const rotationClass = index % 2 === 0 ? 'rotate-1' : '-rotate-1'
              // Special handling for the default topic to match its previous styling
              const isDefaultTopic = topic._id.startsWith('default-topic-')
              const cardGradient = isDefaultTopic
                ? 'from-gray-500 to-slate-600'
                : style.gradient
              const cardShadow = isDefaultTopic ? '' : style.shadow
              const descColor = isDefaultTopic
                ? 'text-slate-200/90'
                : style.descriptionColor

              return (
                <div
                  key={topic._id}
                  className={`group overflow-hidden rounded-xl border border-transparent bg-gradient-to-br ${cardGradient} p-1 shadow-2xl transition-all duration-300 ease-in-out ${cardShadow} ${rotationClass}`}
                >
                  <div className="h-full rounded-lg bg-slate-800/70 px-4 py-5 backdrop-blur-sm sm:p-6">
                    <h3 className="flex items-center text-lg font-semibold text-white">
                      {isDefaultTopic && (
                        <span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-400/20 text-slate-300">
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 6.253v11.494m0 0a8.485 8.485 0 001.242-5.015M12 17.747a8.485 8.485 0 01-1.242-5.015M3.75 12.75h16.5M12 3.75L12 3.75M12 20.25L12 20.25"
                            />
                          </svg>
                        </span>
                      )}
                      {topic.title}
                    </h3>
                    {topic.description && (
                      <p
                        className={`mt-3 text-sm ${descColor} leading-relaxed`}
                      >
                        {topic.description}
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </div>
        <p>
          The deadline for submissions is {formatDate(conference.cfp_end_date)},
          but <strong>we are reviewing proposals on a rolling basis</strong>, so
          we encourage you to submit early to increase your chances of being
          selected. We will review all remaining proposals and notify selected
          speakers by {formatDate(conference.cfp_notify_date)}.
        </p>
      </div>

      <h3 className="font-space-grotesk mt-5 mb-5 text-2xl font-medium tracking-tighter text-brand-cloud-blue sm:text-3xl">
        Dates to Remember
      </h3>

      <ul
        role="list"
        className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
      >
        {datesToRemember.map((date) => (
          <li key={date.name} className="col-span-1 flex rounded-md shadow-sm">
            <div
              className={clsx(
                date.bgColor,
                'flex w-16 flex-shrink-0 items-center justify-center rounded-l-md text-sm font-medium text-white',
              )}
            >
              <date.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-1 items-center justify-between truncate rounded-r-md border-t border-r border-b border-gray-200 bg-white">
              <div className="text-m flex-1 truncate px-4 py-2">
                <p className="font-medium text-gray-900">{date.name}</p>
                <p className="text-gray-500">{date.date}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="font-jetbrains mt-10 text-3xl font-medium tracking-tighter text-brand-cloud-blue sm:text-4xl">
        Diversity and Inclusion
      </h2>

      <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray">
        <p>
          Cloud Native Day Bergen is committed to creating a diverse and
          inclusive event that welcomes speakers and attendees of all
          backgrounds and identities. We believe that diversity is a strength
          and that everyone has something valuable to contribute.
        </p>
        <p>
          We are enforcing a strict code of conduct to ensure that Cloud Native
          Day Bergen is a safe and welcoming environment for everyone. We do not
          tolerate harassment or discrimination of any kind, and we will take
          appropriate action against anyone who violates our{' '}
          <Link
            href="/conduct"
            className="text-indigo-500 underline hover:text-indigo-700"
          >
            code of conduct
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
