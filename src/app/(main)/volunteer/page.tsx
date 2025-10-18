import { Metadata } from 'next'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import VolunteerForm from '@/components/volunteer/VolunteerForm'
import { UserGroupIcon, SparklesIcon } from '@heroicons/react/24/outline'

export const metadata: Metadata = {
  title: 'Volunteer | Cloud Native Bergen',
  description: 'Join our volunteer team and help make the conference a success',
}

export default async function VolunteerPage() {
  const result = await getConferenceForCurrentDomain()

  if (result.error || !result.conference) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-600">
            Conference Not Found
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Unable to load conference information. Please try again later.
          </p>
        </div>
      </div>
    )
  }

  const conference = result.conference

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:px-8">
        <div className="mb-10 text-center">
          <h1 className="font-jetbrains text-4xl font-bold text-brand-cloud-blue sm:text-5xl dark:text-brand-sky-mist">
            Volunteer at {conference.title}
          </h1>
          <p className="font-inter mt-4 text-lg text-brand-slate-gray dark:text-gray-300">
            Be part of the team that makes this amazing event happen! Join our
            volunteer crew and contribute to the Cloud Native community.
          </p>
        </div>

        <div className="mb-10 rounded-lg bg-gray-50 p-6 dark:bg-gray-800">
          <div className="flex items-center">
            <UserGroupIcon className="mr-3 h-6 w-6 text-brand-cloud-blue" />
            <h2 className="font-jetbrains text-xl font-semibold text-gray-900 dark:text-gray-100">
              Volunteer Opportunities
            </h2>
          </div>
          <ul className="font-inter mt-4 space-y-2 text-gray-700 dark:text-gray-300">
            <li className="flex items-start">
              <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
              <span>
                <strong>Registration Desk:</strong> Welcome attendees, check
                them in, and distribute conference materials
              </span>
            </li>
            <li className="flex items-start">
              <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
              <span>
                <strong>Tech Support:</strong> Assist speakers with AV equipment
                and help ensure smooth technical operations
              </span>
            </li>
            <li className="flex items-start">
              <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
              <span>
                <strong>Speaker Liaison:</strong> Support speakers throughout
                the event, ensuring they have everything they need
              </span>
            </li>
            <li className="flex items-start">
              <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
              <span>
                <strong>General Assistance:</strong> Help with setup, teardown,
                and various tasks throughout the conference
              </span>
            </li>
          </ul>
        </div>

        <div className="mb-10 rounded-lg bg-brand-sky-mist/10 p-6 dark:bg-brand-cloud-blue/10">
          <div className="flex items-center">
            <SparklesIcon className="mr-3 h-6 w-6 text-brand-cloud-blue" />
            <h2 className="font-jetbrains text-xl font-semibold text-gray-900 dark:text-gray-100">
              Volunteer Benefits
            </h2>
          </div>
          <ul className="font-inter mt-4 space-y-2 text-gray-700 dark:text-gray-300">
            <li className="flex items-start">
              <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
              <span>Free access to the entire conference and all sessions</span>
            </li>
            <li className="flex items-start">
              <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
              <span>Networking opportunities with speakers and attendees</span>
            </li>
            <li className="flex items-start">
              <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
              <span>
                Behind-the-scenes experience in conference organization
              </span>
            </li>
            <li className="flex items-start">
              <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
              <span>
                Exclusive volunteer t-shirt to commemorate your contribution
              </span>
            </li>
          </ul>
        </div>

        <div className="mb-10">
          <VolunteerForm conferenceId={conference._id} />
        </div>

        <div className="mt-8 border-t border-gray-200 pt-8 text-center dark:border-gray-700">
          <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
            Your personal data will be processed in accordance with our{' '}
            <a
              href="/privacy"
              className="text-brand-cloud-blue underline hover:text-brand-slate-gray dark:text-brand-sky-mist dark:hover:text-gray-300"
            >
              Privacy Policy
            </a>
            . We respect your privacy and are committed to protecting your
            personal information.
          </p>
        </div>
      </div>
    </div>
  )
}
