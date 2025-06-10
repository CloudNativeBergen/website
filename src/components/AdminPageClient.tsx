'use client';

import { useState } from 'react';
import { AdminProposalLayout } from '@/components/AdminProposalLayout';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { FolderOpenIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { ProposalExisting } from '@/lib/proposal/types';

interface AdminPageClientProps {
  proposals: ProposalExisting[];
}

export function AdminPageClient({ proposals }: AdminPageClientProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="h-full flex flex-col">
      {/* Header with search and actions */}
      <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Proposal Management
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Review and manage all conference proposals
            </p>
          </div>
          <div className="ml-4 flex items-center gap-x-4">
            <form className="relative flex flex-1" action="#" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="search-field" className="sr-only">
                Search proposals
              </label>
              <MagnifyingGlassIcon
                className="pointer-events-none absolute inset-y-0 left-0 h-full w-5 text-gray-400 ml-3"
                aria-hidden="true"
              />
              <input
                id="search-field"
                className="block h-full w-full min-w-0 border-0 py-0 pl-10 pr-0 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
                placeholder="Search proposals..."
                type="search"
                name="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            <div className="flex items-center text-sm text-gray-500">
              {proposals.length} proposal{proposals.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      {proposals.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
          <div className="text-center">
            <FolderOpenIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              No proposals yet
            </h3>
            <p className="mt-2 text-sm text-gray-500 max-w-sm">
              Get started by asking speakers to submit their talk proposals for the conference.
            </p>
            <div className="mt-6">
              <Link
                href="/cfp"
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                View CFP Page
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <AdminProposalLayout
            proposals={proposals}
            searchQuery={searchQuery}
          />
        </div>
      )}
    </div>
  );
}
