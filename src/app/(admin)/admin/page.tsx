import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/server'
import { ProposalExisting, Status } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { Review } from '@/lib/review/types'
import { getAuthSession } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin'
import {
  DocumentTextIcon,
  UsersIcon,
  CalendarDaysIcon,
  StarIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

export default async function AdminDashboard() {
  const session = await getAuthSession()
  const currentUserId = session?.speaker?._id

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  let proposals: ProposalExisting[] = []
  if (!conferenceError && conference) {
    const { proposals: proposalData } = await getProposals({
      conferenceId: conference._id,
      returnAll: true,
      includeReviews: true,
      includePreviousAcceptedTalks: true,
    })
    proposals = proposalData || []
  }

  const totalProposals = proposals.length

  const submittedProposals = proposals.filter(
    (p) => p.status === Status.submitted,
  ).length
  const acceptedProposals = proposals.filter(
    (p) => p.status === Status.accepted,
  ).length
  const rejectedProposals = proposals.filter(
    (p) => p.status === Status.rejected,
  ).length
  const confirmedProposals = proposals.filter(
    (p) => p.status === Status.confirmed,
  ).length

  const uniqueSpeakers = new Set(
    proposals
      .flatMap((p) =>
        p.speakers && Array.isArray(p.speakers)
          ? p.speakers
            .filter(
              (speaker) =>
                typeof speaker === 'object' && speaker && '_id' in speaker,
            )
            .map((speaker) => speaker._id)
          : [],
      )
      .filter(Boolean),
  ).size

  const totalReviews = proposals.reduce((acc, proposal) => {
    return acc + (proposal.reviews?.length || 0)
  }, 0)

  const reviewedProposals = proposals.filter(
    (p) => p.reviews && p.reviews.length > 0,
  ).length
  const unreviewedProposals = totalProposals - reviewedProposals

  const ratingsWithScores = proposals.flatMap((p) =>
    (p.reviews || [])
      .map((review) => {
        const r =
          typeof review === 'object' && 'score' in review
            ? (review as Review)
            : null
        if (!r?.score) return null
        return (r.score.content + r.score.relevance + r.score.speaker) / 3
      })
      .filter((rating): rating is number => rating !== null),
  )
  const averageRating =
    ratingsWithScores.length > 0
      ? ratingsWithScores.reduce((a, b) => a + b, 0) / ratingsWithScores.length
      : 0

  const formatBreakdown = proposals.reduce(
    (acc, p) => {
      acc[p.format] = (acc[p.format] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const acceptanceRate =
    totalProposals > 0
      ? Math.round(
        ((acceptedProposals + confirmedProposals) / totalProposals) * 100,
      )
      : 0

  const userReviewedProposals = currentUserId
    ? proposals.filter((p) =>
      p.reviews?.some((review) => {
        const r =
          typeof review === 'object' && 'reviewer' in review
            ? (review as Review)
            : null
        const reviewerId =
          typeof r?.reviewer === 'object' && r.reviewer && '_id' in r.reviewer
            ? r.reviewer._id
            : null
        return reviewerId === currentUserId
      }),
    ).length
    : 0

  const userUnreviewedProposals = currentUserId
    ? totalProposals - userReviewedProposals
    : 0
  const userReviewProgress =
    totalProposals > 0
      ? Math.round((userReviewedProposals / totalProposals) * 100)
      : 0

  const stats = [
    {
      name: 'Total Proposals',
      stat: totalProposals.toString(),
      icon: DocumentTextIcon,
      subtext: `${submittedProposals} submitted`,
      href: '/admin/proposals',
    },
    {
      name: 'Unique Speakers',
      stat: uniqueSpeakers.toString(),
      icon: UsersIcon,
      subtext: `${(totalProposals / uniqueSpeakers || 0).toFixed(1)} proposals/speaker`,
      href: '/admin/speakers',
    },
    {
      name: 'Reviews Completed',
      stat: totalReviews.toString(),
      icon: StarIcon,
      subtext: `${reviewedProposals}/${totalProposals} proposals reviewed`,
      href: '/admin/proposals?reviewStatus=reviewed',
    },
    {
      name: 'Acceptance Rate',
      stat: `${acceptanceRate}%`,
      icon: CheckCircleIcon,
      subtext: `${acceptedProposals + confirmedProposals} accepted, ${rejectedProposals} rejected`,
      href: '/admin/proposals?status=accepted,confirmed',
    },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<DocumentTextIcon />}
        title="Admin Dashboard"
        description={
          <>
            Overview of{' '}
            <span className="font-semibold">
              {conference?.title || 'conference'}
            </span>{' '}
            management
          </>
        }
      />

      <div>
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => (
            <div
              key={item.name}
              className="relative overflow-hidden rounded-lg bg-white px-4 pt-5 pb-12 shadow sm:px-6 sm:pt-6 dark:bg-gray-900 dark:shadow-gray-900/20"
            >
              <dt>
                <div className="absolute rounded-md bg-indigo-500 p-3 dark:bg-indigo-600">
                  <item.icon
                    aria-hidden="true"
                    className="h-6 w-6 text-white"
                  />
                </div>
                <p className="ml-16 truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                  {item.name}
                </p>
              </dt>
              <dd className="ml-16 flex flex-col pb-6 sm:pb-7">
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {item.stat}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {item.subtext}
                </p>
                <div className="absolute inset-x-0 bottom-0 bg-gray-50 px-4 py-4 sm:px-6 dark:bg-gray-800">
                  <div className="text-sm">
                    <Link
                      href={item.href}
                      className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      View details
                    </Link>
                  </div>
                </div>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-gray-900/20">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
              Proposal Status Breakdown
            </h3>
            <div className="mt-5">
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    <Link
                      href="/admin/proposals?status=submitted"
                      className="hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      Submitted
                    </Link>
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {submittedProposals}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    <Link
                      href="/admin/proposals?status=accepted"
                      className="hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      Accepted
                    </Link>
                  </dt>
                  <dd className="text-sm font-medium text-green-600 dark:text-green-400">
                    {acceptedProposals}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    <Link
                      href="/admin/proposals?status=rejected"
                      className="hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      Rejected
                    </Link>
                  </dt>
                  <dd className="text-sm font-medium text-red-600 dark:text-red-400">
                    {rejectedProposals}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    <Link
                      href="/admin/proposals?status=confirmed"
                      className="hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      Confirmed
                    </Link>
                  </dt>
                  <dd className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    {confirmedProposals}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-gray-900/20">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
              Review Statistics
            </h3>
            <div className="mt-5">
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Total Reviews
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {totalReviews}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    <Link
                      href="/admin/proposals?reviewStatus=reviewed"
                      className="hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      Reviewed Proposals
                    </Link>
                  </dt>
                  <dd className="text-sm font-medium text-green-600 dark:text-green-400">
                    {reviewedProposals}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    <Link
                      href="/admin/proposals?reviewStatus=unreviewed"
                      className="hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      Pending Review
                    </Link>
                  </dt>
                  <dd className="text-sm font-medium text-orange-600 dark:text-orange-400">
                    {unreviewedProposals}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Average Rating
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {averageRating > 0
                      ? `${averageRating.toFixed(1)}/5.0`
                      : 'N/A'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-gray-900/20">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
              Proposal Formats
            </h3>
            <div className="mt-5">
              <dl className="space-y-3">
                {Object.entries(formatBreakdown).map(([format, count]) => (
                  <div key={format} className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      <Link
                        href={`/admin/proposals?format=${format}`}
                        className="capitalize hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {format.replace('_', ' ')}
                      </Link>
                    </dt>
                    <dd className="text-sm text-gray-900 dark:text-white">
                      {count}
                    </dd>
                  </div>
                ))}
                {Object.keys(formatBreakdown).length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No proposals yet
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-gray-900/20">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
              My Review Progress
            </h3>
            {currentUserId ? (
              <div className="mt-5">
                <div className="relative">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className="inline-block text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        Your Review Completion
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="inline-block text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {userReviewProgress}%
                      </span>
                    </div>
                  </div>
                  <div className="mb-4 flex h-2 overflow-hidden rounded bg-indigo-200 text-xs dark:bg-indigo-800">
                    <div
                      style={{ width: `${userReviewProgress}%` }}
                      className="flex flex-col justify-center bg-indigo-500 text-center whitespace-nowrap text-white shadow-none dark:bg-indigo-400"
                    ></div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        Reviewed by you:
                      </span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {userReviewedProposals}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        Pending your review:
                      </span>
                      <span className="font-medium text-orange-600 dark:text-orange-400">
                        {userUnreviewedProposals}
                      </span>
                    </div>
                    {userUnreviewedProposals > 0 && (
                      <div className="mt-3">
                        <Link
                          href="/admin/proposals?reviewStatus=unreviewed"
                          className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-3 py-2 text-sm leading-4 font-medium text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:focus:ring-indigo-400"
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
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Please sign in to see your review progress.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500">
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <DocumentTextIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <Link href="/admin/proposals" className="focus:outline-none">
                  <span aria-hidden="true" className="absolute inset-0" />
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Manage Proposals
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    Review and manage speaker proposals
                  </p>
                </Link>
              </div>
            </div>
          </div>

          <div className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500">
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <UsersIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <a href="/admin/speakers" className="focus:outline-none">
                  <span aria-hidden="true" className="absolute inset-0" />
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Manage Speakers
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    View and manage speaker profiles
                  </p>
                </a>
              </div>
            </div>
          </div>

          <div className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500">
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <CalendarDaysIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <a href="/admin/schedule" className="focus:outline-none">
                  <span aria-hidden="true" className="absolute inset-0" />
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Manage Schedule
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    Create and manage event schedule
                  </p>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Recent Proposals
        </h2>
        <div className="mt-6 flow-root">
          <ul role="list" className="-mb-8">
            {proposals
              .sort(
                (a, b) =>
                  new Date(b._createdAt).getTime() -
                  new Date(a._createdAt).getTime(),
              )
              .slice(0, 5)
              .map((proposal, idx) => {
                const speakers =
                  proposal.speakers && Array.isArray(proposal.speakers)
                    ? proposal.speakers.filter(
                      (speaker) =>
                        typeof speaker === 'object' &&
                        speaker &&
                        'name' in speaker,
                    )
                    : []
                const primarySpeaker =
                  speakers.length > 0 ? (speakers[0] as Speaker) : null
                const isLast = idx === Math.min(proposals.length - 1, 4)

                return (
                  <li key={proposal._id}>
                    <div className={`relative ${!isLast ? 'pb-8' : ''}`}>
                      {!isLast && (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full ring-8 ring-white dark:ring-gray-900 ${proposal.status === Status.accepted
                                ? 'bg-green-500'
                                : proposal.status === Status.rejected
                                  ? 'bg-red-500'
                                  : proposal.status === Status.confirmed
                                    ? 'bg-blue-500'
                                    : 'bg-gray-500'
                              }`}
                          >
                            <DocumentTextIcon
                              aria-hidden="true"
                              className="h-5 w-5 text-white"
                            />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                          <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              <Link
                                href={`/admin/proposals/${proposal._id}`}
                                className="font-medium text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                              >
                                {proposal.title}
                              </Link>{' '}
                              by{' '}
                              <span className="font-medium text-gray-900 dark:text-white">
                                {primarySpeaker?.name || 'Unknown Speaker'}
                              </span>
                            </p>
                            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                              Status: {proposal.status} •{' '}
                              {proposal.reviews?.length || 0} reviews
                            </p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                            <time dateTime={proposal._createdAt}>
                              {new Date(
                                proposal._createdAt,
                              ).toLocaleDateString()}
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
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500 ring-8 ring-white dark:ring-gray-900">
                        <DocumentTextIcon
                          aria-hidden="true"
                          className="h-5 w-5 text-white"
                        />
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No proposals yet.{' '}
                          <Link
                            href="/cfp"
                            className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            Share the CFP
                          </Link>{' '}
                          to get started!
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
