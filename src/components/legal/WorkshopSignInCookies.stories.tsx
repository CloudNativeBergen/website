import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import {
  WorkshopSessionCookieItem,
  WorkshopSignInCookieNote,
} from './WorkshopSignInCookies'

/**
 * The decorators are STAND-INS for where the two passages sit on /privacy
 * (the cookies section, and the amber "Workshop Registration" card), not
 * those sections.
 */
const meta = {
  title: 'Components/WorkshopSignInCookies',
  component: WorkshopSignInCookieNote,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'How /privacy describes the workshop portal’s own sign-in cookies (#1316). The note in the cookies section is shown to every tenant; the line in the data list names WorkOS and is shown only where WorkOS is disclosed. With a sign-in host configured (`WORKSHOP_AUTH_ORIGIN`) both name it as the other place the short-lived cookies are set.',
      },
    },
  },
  args: { signInHost: 'auth.konf.app' },
  tags: ['autodocs'],
} satisfies Meta<typeof WorkshopSignInCookieNote>

export default meta
type Story = StoryObj<typeof meta>

const inCookiesSection: Story['decorators'] = [
  (Story) => (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        <strong>Authentication &amp; Sessions:</strong> We use secure HTTP
        cookies to maintain your login session and remember your preferences.
      </p>
      <Story />
    </div>
  ),
]

const inDataList: Story['decorators'] = [
  (Story) => (
    <div className="max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
      <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
        Workshop Registration
      </h3>
      <ul className="mt-3 space-y-1 text-sm text-amber-700 dark:text-amber-300">
        <li>• WorkOS User ID (unique authentication identifier)</li>
        <Story />
      </ul>
    </div>
  ),
]

/** A sign-in host is configured: the note names it. */
export const WithSignInHost: Story = {
  decorators: inCookiesSection,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Workshop sign-in:/).parentElement,
    ).toHaveTextContent(
      "short-lived cookies exist on this site and on the platform's sign-in host (auth.konf.app); they expire within ten minutes",
    )
  },
}

/** Every host signs attendees in on itself: no other host is named. */
export const WithoutSignInHost: Story = {
  decorators: inCookiesSection,
  args: { signInHost: null },
  play: async ({ canvasElement }) => {
    const note =
      within(canvasElement).getByText(/Workshop sign-in:/).parentElement
    await expect(note).toHaveTextContent(
      'short-lived cookies exist on this site; they expire within ten minutes',
    )
    await expect(note).not.toHaveTextContent('sign-in host')
  },
}

export const Dark: Story = {
  decorators: inCookiesSection,
  globals: { theme: 'dark' },
}

export const Mobile: Story = {
  decorators: inCookiesSection,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    // The host name is one long word: it must not push the page wide.
    const page = canvasElement.ownerDocument.documentElement
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  },
}

/** The line in the list of workshop participant data, where WorkOS is disclosed. */
export const DataListItem: Story = {
  decorators: inDataList,
  render: (args) => <WorkshopSessionCookieItem {...args} />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/A sign-in cookie on this site/),
    ).toHaveTextContent(
      "on this site and on the platform's sign-in host (auth.konf.app) while you sign in or sign out",
    )
  },
}

export const DataListItemDark: Story = {
  ...DataListItem,
  globals: { theme: 'dark' },
}
