'use client';

import { Action, ProposalExisting } from '@/lib/proposal/types';
import {
  ArchiveBoxXMarkIcon,
  ChevronDownIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon
} from '@heroicons/react/24/solid';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';

interface ProposalActionMenuProps {
  proposal: ProposalExisting;
  onAcceptReject: (proposal: ProposalExisting, action: Action) => void;
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function ProposalActionMenu({ proposal, onAcceptReject }: ProposalActionMenuProps) {
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
                    onAcceptReject(proposal, Action.accept);
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
                    onAcceptReject(proposal, Action.reject);
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
  );
}
