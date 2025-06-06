'use client';

import { FilterStats } from '@/hooks/useProposalFilter';
import { Status } from '@/lib/proposal/types';
import { memo } from 'react';

interface ProposalTableHeaderProps {
  stats: FilterStats;
  currentFilter: Status | undefined;
  onFilterChange: (filter: Status | undefined) => void;
}

interface StatItemProps {
  label: string;
  value: number;
  color?: 'default' | 'green' | 'blue' | 'red';
  onClick?: () => void;
  isActive?: boolean;
  dataTestId?: string;
}

const StatItem = memo(({
  label,
  value,
  color = 'default',
  onClick,
  isActive = false,
  dataTestId
}: StatItemProps) => {
  const textColorClass = {
    default: 'text-gray-900',
    green: 'text-green-500',
    blue: 'text-blue-500',
    red: 'text-red-500',
  }[color];

  const isClickable = Boolean(onClick);

  return (
    <div
      className={`flex flex-col items-center ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''} ${isActive && isClickable ? 'relative font-bold' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => isClickable && e.key === 'Enter' && onClick?.()}
      role={isClickable ? 'tab' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-selected={isClickable ? isActive : undefined}
      aria-label={isClickable ? `Filter by ${label.toLowerCase()}` : `${label}: ${value}`}
      data-testid={dataTestId}
    >
      <p className={`text-3xl font-semibold ${textColorClass} transition-colors`}>
        {value.toLocaleString()}
      </p>
      <p className={`text-sm ${isActive && isClickable ? 'text-indigo-600 font-medium' : 'text-gray-500'}`}>{label}</p>
      {isActive && isClickable && (
        <div className="absolute -bottom-2 h-1 w-12 bg-indigo-500 rounded-full"></div>
      )}
    </div>
  );
});

StatItem.displayName = 'StatItem';

export const ProposalTableHeader = memo(({
  stats,
  currentFilter,
  onFilterChange
}: ProposalTableHeaderProps) => {
  type StatConfig = {
    label: string;
    value: number;
    status?: Status;
    color?: 'default' | 'green' | 'blue' | 'red';
    testId: string;
  };
  const statItems: StatConfig[] = [
    {
      label: "Total",
      value: stats.total,
      testId: "stat-total"
    },
    {
      label: "Speakers",
      value: stats.speakerCount,
      testId: "stat-speakers"
    },
    {
      label: "Submitted",
      value: stats.submitted,
      status: Status.submitted,
      color: "blue",
      testId: "stat-submitted"
    },
    {
      label: "Accepted",
      value: stats.accepted,
      status: Status.accepted,
      color: "green",
      testId: "stat-accepted"
    },
    {
      label: "Confirmed",
      value: stats.confirmed,
      status: Status.confirmed,
      color: "green",
      testId: "stat-confirmed"
    },
    {
      label: "Rejected",
      value: stats.rejected,
      status: Status.rejected,
      color: "red",
      testId: "stat-rejected"
    },
    {
      label: "Withdrawn",
      value: stats.withdrawn,
      status: Status.withdrawn,
      color: "red",
      testId: "stat-withdrawn"
    },
  ];

  return (
    <div className="sm:flex sm:items-center" data-testid="proposal-table-header">
      <div className="sm:flex-auto">
        <h1 className="text-base leading-6 font-semibold text-gray-900">
          Proposals admin overview
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          A list of all proposals submitted by speakers (drafts are not shown)
        </p>
      </div>
      <div
        className="flex gap-4"
        role="tablist"
        aria-label="Filter proposals by status"
      >
        {statItems.map((item) => (
          <StatItem
            key={item.testId}
            label={item.label}
            value={item.value}
            color={item.color}
            onClick={item.status !== undefined || item.label === "Total"
              ? () => onFilterChange(item.status)
              : undefined}
            isActive={
              // Only consider an item active if it's clickable (has status or is Total)
              (item.status !== undefined || item.label === "Total") &&
              (
                (item.status === currentFilter) ||
                (item.label === "Total" && currentFilter === undefined) ||
                (item.testId === "stat-total" && currentFilter === undefined)
              )
            }
            dataTestId={item.testId}
          />
        ))}
      </div>
    </div>
  );
});

ProposalTableHeader.displayName = 'ProposalTableHeader';
