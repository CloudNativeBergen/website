import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/sanity'
import { ProposalExisting, Status } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { Review } from '@/lib/review/types'
import { auth } from '@/lib/auth'
import {
  DocumentTextIcon,
  UsersIcon,
  CalendarDaysIcon,
  StarIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

export default async function AdminDashboard() {
  const session = await auth()
  const currentUserId = session?.speaker?._id

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

  // Calculate comprehensive stats
  const totalProposals = proposals.length

  // Status breakdown
  const submittedProposals = proposals.filter(p => p.status === Status.submitted).length
  const acceptedProposals = proposals.filter(p => p.status === Status.accepted).length
  const rejectedProposals = proposals.filter(p => p.status === Status.rejected).length
  const confirmedProposals = proposals.filter(p => p.status === Status.confirmed).length

  // Speaker stats
  const uniqueSpeakers = new Set(
    proposals
      .map(p => typeof p.speaker === 'object' && p.speaker && '_id' in p.speaker ? p.speaker._id : null)
      .filter(Boolean)
  ).size

  // Review stats
  const totalReviews = proposals.reduce((acc, proposal) => {
    return acc + (proposal.reviews?.length || 0)
  }, 0)

  const reviewedProposals = proposals.filter(p => p.reviews && p.reviews.length > 0).length
  const unreviewedProposals = totalProposals - reviewedProposals

  // Average rating
  const ratingsWithScores = proposals.flatMap(p =>
    (p.reviews || []).map(review => {
      const r = typeof review === 'object' && 'score' in review ? review as Review : null
      if (!r?.score) return null
      return (r.score.content + r.score.relevance + r.score.speaker) / 3
    }).filter((rating): rating is number => rating !== null)
  )
  const averageRating = ratingsWithScores.length > 0
    ? ratingsWithScores.reduce((a, b) => a + b, 0) / ratingsWithScores.length
    : 0

  // Format stats
  const formatBreakdown = proposals.reduce((acc, p) => {
    acc[p.format] = (acc[p.format] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Acceptance rate
  const acceptanceRate = totalProposals > 0 ? Math.round(((acceptedProposals + confirmedProposals) / totalProposals) * 100) : 0

  // User-specific review stats
  const userReviewedProposals = currentUserId ? proposals.filter(p =>
    p.reviews?.some(review => {
      const r = typeof review === 'object' && 'reviewer' in review ? review as Review : null
      const reviewerId = typeof r?.reviewer === 'object' && r.reviewer && '_id' in r.reviewer
        ? r.reviewer._id
        : null
      return reviewerId === currentUserId
    })
  ).length : 0

  const userUnreviewedProposals = currentUserId ? totalProposals - userReviewedProposals : 0
  const userReviewProgress = totalProposals > 0 ? Math.round((userReviewedProposals / totalProposals) * 100) : 0

  const stats = [
    {
      name: 'Total Proposals',
      stat: totalProposals.toString(),
      icon: DocumentTextIcon,
      subtext: `${submittedProposals} submitted`,
      href: '/admin/proposals'
    },
    {
      name: 'Unique Speakers',
      stat: uniqueSpeakers.toString(),
      icon: UsersIcon,
      subtext: `${(totalProposals / uniqueSpeakers || 0).toFixed(1)} proposals/speaker`,
      href: '/admin/speakers'
    },
    {
      name: 'Reviews Completed',
      stat: totalReviews.toString(),
      icon: StarIcon,
      subtext: `${reviewedProposals}/${totalProposals} proposals reviewed`,
      href: '/admin/proposals?reviewStatus=reviewed'
    },
    {
      name: 'Acceptance Rate',
      stat: `${acceptanceRate}%`,
      icon: CheckCircleIcon,
      subtext: `${acceptedProposals + confirmedProposals} accepted, ${rejectedProposals} rejected`,
      href: '/admin/proposals?status=accepted,confirmed'
    },
  ]

  return (
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
          {stats.map((item) => (
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
              <dd className="ml-16 flex flex-col pb-6 sm:pb-7">
                <p className="text-2xl font-semibold text-gray-900">{item.stat}</p>
                <p className="text-sm text-gray-500 mt-1">{item.subtext}</p>
                <div className="absolute inset-x-0 bottom-0 bg-gray-50 px-4 py-4 sm:px-6">
                  <div className="text-sm">
                    <Link href={item.href} className="font-medium text-indigo-600 hover:text-indigo-500">
                      View details
                    </Link>
                  </div>
                </div>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Detailed Breakdown */}
      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Status Breakdown */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Proposal Status Breakdown</h3>
            <div className="mt-5">
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">
                    <Link href="/admin/proposals?status=submitted" className="hover:text-indigo-600">
                      Submitted
                    </Link>
                  </dt>
                  <dd className="text-sm text-gray-900">{submittedProposals}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">
                    <Link href="/admin/proposals?status=accepted" className="hover:text-indigo-600">
                      Accepted
                    </Link>
                  </dt>
                  <dd className="text-sm text-green-600 font-medium">{acceptedProposals}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">
                    <Link href="/admin/proposals?status=rejected" className="hover:text-indigo-600">
                      Rejected
                    </Link>
                  </dt>
                  <dd className="text-sm text-red-600 font-medium">{rejectedProposals}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">
                    <Link href="/admin/proposals?status=confirmed" className="hover:text-indigo-600">
                      Confirmed
                    </Link>
                  </dt>
                  <dd className="text-sm text-blue-600 font-medium">{confirmedProposals}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {/* Review Stats */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Review Statistics</h3>
            <div className="mt-5">
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Total Reviews</dt>
                  <dd className="text-sm text-gray-900">{totalReviews}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">
                    <Link href="/admin/proposals?reviewStatus=reviewed" className="hover:text-indigo-600">
                      Reviewed Proposals
                    </Link>
                  </dt>
                  <dd className="text-sm text-green-600 font-medium">{reviewedProposals}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">
                    <Link href="/admin/proposals?reviewStatus=unreviewed" className="hover:text-indigo-600">
                      Pending Review
                    </Link>
                  </dt>
                  <dd className="text-sm text-orange-600 font-medium">{unreviewedProposals}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Average Rating</dt>
                  <dd className="text-sm text-gray-900">
                    {averageRating > 0 ? `${averageRating.toFixed(1)}/5.0` : 'N/A'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {/* Format Breakdown */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Proposal Formats</h3>
            <div className="mt-5">
              <dl className="space-y-3">
                {Object.entries(formatBreakdown).map(([format, count]) => (
                  <div key={format} className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-500">
                      <Link href={`/admin/proposals?format=${format}`} className="hover:text-indigo-600 capitalize">
                        {format.replace('_', ' ')}
                      </Link>
                    </dt>
                    <dd className="text-sm text-gray-900">{count}</dd>
                  </div>
                ))}
                {Object.keys(formatBreakdown).length === 0 && (
                  <div className="text-sm text-gray-500">No proposals yet</div>
                )}
              </dl>
            </div>
          </div>
        </div>

        {/* Review Progress */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">My Review Progress</h3>
            {currentUserId ? (
              <div className="mt-5">
                <div className="relative">
                  <div className="flex mb-2 items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold inline-block text-indigo-600">
                        Your Review Completion
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold inline-block text-indigo-600">
                        {userReviewProgress}%
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-indigo-200">
                    <div
                      style={{ width: `${userReviewProgress}%` }}
                      className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500"
                    ></div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Reviewed by you:</span>
                      <span className="font-medium text-green-600">{userReviewedProposals}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Pending your review:</span>
                      <span className="font-medium text-orange-600">{userUnreviewedProposals}</span>
                    </div>
                    {userUnreviewedProposals > 0 && (
                      <div className="mt-3">
                        <Link
                          href="/admin/proposals?reviewStatus=unreviewed"
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Review Next Proposal
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-sm text-gray-500">Please sign in to see your review progress.</p>
              </div>
            )}
          </div>
        </div>
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
        <h2 className="text-lg font-medium text-gray-900">Recent Proposals</h2>
        <div className="mt-6 flow-root">
          <ul role="list" className="-mb-8">
            {proposals
              .sort((a, b) => new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime())
              .slice(0, 5)
              .map((proposal, idx) => {
                const speaker = typeof proposal.speaker === 'object' && proposal.speaker && 'name' in proposal.speaker
                  ? proposal.speaker as Speaker
                  : null
                const isLast = idx === Math.min(proposals.length - 1, 4)

                return (
                  <li key={proposal._id}>
                    <div className={`relative ${!isLast ? 'pb-8' : ''}`}>
                      {!isLast && (
                        <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${proposal.status === Status.accepted ? 'bg-green-500' :
                            proposal.status === Status.rejected ? 'bg-red-500' :
                              proposal.status === Status.confirmed ? 'bg-blue-500' :
                                'bg-gray-500'
                            }`}>
                            <DocumentTextIcon aria-hidden="true" className="h-5 w-5 text-white" />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                          <div>
                            <p className="text-sm text-gray-500">
                              <Link href={`/admin/proposals/${proposal._id}`} className="font-medium text-gray-900 hover:text-indigo-600">
                                {proposal.title}
                              </Link>
                              {' '}by{' '}
                              <span className="font-medium text-gray-900">{speaker?.name || 'Unknown Speaker'}</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              Status: {proposal.status} • {proposal.reviews?.length || 0} reviews
                            </p>
                          </div>
                          <div className="whitespace-nowrap text-right text-sm text-gray-500">
                            <time dateTime={proposal._createdAt}>
                              {new Date(proposal._createdAt).toLocaleDateString()}
                            </time>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            {proposals.length === 0 && (
              <li>
                <div className="relative">
                  <div className="relative flex space-x-3">
                    <div>
                      <span className="h-8 w-8 rounded-full bg-gray-500 flex items-center justify-center ring-8 ring-white">
                        <DocumentTextIcon aria-hidden="true" className="h-5 w-5 text-white" />
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                      <div>
                        <p className="text-sm text-gray-500">
                          No proposals yet. <Link href="/cfp" className="font-medium text-indigo-600 hover:text-indigo-500">Share the CFP</Link> to get started!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
