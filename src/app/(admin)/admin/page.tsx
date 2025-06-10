import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/sanity'
import { ProposalExisting } from '@/lib/proposal/types'
import { ChartBarIcon, DocumentTextIcon, UsersIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

const stats = [
  { name: 'Total Proposals', stat: '0', icon: DocumentTextIcon, change: '+4.75%', changeType: 'positive' },
  { name: 'Total Speakers', stat: '0', icon: UsersIcon, change: '+54.02%', changeType: 'positive' },
  { name: 'Scheduled Sessions', stat: '0', icon: CalendarDaysIcon, change: '-1.39%', changeType: 'negative' },
  { name: 'Conversion Rate', stat: '0%', icon: ChartBarIcon, change: '+10.18%', changeType: 'positive' },
]

export default async function AdminDashboard() {
  const { conference, error: conferenceError } = await getConferenceForCurrentDomain()

  let proposals: ProposalExisting[] = []
  if (!conferenceError && conference) {
    const { proposals: proposalData } = await getProposals({
      conferenceId: conference._id,
      returnAll: true,
      includeReviews: true,
    })
    proposals = proposalData || []
  }

  // Calculate stats
  const totalProposals = proposals.length
  const totalSpeakers = new Set(
    proposals
      .map(p => typeof p.speaker === 'object' && p.speaker && '_id' in p.speaker ? p.speaker._id : null)
      .filter(Boolean)
  ).size
  const scheduledSessions = 0 // TODO: Implement when schedule system is ready
  const conversionRate = totalProposals > 0 ? Math.round((scheduledSessions / totalProposals) * 100) : 0

  const updatedStats = [
    { ...stats[0], stat: totalProposals.toString() },
    { ...stats[1], stat: totalSpeakers.toString() },
    { ...stats[2], stat: scheduledSessions.toString() },
    { ...stats[3], stat: `${conversionRate}%` },
  ]

  function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ')
  }

  return (
    <div className="px-4 py-10 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="border-b border-gray-200 pb-5">
          <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Admin Dashboard
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Overview of {conference?.title || 'conference'} management
          </p>
        </div>

        {/* Stats */}
        <div className="mt-8">
          <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {updatedStats.map((item) => (
              <div
                key={item.name}
                className="relative overflow-hidden rounded-lg bg-white px-4 pb-12 pt-5 shadow sm:px-6 sm:pt-6"
              >
                <dt>
                  <div className="absolute rounded-md bg-indigo-500 p-3">
                    <item.icon aria-hidden="true" className="h-6 w-6 text-white" />
                  </div>
                  <p className="ml-16 truncate text-sm font-medium text-gray-500">{item.name}</p>
                </dt>
                <dd className="ml-16 flex items-baseline pb-6 sm:pb-7">
                  <p className="text-2xl font-semibold text-gray-900">{item.stat}</p>
                  <p
                    className={classNames(
                      item.changeType === 'positive' ? 'text-green-600' : 'text-red-600',
                      'ml-2 flex items-baseline text-sm font-semibold',
                    )}
                  >
                    {item.change}
                  </p>
                  <div className="absolute inset-x-0 bottom-0 bg-gray-50 px-4 py-4 sm:px-6">
                    <div className="text-sm">
                      <a href="#" className="font-medium text-indigo-600 hover:text-indigo-500">
                        View all
                      </a>
                    </div>
                  </div>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Quick Actions */}
        <div className="mt-12">
          <h2 className="text-lg font-medium text-gray-900">Quick Actions</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <DocumentTextIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <Link href="/admin/proposals" className="focus:outline-none">
                    <span aria-hidden="true" className="absolute inset-0" />
                    <p className="text-sm font-medium text-gray-900">Manage Proposals</p>
                    <p className="truncate text-sm text-gray-500">Review and manage speaker proposals</p>
                  </Link>
                </div>
              </div>
            </div>

            <div className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <UsersIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <a href="/admin/speakers" className="focus:outline-none">
                    <span aria-hidden="true" className="absolute inset-0" />
                    <p className="text-sm font-medium text-gray-900">Manage Speakers</p>
                    <p className="truncate text-sm text-gray-500">View and manage speaker profiles</p>
                  </a>
                </div>
              </div>
            </div>

            <div className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <CalendarDaysIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <a href="/admin/schedule" className="focus:outline-none">
                    <span aria-hidden="true" className="absolute inset-0" />
                    <p className="text-sm font-medium text-gray-900">Manage Schedule</p>
                    <p className="truncate text-sm text-gray-500">Create and manage event schedule</p>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-12">
          <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
          <div className="mt-6 flow-root">
            <ul role="list" className="-mb-8">
              <li>
                <div className="relative pb-8">
                  <div className="relative flex space-x-3">
                    <div>
                      <span className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center ring-8 ring-white">
                        <DocumentTextIcon aria-hidden="true" className="h-5 w-5 text-white" />
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                      <div>
                        <p className="text-sm text-gray-500">
                          System initialized with <span className="font-medium text-gray-900">{totalProposals} proposals</span>
                        </p>
                      </div>
                      <div className="whitespace-nowrap text-right text-sm text-gray-500">
                        <time dateTime={new Date().toISOString()}>Today</time>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
