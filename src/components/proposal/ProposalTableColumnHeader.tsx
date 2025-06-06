'use client';

import { ChevronDownIcon, ChevronUpDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';
import { SortConfig, SortField } from '@/hooks/useProposalSort';
import { memo } from 'react';

interface ProposalTableColumnHeaderProps {
  title: string;
  field: SortField;
  sortConfig: SortConfig;
  onSort: (field: SortField) => void;
  isFirstColumn?: boolean;
}

export const ProposalTableColumnHeader = memo(({
  title,
  field,
  sortConfig,
  onSort,
  isFirstColumn = false,
}: ProposalTableColumnHeaderProps) => {
  const baseClass = "text-left text-sm font-semibold text-gray-900 cursor-pointer group";
  const className = isFirstColumn
    ? `py-3.5 pr-3 pl-4 sm:pl-0 ${baseClass}`
    : `px-3 py-3.5 ${baseClass}`;

  return (
    <th
      scope="col"
      className={className}
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
});

ProposalTableColumnHeader.displayName = 'ProposalTableColumnHeader';
