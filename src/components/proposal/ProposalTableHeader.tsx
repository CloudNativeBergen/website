'use client';

import { FilterStats } from '@/hooks/useProposalFilter';
import { Status } from '@/lib/proposal/types';

interface ProposalTableHeaderProps {
  stats: FilterStats;
  currentFilter: Status | undefined;
  onFilterChange: (filter: Status | undefined) => void;
}

export function ProposalTableHeader({
  stats,
  currentFilter,
  onFilterChange
}: ProposalTableHeaderProps) {
  return (
    <div className="sm:flex sm:items-center">
      <div className="sm:flex-auto">
        <h1 className="text-base leading-6 font-semibold text-gray-900">
          Proposals admin overview
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          A list of all proposals submitted by speakers (drafts are not shown)
        </p>
      </div>
      <div className="flex gap-4">
        <div
          className="flex cursor-pointer flex-col items-center"
          onClick={() => onFilterChange(undefined)}
        >
          <p className="text-3xl font-semibold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-3xl font-semibold text-gray-900">
            {stats.speakerCount}
          </p>
          <p className="text-sm text-gray-500">Speakers</p>
        </div>
        <div
          className="flex cursor-pointer flex-col items-center"
          onClick={() => onFilterChange(Status.accepted)}
        >
          <p className="text-3xl font-semibold text-green-500">
            {stats.accepted}
          </p>
          <p className="text-sm text-gray-500">Accepted</p>
        </div>
        <div
          className="flex cursor-pointer flex-col items-center"
          onClick={() => onFilterChange(Status.confirmed)}
        >
          <p className="text-3xl font-semibold text-blue-500">
            {stats.confirmed}
          </p>
          <p className="text-sm text-gray-500">Confirmed</p>
        </div>
        <div
          className="flex cursor-pointer flex-col items-center"
          onClick={() => onFilterChange(Status.rejected)}
        >
          <p className="text-3xl font-semibold text-red-500">{stats.rejected}</p>
          <p className="text-sm text-gray-500">Rejected</p>
        </div>
        <div
          className="flex cursor-pointer flex-col items-center"
          onClick={() => onFilterChange(Status.withdrawn)}
        >
          <p className="text-3xl font-semibold text-red-500">{stats.withdrawn}</p>
          <p className="text-sm text-gray-500">Withdrawn</p>
        </div>
      </div>
    </div>
  );
}
