'use client'

import {
  FormatFormat,
  FormatLanguage,
  FormatLevel,
  FormatStatus,
} from '@/lib/proposal/format'
import { ProposalExisting, Status, Action } from '@/lib/proposal/types'
import { Speaker, Flags } from '@/lib/speaker/types'
import {
  ArchiveBoxXMarkIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/solid'
import { useState } from 'react'
import {
  Menu,
  MenuButton,
  Transition,
  MenuItems,
  MenuItem,
} from '@headlessui/react'
import { ProposalActionModal } from './ProposalActionModal'

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

function Dropdown({
  proposal,
  acceptRejectHandler,
}: {
  proposal: ProposalExisting
  acceptRejectHandler: (proposal: ProposalExisting, action: Action) => void
}) {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <MenuButton className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white px-2 py-1 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50">
          Options
          <ChevronDownIcon
            className="-mr-1 h-5 w-5 text-gray-400"
            aria-hidden="true"
          />
        </MenuButton>
      </div>

      <Transition
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <MenuItems className="ring-opacity-5 absolute right-0 z-10 mt-2 w-56 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black focus:outline-none">
          <div className="py-1">
            <MenuItem>
              {({ focus }) => (
                <a
                  href={`https://cloudnativebergen.sanity.studio/studio/structure/talk;${proposal._id}`}
                  className={classNames(
                    focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                    'group flex items-center px-4 py-2 text-sm',
                  )}
                >
                  <PencilSquareIcon
                    className="mr-3 h-5 w-5 text-gray-300 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                  Open in Sanity
                </a>
              )}
            </MenuItem>
            <MenuItem>
              {({ focus }) => (
                <a
                  href={`/cfp/admin/${proposal._id}/view`}
                  className={classNames(
                    focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                    'group flex items-center px-4 py-2 text-sm',
                  )}
                >
                  <MagnifyingGlassIcon
                    className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                  Review
                </a>
              )}
            </MenuItem>
          </div>
          <div className="py-1">
            <MenuItem>
              {({ focus }) => (
                <a
                  href="#"
                  onClick={() => {
                    acceptRejectHandler(proposal, Action.accept)
                  }}
                  className={classNames(
                    focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                    'group flex items-center px-4 py-2 text-sm',
                  )}
                >
                  <HeartIcon
                    className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                  Accept
                </a>
              )}
            </MenuItem>
            <MenuItem>
              {({ focus }) => (
                <a
                  href="#"
                  onClick={() => {
                    acceptRejectHandler(proposal, Action.reject)
                  }}
                  className={classNames(
                    focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                    'group flex items-center px-4 py-2 text-sm',
                  )}
                >
                  <ArchiveBoxXMarkIcon
                    className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                  Reject
                </a>
              )}
            </MenuItem>
          </div>
          <div className="py-1">
            <MenuItem disabled>
              {({ focus }) => (
                <span
                  className={classNames(
                    focus ? 'bg-gray-100 text-gray-900' : 'text-gray-300',
                    'group flex items-center px-4 py-2 text-sm',
                  )}
                >
                  <TrashIcon
                    className="mr-3 h-5 w-5 text-gray-300 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                  Delete
                </span>
              )}
            </MenuItem>
          </div>
        </MenuItems>
      </Transition>
    </Menu>
  )
}

// Define the sort fields and their types
type SortField = 'title' | 'speaker' | 'format' | 'language' | 'level' | 'status' | 'score';
type SortDirection = 'asc' | 'desc';
type SortConfig = {
  field: SortField;
  direction: SortDirection;
} | null;

