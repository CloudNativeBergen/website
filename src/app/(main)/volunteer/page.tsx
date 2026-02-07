import { Metadata } from 'next'
import Link from 'next/link'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import VolunteerForm from '@/components/volunteer/VolunteerForm'
import { UserGroupIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

export const metadata: Metadata = {
  title: 'Volunteer | Cloud Native Days Norway',
  description: 'Join our volunteer team and help make the conference a success',
}

async function CachedVolunteerContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:volunteer')

  const { conference, error } = await getConferenceForDomain(domain)

  if (error || !conference?._id) {
    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
              Conference not found
            </h1>
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
            Volunteer at {conference.title}
          </h1>
          <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300">
            <p>
              Be part of the team that makes this amazing event happen! Join our
              volunteer crew and contribute to the Cloud Native community.
            </p>
          </div>

          <div className="mt-10 rounded-lg bg-white/50 p-6 backdrop-blur-sm dark:bg-gray-800/50">
            <div className="flex items-center">
              <UserGroupIcon className="mr-3 h-6 w-6 text-brand-cloud-blue dark:text-blue-400" />
              <h2 className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-gray-100">
                Volunteer Opportunities
              </h2>
            </div>
            <ul className="mt-4 space-y-2 text-base text-gray-700 dark:text-gray-300">
              <li className="flex items-start">
                <span className="mt-1.5 mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                <span>
                  <strong>Registration Desk:</strong> Welcome attendees, check
                  them in, and distribute conference materials
                </span>
              </li>
              <li className="flex items-start">
                <span className="mt-1.5 mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                <span>
                  <strong>Tech Support:</strong> Assist speakers with AV
                  equipment and help ensure smooth technical operations
                </span>
              </li>
              <li className="flex items-start">
                <span className="mt-1.5 mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                <span>
                  <strong>Speaker Liaison:</strong> Support speakers throughout
                  the event, ensuring they have everything they need
                </span>
              </li>
              <li className="flex items-start">
                <span className="mt-1.5 mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                <span>
                  <strong>General Assistance:</strong> Help with setup,
                  teardown, and various tasks throughout the conference
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-8 rounded-lg bg-white/50 p-6 backdrop-blur-sm dark:bg-gray-800/50">
            <div className="flex items-center">
              <SparklesIcon className="mr-3 h-6 w-6 text-brand-cloud-blue dark:text-blue-400" />
              <h2 className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-gray-100">
                Volunteer Benefits
              </h2>
            </div>
            <ul className="mt-4 space-y-2 text-base text-gray-700 dark:text-gray-300">
              <li className="flex items-start">
                <span className="mt-1.5 mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                <span>
                  Free access to the entire conference and all sessions
                </span>
              </li>
              <li className="flex items-start">
                <span className="mt-1.5 mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                <span>
                  Networking opportunities with speakers and attendees
                </span>
              </li>
              <li className="flex items-start">
                <span className="mt-1.5 mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                <span>
                  Behind-the-scenes experience in conference organization
                </span>
              </li>
              <li className="flex items-start">
                <span className="mt-1.5 mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                <span>
                  Exclusive volunteer t-shirt to commemorate your contribution
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-10">
            <VolunteerForm conferenceId={conference._id} />
          </div>

          <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
            Your personal data will be processed in accordance with our{' '}
            <Link
              href="/privacy"
              className="underline hover:text-blue-600 dark:hover:text-blue-400"
            >
              Privacy Policy
            </Link>
            . We respect your privacy and are committed to protecting your
            personal information.
          </p>
        </div>
      </Container>
    </div>
  )
}

export default async function VolunteerPage() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedVolunteerContent domain={domain} />
}
