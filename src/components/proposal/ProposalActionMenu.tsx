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
import { Menu, MenuButton, MenuItem as HeadlessMenuItem, MenuItems, Transition } from '@headlessui/react';
import React, { ForwardRefExoticComponent, SVGProps, ElementType, memo } from 'react';

interface ProposalActionMenuProps {
  proposal: ProposalExisting;
  onAcceptReject: (proposal: ProposalExisting, action: Action) => void;
}

// Utility function for combining class names
function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

type IconComponent = ForwardRefExoticComponent<SVGProps<SVGSVGElement>>;

interface ActionMenuItemProps {
  icon: IconComponent;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  iconColorClass?: string;
}

const ActionMenuItem = memo(({
  icon: Icon,
  label,
  onClick,
  href,
  disabled = false,
  iconColorClass = "text-gray-400"
}: ActionMenuItemProps) => {
  // Determine whether this is a link or just a menu item
  const isLink = Boolean(href) && !disabled;

  // Type the component properly to avoid TS errors
  const Component: ElementType = isLink ? 'a' : 'button';

  return (
    <HeadlessMenuItem disabled={disabled}>
      {({ active }) => {
        const baseClassName = classNames(
          active ? 'bg-gray-100 text-gray-900' : disabled ? 'text-gray-300' : 'text-gray-700',
          'group flex w-full items-center px-4 py-2 text-sm',
          !disabled && !isLink ? 'cursor-pointer' : ''
        );

        const commonProps = {
          className: baseClassName,
          role: !isLink ? 'menuitem' : undefined,
          ...(isLink ? { href } : {}),
          ...(onClick && !disabled ? {
            onClick: (e: React.MouseEvent) => {
              e.preventDefault();
              onClick();
            }
          } : {}),
          tabIndex: disabled ? -1 : 0,
          'aria-disabled': disabled
        };

        // JSX doesn't play well with ElementType when using dynamic components
        return React.createElement(
          Component,
          commonProps,
          <>
            <Icon
              className={classNames(
                "mr-3 h-5 w-5",
                disabled ? "text-gray-300" : `${iconColorClass} group-hover:text-gray-500`
              )}
              aria-hidden="true"
            />
            {label}
          </>
        );
      }}
    </HeadlessMenuItem>
  );
});

ActionMenuItem.displayName = 'ActionMenuItem';

export const ProposalActionMenu = memo(({ proposal, onAcceptReject }: ProposalActionMenuProps) => {
  const handleAccept = () => {
    onAcceptReject(proposal, Action.accept);
  };

  const handleReject = () => {
    onAcceptReject(proposal, Action.reject);
  };

  return (
    <Menu as="div" className="relative inline-block text-left">
      {({ open }) => (
        <>
          <div>
            <MenuButton
              className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white px-2 py-1 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label={`Actions for proposal: ${proposal.title}`}
            >
              Options
              <ChevronDownIcon
                className="-mr-1 h-5 w-5 text-gray-400"
                aria-hidden="true"
              />
            </MenuButton>
          </div>

          <Transition
            show={open}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <MenuItems
              className="ring-opacity-5 absolute right-0 z-10 mt-2 w-56 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black focus:outline-none"
            >
              <div className="py-1">
                <ActionMenuItem
                  icon={MagnifyingGlassIcon}
                  label="Review"
                  href={`/cfp/admin/${proposal._id}/view`}
                />
                <ActionMenuItem
                  icon={PencilSquareIcon}
                  label="Open in Sanity"
                  href={`https://cloudnativebergen.sanity.studio/studio/structure/talk;${proposal._id}`}
                  iconColorClass="text-gray-300"
                />
              </div>
              <div className="py-1">
                <ActionMenuItem
                  icon={HeartIcon}
                  label="Accept"
                  onClick={handleAccept}
                  iconColorClass="text-green-500"
                />
                <ActionMenuItem
                  icon={ArchiveBoxXMarkIcon}
                  label="Reject"
                  onClick={handleReject}
                  iconColorClass="text-red-500"
                />
              </div>
              <div className="py-1">
                <ActionMenuItem
                  icon={TrashIcon}
                  label="Delete"
                  disabled
                />
              </div>
            </MenuItems>
          </Transition>
        </>
      )}
    </Menu>
  );
});

ProposalActionMenu.displayName = 'ProposalActionMenu';