function SortableHeader({
  title,
  field,
  sortConfig,
  onSort
}: {
  title: string;
  field: SortField;
  sortConfig: SortConfig;
  onSort: (field: SortField) => void
}) {
  return (
    <th
      scope="col"
      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer group"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center">
        {title}
        <span className="ml-2 flex-none rounded text-gray-400 group-hover:visible group-focus:visible">
          {sortConfig?.field === field ? (
            sortConfig.direction === 'asc' ? (
              <ChevronUpIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
            )
          ) : (
            <ChevronUpDownIcon className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </div>
    </th>
  );
}

export function ProposalTable({ p }: { p: ProposalExisting[] }) {
  const [actionOpen, setActionOpen] = useState(false)
  const [actionProposal, setActionProposal] = useState<ProposalExisting>(
    {} as ProposalExisting,
  )
  const [actionAction, setActionAction] = useState<Action>(Action.accept)
  const [proposals, setProposals] = useState<ProposalExisting[]>(p)
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)

  function acceptRejectClickHandler(
    proposal: ProposalExisting,
    action: Action,
  ) {
    setActionProposal(proposal)
    setActionAction(action)
    setActionOpen(true)
  }

  function modalCloseHandler() {
    setActionOpen(false)
    setActionProposal({} as ProposalExisting)
    setActionAction(Action.accept)
  }

  function modalActionHandler(id: string, status: Status) {
    const updatedProposals = proposals.map((p) => {
      if (p._id === id) {
        return { ...p, status }
      }
      return p
    })
    setProposals(updatedProposals)
  }

  // Sort handler function
  const handleSort = (field: SortField) => {
    let direction: SortDirection = 'asc';

    // If we're already sorting by this field, toggle the direction
    if (sortConfig && sortConfig.field === field && sortConfig.direction === 'asc') {
      direction = 'desc';
    }

    setSortConfig({ field, direction });
  };

  // Get sorted proposals based on current sort config
  const getSortedProposals = () => {
    if (!sortConfig) return proposals;

    return [...proposals].sort((a, b) => {
      // Special case for speaker field which needs to extract the name
      if (sortConfig.field === 'speaker') {
        const speakerA = a.speaker && 'name' in a.speaker ? a.speaker.name : 'Unknown';
        const speakerB = b.speaker && 'name' in b.speaker ? b.speaker.name : 'Unknown';
        return sortConfig.direction === 'asc'
          ? speakerA.localeCompare(speakerB)
          : speakerB.localeCompare(speakerA);
      }

      // Special case for score field which needs numerical comparison
      if (sortConfig.field === 'score') {
        const scoreA = getAverageScore(a.reviews || []);
        const scoreB = getAverageScore(b.reviews || []);
        return sortConfig.direction === 'asc'
          ? scoreA - scoreB
          : scoreB - scoreA;
      }

      // For all other string fields, use localeCompare directly
      const valueA = a[sortConfig.field] as string;
      const valueB = b[sortConfig.field] as string;

      return sortConfig.direction === 'asc'
        ? valueA.localeCompare(valueB)
        : valueB.localeCompare(valueA);
    });
  };

  // Helper function to calculate average score
  const getAverageScore = (reviews: any[]) => {
    if (!reviews || reviews.length === 0) return 0;

    const totalScore = reviews.reduce(
      (acc, review) =>
        acc +
        review.score.content +
        review.score.relevance +
        review.score.speaker,
      0,
    );

    return (totalScore / reviews.length) / 3;
  };

  const [proposalStatusFilter, setProposalStatusFilter] = useState<Status | undefined>(undefined)
  const [showLanguageColumn, setShowLanguageColumn] = useState<boolean>(false)
  const [showLevelColumn, setShowLevelColumn] = useState<boolean>(true)
  const [showReviewColumn, setShowReviewColumn] = useState<boolean>(true)

  const total = proposals.length
  const speakers = Array.from(
    new Set(
      proposals.map((proposal) =>
        proposal.speaker && 'name' in proposal.speaker
          ? (proposal.speaker as Speaker).name
          : 'Unknown author',
      ),
    ),
  )
  const accepted = proposals.filter((p) => p.status === Status.accepted).length
  const confirmed = proposals.filter(
    (p) => p.status === Status.confirmed,
  ).length
  const rejected = proposals.filter((p) => p.status === Status.rejected).length
  const withdrawn = proposals.filter(
    (p) => p.status === Status.withdrawn,
  ).length

  return (
    <>
      <ProposalActionModal
        open={actionOpen}
        close={modalCloseHandler}
        onAction={modalActionHandler}
        proposal={actionProposal}
        action={actionAction}
        adminUI={true}
      />
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-base leading-6 font-semibold text-gray-900">
              Proposals admin overview
            </h1>
            <p className="mt-2 text-sm text-gray-700">
              A list of all proposals submitted by speakers (drafts are not
              shown)
            </p>
          </div>
          <div className="flex gap-4">
            <div
              className="flex cursor-pointer flex-col items-center"
              onClick={setProposalStatusFilter.bind(null, undefined)}
            >
              <p className="text-3xl font-semibold text-gray-900">{total}</p>
              <p className="text-sm text-gray-500">Total</p>
            </div>
            <div className="flex flex-col items-center">
              <p className="text-3xl font-semibold text-gray-900">
                {speakers.length}
              </p>
              <p className="text-sm text-gray-500">Speakers</p>
            </div>
            <div
              className="flex cursor-pointer flex-col items-center"
              onClick={setProposalStatusFilter.bind(null, Status.accepted)}
            >
              <p className="text-3xl font-semibold text-green-500">
                {accepted}
              </p>
              <p className="text-sm text-gray-500">Accepted</p>
            </div>
            <div
              className="flex cursor-pointer flex-col items-center"
              onClick={setProposalStatusFilter.bind(null, Status.confirmed)}
            >
              <p className="text-3xl font-semibold text-blue-500">
                {confirmed}
              </p>
              <p className="text-sm text-gray-500">Confirmed</p>
            </div>
            <div
              className="flex cursor-pointer flex-col items-center"
              onClick={setProposalStatusFilter.bind(null, Status.rejected)}
            >
              <p className="text-3xl font-semibold text-red-500">{rejected}</p>
              <p className="text-sm text-gray-500">Rejected</p>
            </div>
            <div
              className="flex cursor-pointer flex-col items-center"
              onClick={setProposalStatusFilter.bind(null, Status.withdrawn)}
            >
              <p className="text-3xl font-semibold text-red-500">{withdrawn}</p>
              <p className="text-sm text-gray-500">Withdrawn</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex space-x-3 items-center">
          <div className="flex items-center">
            <input
              id="show-language"
              name="show-language"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
              checked={showLanguageColumn}
              onChange={() => setShowLanguageColumn(!showLanguageColumn)}
            />
            <label htmlFor="show-language" className="ml-2 text-sm text-gray-700">
              Show Language
            </label>
          </div>
          <div className="flex items-center">
            <input
              id="show-level"
              name="show-level"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
              checked={showLevelColumn}
              onChange={() => setShowLevelColumn(!showLevelColumn)}
            />
            <label htmlFor="show-level" className="ml-2 text-sm text-gray-700">
              Show Level
            </label>
          </div>
          <div className="flex items-center">
            <input
              id="show-review"
              name="show-review"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
              checked={showReviewColumn}
              onChange={() => setShowReviewColumn(!showReviewColumn)}
            />
            <label htmlFor="show-review" className="ml-2 text-sm text-gray-700">
              Show Review Score
            </label>
          </div>
        </div>
        <div className="mt-8 flow-root">
          {/* @TODO make overflow play nice with the dropdown on smaller screens */}
          <div className="-mx-4 -my-2 overflow-x-auto overflow-y-visible sm:-mx-6 md:overflow-x-visible lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-gray-300">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-0 cursor-pointer group"
                      onClick={() => handleSort('title')}
                    >
                      <div className="flex items-center">
                        Title
                        <span className="ml-2 flex-none rounded text-gray-400 group-hover:visible group-focus:visible">
                          {sortConfig?.field === 'title' ? (
                            sortConfig.direction === 'asc' ? (
                              <ChevronUpIcon className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
                            )
                          ) : (
                            <ChevronUpDownIcon className="h-4 w-4" aria-hidden="true" />
                          )}
                        </span>
                      </div>
                    </th>
                    <SortableHeader
                      title="Speaker"
                      field="speaker"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      title="Format"
                      field="format"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    {showLanguageColumn && (
                      <SortableHeader
                        title="Language"
                        field="language"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    )}
                    {showLevelColumn && (
                      <SortableHeader
                        title="Level"
                        field="level"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    )}
                    <SortableHeader
                      title="Status"
                      field="status"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    {showReviewColumn && (
                      <SortableHeader
                        title="Score"
                        field="score"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    )}
                    <th
                      scope="col"
                      className="relative py-3.5 pr-4 pl-3 sm:pr-0"
                    >
                      <span className="sr-only">Edit</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {getSortedProposals().filter((p) => {
                    if (!proposalStatusFilter) return true
                    return p.status === proposalStatusFilter
                  }).map((proposal) => (
                    <tr key={proposal._id}>
                      <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-0 md:whitespace-normal">
                        {proposal.title}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-normal text-gray-500">
                        {proposal.speaker && 'name' in proposal.speaker
                          ? (proposal.speaker as Speaker).name
                          : 'Unknown author'}
                        {proposal.speaker &&
                          'flags' in proposal.speaker &&
                          proposal.speaker.flags &&
                          proposal.speaker.flags.includes(
                            Flags.requiresTravelFunding,
                          ) && (
                            <span className="has-tooltip">
                              <span className="tooltip rounded bg-red-600 p-1 text-xs text-white shadow-lg">
                                Requires travel funding
                              </span>

                              <ExclamationTriangleIcon className="inline-block h-4 w-4 align-middle text-red-500" />
                            </span>
                          )}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                        <FormatFormat format={proposal.format} />
                      </td>
                      {showLanguageColumn && (
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                          <FormatLanguage language={proposal.language} />
                        </td>
                      )}
                      {showLevelColumn && (
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                          <FormatLevel level={proposal.level} />
                        </td>
                      )}
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                        <FormatStatus status={proposal.status} />
                      </td>
                      {showReviewColumn && (
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                          {proposal.reviews && proposal.reviews.length > 0 ? (
                            (() => {
                              const numReviews = proposal.reviews.length;
                              const totalScore =
                                proposal.reviews.reduce(
                                  (acc, review) =>
                                    acc +
                                    review.score.content +
                                    review.score.relevance +
                                    review.score.speaker,
                                  0,
                                ) / numReviews;
                              const averageScore = totalScore / 3;
                              let scoreColor = 'text-gray-500'; // Default color
                              if (averageScore < 3) {
                                scoreColor = 'text-red-500';
                              } else if (averageScore >= 3 && averageScore < 4) {
                                scoreColor = 'text-orange-500';
                              } else if (averageScore >= 4) {
                                scoreColor = 'text-green-500';
                              }
                              return (
                                <span className={scoreColor}>
                                  {averageScore.toFixed(1)} ({numReviews})
                                </span>
                              );
                            })()
                          ) : (
                            'N/A'
                          )}
                        </td>
                      )}
                      <td className="relative py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
                        <Dropdown
                          proposal={proposal}
                          acceptRejectHandler={acceptRejectClickHandler}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
