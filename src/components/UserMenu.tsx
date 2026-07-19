'use client'

import { Fragment } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import {
  ArrowDownTrayIcon,
  ArrowRightStartOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  HomeIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  TicketIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { GitHubIcon, LinkedInIcon } from '@/components/SocialIcons'
import { usePwaInstall } from '@/components/pwa'
import type { Speaker } from '@/lib/speaker/types'
import type { Account } from 'next-auth'

type IconType = React.ComponentType<{ className?: string }>

interface MenuLink {
  href: string
  label: string
  icon: IconType
  /** External-ish links (open the public site view) get an affordance icon. */
  external?: boolean
}

/**
 * The audience-aware Messages entry. Exactly ONE renders for any user: an
 * organizer sees it in the Admin section (linking to the admin inbox), everyone
 * else sees it inline with the speaker links (the speaker inbox). The audience
 * rule everywhere is "isOrganizer wins", so it is omitted from the speaker links
 * for organizers and added to the Admin links instead (see `speakerLinksFor`).
 */
const SPEAKER_MESSAGES_LINK: MenuLink = {
  href: '/cfp/messages',
  label: 'Messages',
  icon: ChatBubbleLeftRightIcon,
}
const ADMIN_MESSAGES_LINK: MenuLink = {
  href: '/admin/messages',
  label: 'Messages',
  icon: ChatBubbleLeftRightIcon,
}

/**
 * Speaker-facing links available to every signed-in speaker. `/cfp/proposal` is
 * the NEW-proposal form (the list lives at `/cfp/list` = "My Dashboard"), so it
 * is labelled "Submit New Proposal" to avoid confusion with the dashboard.
 */
const SPEAKER_LINKS: MenuLink[] = [
  { href: '/cfp/list', label: 'My Dashboard', icon: Squares2X2Icon },
  {
    href: '/cfp/proposal',
    label: 'Submit New Proposal',
    icon: DocumentPlusIcon,
  },
  { href: '/cfp/profile', label: 'Edit Profile', icon: PencilSquareIcon },
  { href: '/cfp/expense', label: 'Travel & Expenses', icon: BanknotesIcon },
]

/**
 * Organizer-only admin quick links. Labels/icons/routes mirror the admin
 * sidebar (see AdminLayout) so the menu stays consistent with the admin area.
 */
const ADMIN_LINKS: MenuLink[] = [
  { href: '/admin', label: 'Admin Dashboard', icon: HomeIcon },
  { href: '/admin/proposals', label: 'Proposals', icon: DocumentTextIcon },
  ADMIN_MESSAGES_LINK,
  { href: '/admin/speakers', label: 'Speakers', icon: UsersIcon },
  { href: '/admin/sponsors', label: 'Sponsors', icon: BuildingOfficeIcon },
  { href: '/admin/schedule', label: 'Schedule', icon: CalendarDaysIcon },
  { href: '/admin/tickets', label: 'Tickets', icon: TicketIcon },
]

/**
 * The speaker links to render, given the viewer's audience. A non-organizer
 * gets the Messages entry inline; an organizer gets it in the Admin section
 * instead, so Messages never appears twice.
 */
function speakerLinksFor(isOrganizer: boolean): MenuLink[] {
  if (isOrganizer) return SPEAKER_LINKS
  return [SPEAKER_LINKS[0], SPEAKER_MESSAGES_LINK, ...SPEAKER_LINKS.slice(1)]
}

/** Maps a NextAuth provider id to its display name and brand icon. */
const PROVIDER_META: Record<string, { name: string; Icon: IconType }> = {
  github: { name: 'GitHub', Icon: GitHubIcon },
  linkedin: { name: 'LinkedIn', Icon: LinkedInIcon },
}

const itemClasses =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-gray-900 transition data-focus:bg-gray-50 dark:text-white dark:data-focus:bg-gray-700'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
      {children}
    </div>
  )
}

function Divider() {
  return <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
}

function LinkItem({ href, label, icon: Icon, external }: MenuLink) {
  return (
    <MenuItem>
      <Link href={href} className={itemClasses}>
        <Icon className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
        <span className="flex-1">{label}</span>
        {external && (
          <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
        )}
      </Link>
    </MenuItem>
  )
}

export interface UserMenuProps {
  /** Display name for the avatar's alt text. */
  name?: string
  /** Avatar image URL (`session.user.picture`). */
  picture?: string
  /** The signed-in speaker (`session.speaker`). */
  speaker?: Speaker
  /** The account the user authenticated with (`session.account`). */
  account?: Account
}

/**
 * Role-aware dropdown anchored on the signed-in speaker's avatar. Groups, in
 * order: speaker links, an organizer-only Admin section (gated solely on
 * `speaker.isOrganizer`), then app/account controls (install, current sign-in
 * provider, sign out). Built on Headless UI `Menu` so it is fully keyboard
 * accessible and focus-visible; dark-mode and mobile aware.
 */
export function UserMenu({ name, picture, speaker, account }: UserMenuProps) {
  const { canInstall } = usePwaInstall()

  const isOrganizer = Boolean(speaker?.isOrganizer)
  const slug = speaker?.slug
  const provider = account?.provider
  const providerMeta = provider ? PROVIDER_META[provider] : undefined

  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950">
        <Image
          src={picture || '/images/default-avatar.png'}
          alt={name || 'User'}
          width={40}
          height={40}
          className="h-10 w-10 rounded-full"
        />
      </MenuButton>

      <MenuItems
        transition
        anchor="bottom end"
        className="z-50 mt-3 max-h-[80vh] w-64 origin-top-right overflow-y-auto rounded-xl bg-white p-2 text-sm font-semibold shadow-lg ring-1 ring-gray-900/5 transition [--anchor-gap:0.5rem] data-closed:translate-y-1 data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in dark:bg-gray-800 dark:ring-white/10"
      >
        {name && (
          <div className="truncate px-3 pt-1 pb-2 text-gray-900 dark:text-white">
            {name}
          </div>
        )}

        {speakerLinksFor(isOrganizer).map((link) => (
          <LinkItem key={link.href} {...link} />
        ))}
        {slug && (
          <LinkItem
            href={`/speaker/${slug}`}
            label="View public profile"
            icon={ArrowTopRightOnSquareIcon}
            external
          />
        )}

        {isOrganizer && (
          <Fragment>
            <Divider />
            <SectionLabel>Admin</SectionLabel>
            {ADMIN_LINKS.map((link) => (
              <LinkItem key={link.href} {...link} />
            ))}
          </Fragment>
        )}

        <Divider />

        {canInstall && (
          <LinkItem
            href="/install"
            label="Install app"
            icon={ArrowDownTrayIcon}
          />
        )}

        {providerMeta && (
          <div className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            <providerMeta.Icon
              className="h-5 w-5 shrink-0"
              aria-hidden="true"
            />
            <span>Signed in with {providerMeta.name}</span>
          </div>
        )}

        <MenuItem>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-red-600 transition data-focus:bg-red-50 dark:text-red-400 dark:data-focus:bg-red-900/20"
          >
            <ArrowRightStartOnRectangleIcon className="h-5 w-5 shrink-0" />
            <span className="flex-1">Sign Out</span>
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
